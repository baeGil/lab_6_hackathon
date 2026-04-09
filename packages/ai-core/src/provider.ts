import type {
  CanonicalBrief,
  FileSummary,
  PullRequestFile,
  PullRequestSnapshot,
  RepoMemory,
  RiskFinding,
  SecurityFinding,
  TestFinding
} from "../../shared/src/index";

export interface AnalysisContext {
  snapshot: PullRequestSnapshot;
  files: PullRequestFile[];
  memory: RepoMemory;
  securityFindings: SecurityFinding[];
  importantFiles: string[];
}

export interface AiProvider {
  name: string;
  analyzeFiles(context: AnalysisContext): Promise<FileSummary[]>;
  reviewRisks(context: AnalysisContext, fileSummaries: FileSummary[]): Promise<RiskFinding[]>;
  planTesting(context: AnalysisContext, fileSummaries: FileSummary[]): Promise<TestFinding[]>;
  synthesize(
    context: AnalysisContext,
    fileSummaries: FileSummary[],
    riskFindings: RiskFinding[],
    testFindings: TestFinding[]
  ): Promise<CanonicalBrief>;
}
