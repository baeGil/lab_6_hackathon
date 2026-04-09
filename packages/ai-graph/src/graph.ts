import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import {
  chooseStrategy,
  filterRelevantFiles,
  maskSensitiveTokens,
  rankImportantFiles
} from "../../ai-core/src/utils";
import type { AiProvider } from "../../ai-core/src/provider";
import type {
  AnalysisResult,
  NotificationPayload,
  PullRequestFile,
  PullRequestSnapshot,
  RepoConfig,
  RepoMemory,
  RiskFinding,
  SecurityFinding,
  TestFinding
} from "../../shared/src/index";

const GraphAnnotation = Annotation.Root({
  snapshot: Annotation<PullRequestSnapshot>(),
  config: Annotation<RepoConfig>(),
  memory: Annotation<RepoMemory>(),
  strategy: Annotation<"shallow" | "normal" | "deep" | "partial">(),
  workingFiles: Annotation<PullRequestFile[]>({
    reducer: (_left, right) => right,
    default: () => []
  }),
  importantFiles: Annotation<string[]>({
    reducer: (_left, right) => right,
    default: () => []
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
  brief: Annotation<AnalysisResult["brief"] | null>({
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

function renderPayload(
  channel: "github" | "slack" | "discord",
  snapshot: PullRequestSnapshot,
  brief: NonNullable<AnalysisResult["brief"]>
): NotificationPayload {
  return {
    channel,
    heading: `${snapshot.repoName} PR #${snapshot.prNumber}`,
    summary: [
      ...brief.whatChanged.slice(0, 2),
      `Attention: ${brief.attentionLevel}`,
      `Confidence: ${brief.confidence}`
    ],
    attentionLevel: brief.attentionLevel,
    confidence: brief.confidence,
    links: [
      { label: "Open PR", url: snapshot.url },
      { label: "Open Head Branch", url: `${snapshot.url}/files` }
    ]
  };
}

export async function runAnalysisGraph(input: GraphInput): Promise<AnalysisResult> {
  const provider = input.provider;

  const graph = new StateGraph(GraphAnnotation)
    .addNode("planner", async (state) => {
      const relevantFiles = filterRelevantFiles(state.snapshot.files, state.memory);
      return {
        workingFiles: relevantFiles,
        strategy: chooseStrategy(relevantFiles, state.config),
        importantFiles: rankImportantFiles(relevantFiles, state.memory)
      };
    })
    .addNode("contextCollector", async (state) => ({
      workingFiles:
        state.strategy === "partial"
          ? state.workingFiles.slice(0, state.config.maxFilesPerAnalysis)
          : state.workingFiles
    }))
    .addNode("securityAgent", async (state) => {
      const masked = maskSensitiveTokens(state.workingFiles, state.memory);
      return {
        workingFiles: masked.maskedFiles,
        securityFindings: masked.findings
      };
    })
    .addNode("codeUnderstandingAgent", async (state) => ({
      fileSummaries: await provider.analyzeFiles({
        snapshot: state.snapshot,
        files: state.workingFiles,
        memory: state.memory,
        securityFindings: state.securityFindings,
        importantFiles: state.importantFiles
      })
    }))
    .addNode("riskReviewerAgent", async (state) => ({
      riskFindings: await provider.reviewRisks(
        {
          snapshot: state.snapshot,
          files: state.workingFiles,
          memory: state.memory,
          securityFindings: state.securityFindings,
          importantFiles: state.importantFiles
        },
        state.fileSummaries
      )
    }))
    .addNode("testingAgent", async (state) => ({
      testFindings: await provider.planTesting(
        {
          snapshot: state.snapshot,
          files: state.workingFiles,
          memory: state.memory,
          securityFindings: state.securityFindings,
          importantFiles: state.importantFiles
        },
        state.fileSummaries
      )
    }))
    .addNode("synthesisAgent", async (state) => ({
      brief: await provider.synthesize(
        {
          snapshot: state.snapshot,
          files: state.workingFiles,
          memory: state.memory,
          securityFindings: state.securityFindings,
          importantFiles: state.importantFiles
        },
        state.fileSummaries,
        state.riskFindings,
        state.testFindings
      )
    }))
    .addNode("confidenceEscalationAgent", async (state) => {
      if (!state.brief) return {};
      const missingContext = [...state.brief.missingContext];
      let confidence = state.brief.confidence;
      if (state.strategy === "partial") {
        missingContext.push("Analysis ran in partial mode because the PR exceeded the free-tier review budget.");
        confidence = Math.max(0.35, confidence - 0.15);
      }
      return {
        brief: {
          ...state.brief,
          confidence: Number(confidence.toFixed(2)),
          missingContext
        }
      };
    })
    .addNode("personaComposerAgent", async (state) => {
      if (!state.brief) return {};
      return {
        githubPayload: renderPayload("github", state.snapshot, state.brief),
        slackPayload: state.config.notifySlack ? renderPayload("slack", state.snapshot, state.brief) : null,
        discordPayload: state.config.notifyDiscord
          ? renderPayload("discord", state.snapshot, state.brief)
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
    .addEdge("synthesisAgent", "confidenceEscalationAgent")
    .addEdge("confidenceEscalationAgent", "personaComposerAgent")
    .addEdge("personaComposerAgent", END)
    .compile();

  const result = await graph.invoke({
    snapshot: input.snapshot,
    config: input.config,
    memory: input.memory
  });

  if (!result.brief || !result.githubPayload) {
    throw new Error("Analysis graph failed to produce a canonical brief.");
  }

  return {
    snapshot: result.snapshot,
    strategy: result.strategy,
    securityFindings: result.securityFindings,
    fileSummaries: result.fileSummaries,
    riskFindings: result.riskFindings,
    testFindings: result.testFindings,
    brief: result.brief,
    githubPayload: result.githubPayload,
    slackPayload: result.slackPayload,
    discordPayload: result.discordPayload
  };
}
