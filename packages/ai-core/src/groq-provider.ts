import type {
  CanonicalBrief,
  FileSummary,
  RiskFinding,
  TestFinding
} from "../../shared/src/index";
import { HeuristicAiProvider } from "./heuristic-provider";
import { fileSummaryMessages, riskMessages, synthesisMessages, testingMessages } from "./prompts";
import type { AiProvider, AnalysisContext } from "./provider";

interface GroqResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
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

  async analyzeFiles(context: AnalysisContext): Promise<FileSummary[]> {
    const fallback = () => this.fallback.analyzeFiles(context);
    return this.callJson<FileSummary[]>(fileSummaryMessages(context), fallback);
  }

  async reviewRisks(context: AnalysisContext, fileSummaries: FileSummary[]): Promise<RiskFinding[]> {
    const fallback = () => this.fallback.reviewRisks(context, fileSummaries);
    return this.callJson<RiskFinding[]>(riskMessages(context, fileSummaries), fallback);
  }

  async planTesting(context: AnalysisContext, fileSummaries: FileSummary[]): Promise<TestFinding[]> {
    const fallback = () => this.fallback.planTesting(context, fileSummaries);
    return this.callJson<TestFinding[]>(testingMessages(context, fileSummaries), fallback);
  }

  async synthesize(
    context: AnalysisContext,
    fileSummaries: FileSummary[],
    riskFindings: RiskFinding[],
    testFindings: TestFinding[]
  ): Promise<CanonicalBrief> {
    const fallback = () => this.fallback.synthesize(context, fileSummaries, riskFindings, testFindings);
    return this.callJson<CanonicalBrief>(
      synthesisMessages(context, fileSummaries, riskFindings, testFindings),
      fallback
    );
  }

  private async callJson<T>(messages: Array<{ role: "system" | "user"; content: string }>, fallback: () => Promise<T>): Promise<T> {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.modelId,
          temperature: 0.2,
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
      return JSON.parse(cleaned) as T;
    } catch {
      return fallback();
    }
  }
}
