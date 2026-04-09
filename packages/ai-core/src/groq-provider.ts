import type {
  CanonicalBrief,
  ContextInsight,
  CritiqueReport,
  FileSummary,
  ReviewPlan,
  RiskFinding,
  SecurityFinding,
  TestFinding
} from "../../shared/src/index";
import { z } from "zod";
import {
  canonicalBriefSchema,
  contextInsightSchema,
  critiqueReportSchema,
  fileSummarySchema,
  reviewPlanSchema,
  riskFindingSchema,
  securityFindingSchema,
  testFindingSchema
} from "./contracts";
import { HeuristicAiProvider } from "./heuristic-provider";
import {
  contextMessages,
  critiqueMessages,
  fileSummaryMessages,
  plannerMessages,
  riskMessages,
  securityMessages,
  synthesisMessages,
  testingMessages
} from "./prompts";
import type { AiProvider, AnalysisContext } from "./provider";

interface GroqResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

function parser<T>(schema: { parse(data: unknown): unknown }) {
  return schema as { parse(data: unknown): T };
}

export class GroqAiProvider implements AiProvider {
  name = "groq-live";
  private readonly fallback = new HeuristicAiProvider();
  private readonly apiKey: string;
  private readonly modelId: string;

  constructor(apiKey = process.env.GROQ_API_KEY, modelId = process.env.GROQ_MODEL_ID ?? "llama-3.3-70b-versatile") {
    if (!apiKey) {
      throw new Error("Missing GROQ_API_KEY for live AI mode.");
    }
    this.apiKey = apiKey;
    this.modelId = modelId;
  }

  async planReview(context: AnalysisContext): Promise<ReviewPlan> {
    return this.callJson<ReviewPlan>(parser<ReviewPlan>(reviewPlanSchema), plannerMessages(context), () =>
      this.fallback.planReview(context)
    );
  }

  async collectContext(context: AnalysisContext, reviewPlan: ReviewPlan): Promise<ContextInsight> {
    return this.callJson<ContextInsight>(parser<ContextInsight>(contextInsightSchema), contextMessages(context, reviewPlan), () =>
      this.fallback.collectContext(context, reviewPlan)
    );
  }

  async reviewSecurity(
    context: AnalysisContext,
    reviewPlan: ReviewPlan,
    contextInsight: ContextInsight
  ): Promise<SecurityFinding[]> {
    return this.callJson<SecurityFinding[]>(
      parser<SecurityFinding[]>(z.array(securityFindingSchema)),
      securityMessages(context, reviewPlan, contextInsight),
      () => this.fallback.reviewSecurity(context, reviewPlan, contextInsight)
    );
  }

  async analyzeFiles(
    context: AnalysisContext,
    reviewPlan: ReviewPlan,
    contextInsight: ContextInsight
  ): Promise<FileSummary[]> {
    return this.callJson<FileSummary[]>(
      parser<FileSummary[]>(z.array(fileSummarySchema)),
      fileSummaryMessages(context, reviewPlan, contextInsight),
      () => this.fallback.analyzeFiles(context, reviewPlan, contextInsight)
    );
  }

  async reviewRisks(
    context: AnalysisContext,
    fileSummaries: FileSummary[],
    reviewPlan: ReviewPlan,
    contextInsight: ContextInsight
  ): Promise<RiskFinding[]> {
    return this.callJson<RiskFinding[]>(
      parser<RiskFinding[]>(z.array(riskFindingSchema)),
      riskMessages(context, fileSummaries, reviewPlan, contextInsight, context.securityFindings),
      () => this.fallback.reviewRisks(context, fileSummaries, reviewPlan, contextInsight)
    );
  }

  async planTesting(
    context: AnalysisContext,
    fileSummaries: FileSummary[],
    reviewPlan: ReviewPlan,
    contextInsight: ContextInsight
  ): Promise<TestFinding[]> {
    return this.callJson<TestFinding[]>(
      parser<TestFinding[]>(z.array(testFindingSchema)),
      testingMessages(context, fileSummaries, reviewPlan, contextInsight),
      () => this.fallback.planTesting(context, fileSummaries, reviewPlan, contextInsight)
    );
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
    return this.callJson<CanonicalBrief>(
      parser<CanonicalBrief>(canonicalBriefSchema),
      synthesisMessages(context, reviewPlan, contextInsight, fileSummaries, securityFindings, riskFindings, testFindings),
      () => this.fallback.synthesize(context, reviewPlan, contextInsight, fileSummaries, securityFindings, riskFindings, testFindings)
    );
  }

  async critique(
    context: AnalysisContext,
    reviewPlan: ReviewPlan,
    contextInsight: ContextInsight,
    brief: CanonicalBrief,
    riskFindings: RiskFinding[],
    testFindings: TestFinding[]
  ): Promise<CritiqueReport> {
    return this.callJson<CritiqueReport>(
      parser<CritiqueReport>(critiqueReportSchema),
      critiqueMessages(context, reviewPlan, contextInsight, brief, riskFindings, testFindings),
      () => this.fallback.critique(context, reviewPlan, contextInsight, brief, riskFindings, testFindings)
    );
  }

  private async callJson<T>(
    schema: { parse(data: unknown): T },
    messages: Array<{ role: "system" | "user"; content: string }>,
    fallback: () => Promise<T>
  ): Promise<T> {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.modelId,
          temperature: 0.15,
          messages
        })
      });

      if (!response.ok) {
        throw new Error(`Groq request failed with status ${response.status}`);
      }

      const json = (await response.json()) as GroqResponse;
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("Groq response did not include message content.");
      }
      const cleaned = content.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
      return schema.parse(JSON.parse(cleaned));
    } catch {
      return fallback();
    }
  }
}
