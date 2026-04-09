import type {
  AttentionLevel,
  CanonicalBrief,
  ContextInsight,
  CritiqueReport,
  FileSummary,
  PullRequestType,
  ReviewPlan,
  RiskFinding,
  SecurityFinding,
  TestFinding
} from "../../shared/src/index";
import { classifyPullRequest, deriveEventMode } from "./utils";
import type { AiProvider, AnalysisContext } from "./provider";

function inferBusinessIntent(path: string, patch: string) {
  const normalized = `${path}\n${patch}`.toLowerCase();
  if (/auth|token|session|permission/.test(normalized)) return "Strengthens authentication, authorization, or request validation flow.";
  if (/migration|schema|db/.test(normalized)) return "Changes data shape or persistence behavior that may affect rollout safety.";
  if (/config|env|deploy/.test(normalized)) return "Adjusts environment or deployment behavior that can change runtime defaults.";
  if (/test|spec/.test(normalized)) return "Improves verification coverage for the touched area.";
  if (/docs|readme|\.md$/.test(normalized)) return "Clarifies documentation or developer guidance.";
  return "Updates application behavior in the touched module.";
}

function inferReviewerFocus(path: string, patch: string, prType: PullRequestType) {
  const normalized = `${path}\n${patch}`.toLowerCase();
  if (/auth|permission|role/.test(normalized)) return "Verify permission boundaries, invalid token handling, and fallback flows.";
  if (/migration|schema|db/.test(normalized)) return "Check backward compatibility, data assumptions, and rollback safety.";
  if (/config|env/.test(normalized)) return "Validate defaults, rollout assumptions, and environment-specific edge cases.";
  if (prType === "dependency") return "Confirm transitive behavior changes and runtime compatibility for the upgraded dependency.";
  return "Review changed branches, input validation, and edge cases introduced by the diff.";
}

function inferChangeType(path: string, patch: string): FileSummary["changeType"] {
  const normalized = `${path}\n${patch}`.toLowerCase();
  if (/docs|readme|\.md$/.test(normalized)) return "docs";
  if (/config|env|yaml|yml|json/.test(normalized)) return "config";
  if (/migration|schema|db|sql/.test(normalized)) return "data";
  if (/test|spec/.test(normalized)) return "test";
  if (/api|route|controller/.test(normalized)) return "api";
  return "logic";
}

function severityFromContext(path: string, patch: string): AttentionLevel {
  const normalized = `${path}\n${patch}`.toLowerCase();
  if (/auth|secret|permission|billing|migration|delete|rollback/.test(normalized)) return "high";
  if (/config|cache|queue|retry|state|concurrency|parallel|timeout/.test(normalized)) return "medium";
  return "low";
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function computeBaseConfidence(context: AnalysisContext, reviewPlan: ReviewPlan) {
  let confidence = 0.9;
  if (reviewPlan.strategy === "partial") confidence -= 0.2;
  if (reviewPlan.strategy === "deep") confidence -= 0.05;
  if (context.files.length > 8) confidence -= 0.08;
  if (reviewPlan.requiresExtraContext) confidence -= 0.05;
  return Math.max(0.35, Number(confidence.toFixed(2)));
}

export class HeuristicAiProvider implements AiProvider {
  name = "heuristic-groq-compatible";

  async planReview(context: AnalysisContext): Promise<ReviewPlan> {
    const prType = classifyPullRequest(context.snapshot, context.files);
    const eventMode = deriveEventMode(context.snapshot.eventType);
    const risky = prType === "security-sensitive" || prType === "migration" || prType === "config";
    const strategy =
      eventMode === "closeout"
        ? "shallow"
        : risky
          ? context.files.length > 12
            ? "partial"
            : "deep"
          : context.files.length > 8
            ? "normal"
            : "shallow";

    return {
      prType,
      eventMode,
      strategy,
      requiresExtraContext: risky || context.snapshot.reviewers.length === 0 || Boolean(context.snapshot.body?.trim()) === false,
      focusAreas: uniqueStrings([
        ...context.importantFiles.map((path) => path.split("/")[0] ?? path),
        ...context.memory.highRiskModules.slice(0, 2)
      ]).slice(0, 5),
      reasoning:
        eventMode === "closeout"
          ? "This event closes the review loop, so the system should summarize the outcome without over-analyzing unchanged code."
          : risky
            ? "The pull request touches sensitive or high-impact areas, so the workflow should bias toward deeper review."
            : "The pull request appears operationally routine, so a lighter review strategy is enough unless other agents escalate it.",
      shouldNotify: context.snapshot.eventType !== "review_request_removed"
    };
  }

  async collectContext(context: AnalysisContext, reviewPlan: ReviewPlan): Promise<ContextInsight> {
    const relatedModules = uniqueStrings([
      ...context.files.map((file) => file.path.split("/")[0] ?? file.path),
      ...reviewPlan.focusAreas
    ]).slice(0, 5);
    const keyQuestions: string[] = [];
    const missingContext: string[] = [];

    if (!context.snapshot.body?.trim()) {
      missingContext.push("The PR description is empty, so reviewer intent must be inferred from the diff.");
      keyQuestions.push("Does the author have rollout constraints or business rules that are not visible in the diff?");
    }
    if (reviewPlan.prType === "migration") {
      keyQuestions.push("Is the migration backward compatible for old data and older application versions?");
    }
    if (reviewPlan.prType === "config" || reviewPlan.prType === "infra") {
      keyQuestions.push("Are environment defaults and rollout assumptions documented outside this PR?");
    }
    if (context.snapshot.reviewers.length === 0) {
      missingContext.push("No reviewers are currently assigned, so sensitive paths may not yet have an obvious owner.");
    }

    return {
      summary:
        reviewPlan.eventMode === "closeout"
          ? "This run should summarize the final state of the PR and preserve key risks for auditability."
          : "This run should focus on reviewer-ready insights, especially around the most sensitive changed modules.",
      relatedModules,
      keyQuestions: keyQuestions.slice(0, 4),
      missingContext
    };
  }

  async reviewSecurity(
    context: AnalysisContext,
    reviewPlan: ReviewPlan,
    contextInsight: ContextInsight
  ): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];
    for (const file of context.files) {
      const normalized = `${file.path}\n${file.patch}`.toLowerCase();
      if (/auth|permission|role|session|token/.test(normalized)) {
        findings.push({
          path: file.path,
          kind: "auth-risk",
          detail: "This change touches authentication or authorization paths and deserves a focused human review."
        });
      }
      if (/package\.json|pnpm-lock|yarn\.lock|requirements|go\.mod/.test(normalized)) {
        findings.push({
          path: file.path,
          kind: "dependency-risk",
          detail: "Dependency-related changes can alter runtime behavior outside the immediate diff."
        });
      }
      if ((reviewPlan.prType === "config" || reviewPlan.prType === "infra") && /config|env|yaml|json/.test(normalized)) {
        findings.push({
          path: file.path,
          kind: "config-risk",
          detail: "Configuration changes should be verified against environment defaults and rollout plans."
        });
      }
    }

    return uniqueStrings(
      findings.map((finding) => `${finding.path}:${finding.kind}:${finding.detail}`)
    ).map((serialized) => {
      const [path, kind, ...detail] = serialized.split(":");
      return {
        path,
        kind: kind as SecurityFinding["kind"],
        detail: detail.join(":")
      };
    });
  }

  async analyzeFiles(
    context: AnalysisContext,
    reviewPlan: ReviewPlan,
    _contextInsight: ContextInsight
  ): Promise<FileSummary[]> {
    return context.files.map((file) => ({
      path: file.path,
      summary: `Touches ${file.path} with ${file.additions} additions and ${file.deletions} deletions, mainly affecting ${inferChangeType(file.path, file.patch)} behavior.`,
      businessIntent: inferBusinessIntent(file.path, file.patch),
      reviewerFocus: inferReviewerFocus(file.path, file.patch, reviewPlan.prType),
      changeType: inferChangeType(file.path, file.patch)
    }));
  }

  async reviewRisks(
    context: AnalysisContext,
    fileSummaries: FileSummary[],
    reviewPlan: ReviewPlan,
    _contextInsight: ContextInsight
  ): Promise<RiskFinding[]> {
    const results: RiskFinding[] = [];
    for (const summary of fileSummaries) {
      const source = context.files.find((file) => file.path === summary.path);
      if (!source) continue;
      const severity = severityFromContext(source.path, source.patch);
      const hasSecuritySignal = context.securityFindings.some((item) => item.path === source.path);
      if (severity === "low" && !hasSecuritySignal && reviewPlan.prType !== "migration") {
        continue;
      }

      const category: RiskFinding["category"] =
        reviewPlan.prType === "migration"
          ? "breaking-change"
          : summary.changeType === "config"
            ? "configuration"
            : /auth|permission/.test(source.path)
              ? "security"
              : /queue|async|worker|parallel|concurrency/.test(`${source.path}\n${source.patch}`.toLowerCase())
                ? "concurrency"
                : "logic";

      results.push({
        path: source.path,
        severity,
        category,
        summary:
          severity === "high"
            ? "This change touches a sensitive area with a realistic regression or rollout risk."
            : "This change modifies meaningful behavior and should receive targeted human review.",
        reviewerAction:
          severity === "high"
            ? "Inspect edge cases, backward compatibility, and failure handling before approval."
            : "Verify the main code path and one non-happy-path scenario."
      });
    }
    return results;
  }

  async planTesting(
    context: AnalysisContext,
    _fileSummaries: FileSummary[],
    reviewPlan: ReviewPlan,
    _contextInsight: ContextInsight
  ): Promise<TestFinding[]> {
    return context.files.slice(0, 5).map((file) => {
      const priority: AttentionLevel =
        reviewPlan.prType === "security-sensitive" || reviewPlan.prType === "migration" ? "high" : "medium";
      return {
        path: file.path,
        recommendation: file.path.includes("auth")
          ? "Exercise login, logout, invalid token, expired token, and permission downgrade scenarios."
          : reviewPlan.prType === "config" || reviewPlan.prType === "infra"
            ? "Run one environment-aware validation and one manual sanity check against expected defaults."
            : "Cover the changed branches with targeted regression tests and one manual smoke test.",
        testType:
          reviewPlan.prType === "config" || reviewPlan.prType === "infra"
            ? "manual"
            : file.path.includes("test")
              ? "regression"
              : "integration",
        priority
      };
    });
  }

  async synthesize(
    context: AnalysisContext,
    reviewPlan: ReviewPlan,
    contextInsight: ContextInsight,
    fileSummaries: FileSummary[],
    securityFindings: SecurityFinding[],
    riskFindings: RiskFinding[],
    testFindings: TestFinding[]
  ): Promise<CanonicalBrief> {
    const attentionLevel: AttentionLevel = riskFindings.some((item) => item.severity === "high")
      ? "high"
      : riskFindings.some((item) => item.severity === "medium")
        ? "medium"
        : securityFindings.length > 0
          ? "medium"
          : "low";
    const confidenceBase = computeBaseConfidence(context, reviewPlan);
    const missingContext = uniqueStrings([...contextInsight.missingContext]);
    const reviewerPosture =
      attentionLevel === "high" ? "senior-review" : attentionLevel === "medium" ? "careful-review" : "monitor";
    const escalationNote =
      attentionLevel === "high"
        ? "This PR touches high-risk behavior. A careful human review of the highlighted files is strongly recommended."
        : null;

    return {
      title: `${context.snapshot.repoName} PR #${context.snapshot.prNumber}: ${context.snapshot.title}`,
      eventSummary: `Triggered by \`${context.snapshot.eventType}\` and handled as \`${reviewPlan.eventMode}\`.`,
      whatChanged: fileSummaries.slice(0, 5).map((item) => `${item.path}: ${item.summary}`),
      whyItMatters: uniqueStrings(fileSummaries.slice(0, 3).map((item) => item.businessIntent)),
      reviewerFocus: fileSummaries.slice(0, 4).map((item) => `${item.path}: ${item.reviewerFocus}`),
      attentionLevel,
      testImpact: testFindings.slice(0, 4).map((item) => `${item.path}: ${item.recommendation}`),
      confidence: confidenceBase,
      missingContext,
      importantFiles: context.importantFiles,
      reviewerPosture,
      escalationNote,
      nextActions: uniqueStrings([
        ...riskFindings.slice(0, 3).map((item) => item.reviewerAction ?? item.summary),
        ...testFindings.slice(0, 2).map((item) => item.recommendation)
      ]).slice(0, 5),
      disclaimer: "AI-generated summary. Use it to triage the review, not to replace human code review."
    };
  }

  async critique(
    context: AnalysisContext,
    reviewPlan: ReviewPlan,
    contextInsight: ContextInsight,
    brief: CanonicalBrief,
    riskFindings: RiskFinding[],
    testFindings: TestFinding[]
  ): Promise<CritiqueReport> {
    let confidence = brief.confidence;
    const missingContext = uniqueStrings([...brief.missingContext, ...contextInsight.missingContext]);

    if (reviewPlan.strategy === "partial") confidence -= 0.15;
    if (reviewPlan.requiresExtraContext) confidence -= 0.05;
    if (riskFindings.length === 0 && context.files.length > 6) confidence -= 0.05;
    if (testFindings.length === 0) confidence -= 0.03;

    const reviewerPosture =
      brief.attentionLevel === "high"
        ? "senior-review"
        : brief.attentionLevel === "medium" || reviewPlan.strategy === "partial"
          ? "careful-review"
          : "monitor";

    const escalationNote =
      brief.attentionLevel === "high"
        ? "Escalate review to a domain owner or senior reviewer before merging."
        : reviewPlan.strategy === "partial"
          ? "Analysis was partial. Review the listed important files manually before relying on this summary."
          : null;

    return {
      confidence: Math.max(0.3, Number(confidence.toFixed(2))),
      reviewerPosture,
      missingContext,
      escalationNote,
      publishToChannels: reviewPlan.shouldNotify
    };
  }
}
