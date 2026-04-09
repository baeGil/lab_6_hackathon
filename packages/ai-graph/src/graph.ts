import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import {
  chooseStrategy,
  deriveFocusAreas,
  filterRelevantFiles,
  maskSensitiveTokens,
  mergeStrategies,
  rankImportantFiles,
  selectFilesForPlan
} from "../../ai-core/src/utils";
import type { AiProvider, AnalysisContext } from "../../ai-core/src/provider";
import type {
  AnalysisResult,
  CanonicalBrief,
  ContextInsight,
  CritiqueReport,
  NotificationPayload,
  PullRequestFile,
  PullRequestSnapshot,
  RepoConfig,
  RepoMemory,
  ReviewPlan,
  RiskFinding,
  SecurityFinding,
  TestFinding
} from "../../shared/src/index";

const GraphAnnotation = Annotation.Root({
  snapshot: Annotation<PullRequestSnapshot>(),
  config: Annotation<RepoConfig>(),
  memory: Annotation<RepoMemory>(),
  reviewPlan: Annotation<ReviewPlan | null>({
    reducer: (_left, right) => right,
    default: () => null
  }),
  workingFiles: Annotation<PullRequestFile[]>({
    reducer: (_left, right) => right,
    default: () => []
  }),
  importantFiles: Annotation<string[]>({
    reducer: (_left, right) => right,
    default: () => []
  }),
  contextInsight: Annotation<ContextInsight | null>({
    reducer: (_left, right) => right,
    default: () => null
  }),
  securityFindings: Annotation<SecurityFinding[]>({
    reducer: (_left, right) => right,
    default: () => []
  }),
  fileSummaries: Annotation<AnalysisResult["fileSummaries"]>({
    reducer: (_left, right) => right,
    default: () => []
  }),
  riskFindings: Annotation<RiskFinding[]>({
    reducer: (_left, right) => right,
    default: () => []
  }),
  testFindings: Annotation<TestFinding[]>({
    reducer: (_left, right) => right,
    default: () => []
  }),
  brief: Annotation<CanonicalBrief | null>({
    reducer: (_left, right) => right,
    default: () => null
  }),
  critique: Annotation<CritiqueReport | null>({
    reducer: (_left, right) => right,
    default: () => null
  }),
  githubPayload: Annotation<NotificationPayload | null>({
    reducer: (_left, right) => right,
    default: () => null
  }),
  slackPayload: Annotation<NotificationPayload | null>({
    reducer: (_left, right) => right,
    default: () => null
  }),
  discordPayload: Annotation<NotificationPayload | null>({
    reducer: (_left, right) => right,
    default: () => null
  })
});

export interface GraphInput {
  snapshot: PullRequestSnapshot;
  config: RepoConfig;
  memory: RepoMemory;
  provider: AiProvider;
}

function makeContext(state: {
  snapshot: PullRequestSnapshot;
  memory: RepoMemory;
  workingFiles: PullRequestFile[];
  importantFiles: string[];
  securityFindings: SecurityFinding[];
}): AnalysisContext {
  return {
    snapshot: state.snapshot,
    files: state.workingFiles,
    memory: state.memory,
    securityFindings: state.securityFindings,
    importantFiles: state.importantFiles
  };
}

function renderPayload(
  channel: "github" | "slack" | "discord",
  snapshot: PullRequestSnapshot,
  brief: CanonicalBrief,
  critique: CritiqueReport
): NotificationPayload {
  const summary = [
    brief.eventSummary,
    ...brief.whatChanged.slice(0, 2),
    `Attention: ${brief.attentionLevel}`,
    `Reviewer posture: ${brief.reviewerPosture}`,
    `Confidence: ${brief.confidence}`
  ];
  if (brief.escalationNote) {
    summary.push(`Escalation: ${brief.escalationNote}`);
  }

  return {
    channel,
    heading: `${snapshot.repoName} PR #${snapshot.prNumber}`,
    summary,
    attentionLevel: brief.attentionLevel,
    confidence: critique.confidence,
    links: [
      { label: "Open PR", url: snapshot.url },
      { label: "Open Files", url: `${snapshot.url}/files` },
      { label: "Open Checks", url: `${snapshot.url}/checks` }
    ]
  };
}

export async function runAnalysisGraph(input: GraphInput): Promise<AnalysisResult> {
  const provider = input.provider;

  const graph = new StateGraph(GraphAnnotation)
    .addNode("planner", async (state) => {
      const relevantFiles = filterRelevantFiles(state.snapshot.files, state.memory);
      const importantFiles = rankImportantFiles(relevantFiles, state.memory);
      const deterministicStrategy = chooseStrategy(relevantFiles, state.config);
      const planningContext: AnalysisContext = {
        snapshot: state.snapshot,
        files: relevantFiles,
        memory: state.memory,
        securityFindings: [],
        importantFiles
      };
      const agentPlan = await provider.planReview(planningContext);
      const reviewPlan: ReviewPlan = {
        ...agentPlan,
        strategy: mergeStrategies(agentPlan.strategy, deterministicStrategy),
        focusAreas: agentPlan.focusAreas.length > 0 ? agentPlan.focusAreas : deriveFocusAreas(relevantFiles, state.memory)
      };
      return {
        workingFiles: relevantFiles,
        importantFiles,
        reviewPlan
      };
    })
    .addNode("contextCollector", async (state) => {
      if (!state.reviewPlan) return {};
      const selectedFiles = selectFilesForPlan(state.workingFiles, state.reviewPlan, state.config);
      const contextInsight = await provider.collectContext(
        {
          snapshot: state.snapshot,
          files: selectedFiles,
          memory: state.memory,
          securityFindings: [],
          importantFiles: state.importantFiles
        },
        state.reviewPlan
      );
      return {
        workingFiles: selectedFiles,
        contextInsight
      };
    })
    .addNode("securityAgent", async (state) => {
      if (!state.reviewPlan || !state.contextInsight) return {};
      const masked = maskSensitiveTokens(state.workingFiles, state.memory);
      const semanticFindings = await provider.reviewSecurity(
        {
          snapshot: state.snapshot,
          files: masked.maskedFiles,
          memory: state.memory,
          securityFindings: masked.findings,
          importantFiles: state.importantFiles
        },
        state.reviewPlan,
        state.contextInsight
      );
      return {
        workingFiles: masked.maskedFiles,
        securityFindings: [...masked.findings, ...semanticFindings]
      };
    })
    .addNode("codeUnderstandingAgent", async (state) => {
      if (!state.reviewPlan || !state.contextInsight) return {};
      return {
        fileSummaries: await provider.analyzeFiles(
          makeContext(state),
          state.reviewPlan,
          state.contextInsight
        )
      };
    })
    .addNode("riskReviewerAgent", async (state) => {
      if (!state.reviewPlan || !state.contextInsight) return {};
      return {
        riskFindings: await provider.reviewRisks(
          makeContext(state),
          state.fileSummaries,
          state.reviewPlan,
          state.contextInsight
        )
      };
    })
    .addNode("testingAgent", async (state) => {
      if (!state.reviewPlan || !state.contextInsight) return {};
      return {
        testFindings: await provider.planTesting(
          makeContext(state),
          state.fileSummaries,
          state.reviewPlan,
          state.contextInsight
        )
      };
    })
    .addNode("synthesisAgent", async (state) => {
      if (!state.reviewPlan || !state.contextInsight) return {};
      return {
        brief: await provider.synthesize(
          makeContext(state),
          state.reviewPlan,
          state.contextInsight,
          state.fileSummaries,
          state.securityFindings,
          state.riskFindings,
          state.testFindings
        )
      };
    })
    .addNode("criticAgent", async (state) => {
      if (!state.reviewPlan || !state.contextInsight || !state.brief) return {};
      const critique = await provider.critique(
        makeContext(state),
        state.reviewPlan,
        state.contextInsight,
        state.brief,
        state.riskFindings,
        state.testFindings
      );

      return {
        critique,
        brief: {
          ...state.brief,
          confidence: critique.confidence,
          missingContext: critique.missingContext,
          reviewerPosture: critique.reviewerPosture,
          escalationNote: critique.escalationNote ?? state.brief.escalationNote
        }
      };
    })
    .addNode("personaComposerAgent", async (state) => {
      if (!state.brief || !state.reviewPlan || !state.critique) return {};
      const publishToChannels = state.critique.publishToChannels;
      return {
        githubPayload: renderPayload("github", state.snapshot, state.brief, state.critique),
        slackPayload:
          state.config.notifySlack && publishToChannels
            ? renderPayload("slack", state.snapshot, state.brief, state.critique)
            : null,
        discordPayload:
          state.config.notifyDiscord && publishToChannels
            ? renderPayload("discord", state.snapshot, state.brief, state.critique)
            : null
      };
    })
    .addEdge(START, "planner")
    .addEdge("planner", "contextCollector")
    .addEdge("contextCollector", "securityAgent")
    .addEdge("securityAgent", "codeUnderstandingAgent")
    .addEdge("codeUnderstandingAgent", "riskReviewerAgent")
    .addEdge("riskReviewerAgent", "testingAgent")
    .addEdge("testingAgent", "synthesisAgent")
    .addEdge("synthesisAgent", "criticAgent")
    .addEdge("criticAgent", "personaComposerAgent")
    .addEdge("personaComposerAgent", END)
    .compile();

  const result = await graph.invoke({
    snapshot: input.snapshot,
    config: input.config,
    memory: input.memory
  });

  if (!result.brief || !result.githubPayload || !result.reviewPlan || !result.contextInsight || !result.critique) {
    throw new Error("Analysis graph failed to produce a canonical brief.");
  }

  return {
    snapshot: result.snapshot,
    reviewPlan: result.reviewPlan,
    contextInsight: result.contextInsight,
    strategy: result.reviewPlan.strategy,
    securityFindings: result.securityFindings,
    fileSummaries: result.fileSummaries,
    riskFindings: result.riskFindings,
    testFindings: result.testFindings,
    brief: result.brief,
    critique: result.critique,
    githubPayload: result.githubPayload,
    slackPayload: result.slackPayload,
    discordPayload: result.discordPayload
  };
}
