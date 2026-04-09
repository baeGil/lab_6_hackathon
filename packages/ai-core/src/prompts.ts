import type {
  CanonicalBrief,
  ContextInsight,
  FileSummary,
  ReviewPlan,
  RiskFinding,
  SecurityFinding,
  TestFinding
} from "../../shared/src/index";
import type { AnalysisContext } from "./provider";

export interface AgentMessage {
  role: "system" | "user";
  content: string;
}

export const PROMPT_VERSION = "v2-agent-core";

function jsonOnlyInstruction() {
  return "Return valid JSON only. Do not wrap JSON in markdown. Do not add explanation outside the JSON.";
}

function agentSystem(role: string, objective: string, extraRules: string[]) {
  return [
    `You are the ${role} inside an AI pull request review system.`,
    `Objective: ${objective}`,
    jsonOnlyInstruction(),
    "Stay grounded in the provided evidence only.",
    "If evidence is missing, say so explicitly in the structured output.",
    "Never claim the change is approved, safe to merge, or issue-free.",
    ...extraRules
  ].join(" ");
}

function basePayload(context: AnalysisContext) {
  return {
    promptVersion: PROMPT_VERSION,
    repo: context.snapshot.repoName,
    eventType: context.snapshot.eventType,
    prTitle: context.snapshot.title,
    prBody: context.snapshot.body ?? "",
    labels: context.snapshot.labels,
    reviewers: context.snapshot.reviewers,
    importantFiles: context.importantFiles,
    securityFindings: context.securityFindings,
    memory: context.memory,
    files: context.files.map((file) => ({
      path: file.path,
      additions: file.additions,
      deletions: file.deletions,
      patch: file.patch
    }))
  };
}

export function plannerMessages(context: AnalysisContext): AgentMessage[] {
  return [
    {
      role: "system",
      content: agentSystem("Planner Agent", "Classify the pull request and choose the safest review strategy.", [
        "Pick a strategy that fits both risk and review budget.",
        "Prefer deep review for auth, billing, config, migration, and security-sensitive changes.",
        "Use state-refresh for reviewer/status events and closeout for merged or closed events."
      ])
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "Produce a review plan.",
        schema: {
          prType:
            "feature|bugfix|refactor|infra|config|migration|security-sensitive|dependency|docs-only|test-only|mixed",
          eventMode: "full-review|state-refresh|closeout",
          strategy: "shallow|normal|deep|partial",
          requiresExtraContext: "boolean",
          focusAreas: ["string"],
          reasoning: "string",
          shouldNotify: "boolean"
        },
        ...basePayload(context)
      })
    }
  ];
}

export function contextMessages(context: AnalysisContext, reviewPlan: ReviewPlan): AgentMessage[] {
  return [
    {
      role: "system",
      content: agentSystem("Context Retrieval Agent", "Summarize the additional context the other agents need.", [
        "Do not invent repository files or CI results that were not provided.",
        "Use missingContext and keyQuestions to highlight what a human should verify next.",
        "Be frugal: focus on high-risk modules, reviewer confusion, and missing rollout details."
      ])
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "Produce a context insight packet.",
        schema: {
          summary: "string",
          relatedModules: ["string"],
          keyQuestions: ["string"],
          missingContext: ["string"]
        },
        reviewPlan,
        ...basePayload(context)
      })
    }
  ];
}

export function securityMessages(
  context: AnalysisContext,
  reviewPlan: ReviewPlan,
  contextInsight: ContextInsight
): AgentMessage[] {
  return [
    {
      role: "system",
      content: agentSystem("Security Agent", "Identify security-sensitive review concerns without overstating certainty.", [
        "Look for auth, permission, secret, dependency, configuration, and rollout risk.",
        "Never declare code secure or insecure as a final verdict.",
        "Emit findings only when a reviewer should pay extra attention."
      ])
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "Produce an array of security findings.",
        schema: [
          {
            path: "string",
            kind: "masked-secret|sensitive-module|config-risk|auth-risk|dependency-risk",
            detail: "string"
          }
        ],
        reviewPlan,
        contextInsight,
        ...basePayload(context)
      })
    }
  ];
}

export function fileSummaryMessages(
  context: AnalysisContext,
  reviewPlan: ReviewPlan,
  contextInsight: ContextInsight
): AgentMessage[] {
  return [
    {
      role: "system",
      content: agentSystem("Code Understanding Agent", "Explain what each important file change is trying to do.", [
        "Distinguish implementation details from user-facing or system-facing impact.",
        "Reviewer focus should point to a concrete edge case, contract, or branch.",
        "Use changeType to classify the main kind of change."
      ])
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "Produce an array of file summaries.",
        schema: [
          {
            path: "string",
            summary: "string",
            businessIntent: "string",
            reviewerFocus: "string",
            changeType: "logic|api|config|data|test|docs"
          }
        ],
        reviewPlan,
        contextInsight,
        ...basePayload(context)
      })
    }
  ];
}

export function riskMessages(
  context: AnalysisContext,
  fileSummaries: FileSummary[],
  reviewPlan: ReviewPlan,
  contextInsight: ContextInsight,
  securityFindings: SecurityFinding[]
): AgentMessage[] {
  return [
    {
      role: "system",
      content: agentSystem("Risk Reviewer Agent", "Call out the review risks that need human attention.", [
        "Prefer concrete reviewer actions over generic warnings.",
        "Use severity to represent review attention, not merge approval.",
        "When uncertain, keep severity lower and mention the uncertainty in the summary."
      ])
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "Produce an array of risk findings.",
        schema: [
          {
            path: "string",
            severity: "low|medium|high",
            category: "logic|security|performance|breaking-change|configuration|concurrency",
            summary: "string",
            reviewerAction: "string"
          }
        ],
        reviewPlan,
        contextInsight,
        fileSummaries,
        explicitSecurityFindings: securityFindings,
        ...basePayload(context)
      })
    }
  ];
}

export function testingMessages(
  context: AnalysisContext,
  fileSummaries: FileSummary[],
  reviewPlan: ReviewPlan,
  contextInsight: ContextInsight
): AgentMessage[] {
  return [
    {
      role: "system",
      content: agentSystem("Testing Agent", "Translate the diff into the most valuable verification plan.", [
        "Bias toward realistic testing suggestions the team can act on immediately.",
        "Recommend manual checks when rollout or environment behavior matters.",
        "Use priority to help reviewers decide which checks matter most first."
      ])
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "Produce an array of test findings.",
        schema: [
          {
            path: "string",
            recommendation: "string",
            testType: "unit|integration|manual|regression",
            priority: "low|medium|high"
          }
        ],
        reviewPlan,
        contextInsight,
        fileSummaries,
        ...basePayload(context)
      })
    }
  ];
}

export function synthesisMessages(
  context: AnalysisContext,
  reviewPlan: ReviewPlan,
  contextInsight: ContextInsight,
  fileSummaries: FileSummary[],
  securityFindings: SecurityFinding[],
  riskFindings: RiskFinding[],
  testFindings: TestFinding[]
): AgentMessage[] {
  return [
    {
      role: "system",
      content: agentSystem("Synthesis Agent", "Combine all agent outputs into one reviewer-facing PR brief.", [
        "Keep it crisp but specific enough that a reviewer can act on it.",
        "Event summary should explain why this run happened now.",
        "Next actions should be concrete review or verification steps."
      ])
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "Produce a canonical brief.",
        schema: {
          title: "string",
          eventSummary: "string",
          whatChanged: ["string"],
          whyItMatters: ["string"],
          reviewerFocus: ["string"],
          attentionLevel: "low|medium|high",
          testImpact: ["string"],
          confidence: "number 0-1",
          missingContext: ["string"],
          importantFiles: ["string"],
          reviewerPosture: "monitor|careful-review|senior-review",
          escalationNote: "string|null",
          nextActions: ["string"],
          disclaimer: "string"
        },
        reviewPlan,
        contextInsight,
        fileSummaries,
        explicitSecurityFindings: securityFindings,
        riskFindings,
        testFindings,
        ...basePayload(context)
      })
    }
  ];
}

export function critiqueMessages(
  context: AnalysisContext,
  reviewPlan: ReviewPlan,
  contextInsight: ContextInsight,
  brief: CanonicalBrief,
  riskFindings: RiskFinding[],
  testFindings: TestFinding[]
): AgentMessage[] {
  return [
    {
      role: "system",
      content: agentSystem("Critic Agent", "Calibrate the final output before it is published to humans.", [
        "Lower confidence when analysis is partial, evidence is thin, or the PR touches risky areas.",
        "Use reviewerPosture to describe how careful the reviewer should be.",
        "publishToChannels should stay true unless the event is too low-signal to notify."
      ])
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "Produce a critique report.",
        schema: {
          confidence: "number 0-1",
          reviewerPosture: "monitor|careful-review|senior-review",
          missingContext: ["string"],
          escalationNote: "string|null",
          publishToChannels: "boolean"
        },
        reviewPlan,
        contextInsight,
        brief,
        riskFindings,
        testFindings,
        ...basePayload(context)
      })
    }
  ];
}
