import type {
  CanonicalBrief,
  ContextInsight,
  CritiqueReport,
  FileSummary,
  PullRequestFile,
  PullRequestSnapshot,
  RepoMemory,
  ReviewPlan,
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
  planReview(context: AnalysisContext): Promise<ReviewPlan>;
  collectContext(context: AnalysisContext, reviewPlan: ReviewPlan): Promise<ContextInsight>;
  reviewSecurity(
    context: AnalysisContext,
    reviewPlan: ReviewPlan,
    contextInsight: ContextInsight
  ): Promise<SecurityFinding[]>;
  analyzeFiles(
    context: AnalysisContext,
    reviewPlan: ReviewPlan,
    contextInsight: ContextInsight
  ): Promise<FileSummary[]>;
  reviewRisks(
    context: AnalysisContext,
    fileSummaries: FileSummary[],
    reviewPlan: ReviewPlan,
    contextInsight: ContextInsight
  ): Promise<RiskFinding[]>;
  planTesting(
    context: AnalysisContext,
    fileSummaries: FileSummary[],
    reviewPlan: ReviewPlan,
    contextInsight: ContextInsight
  ): Promise<TestFinding[]>;
  synthesize(
    context: AnalysisContext,
    reviewPlan: ReviewPlan,
    contextInsight: ContextInsight,
    fileSummaries: FileSummary[],
    securityFindings: SecurityFinding[],
    riskFindings: RiskFinding[],
    testFindings: TestFinding[]
  ): Promise<CanonicalBrief>;
  critique(
    context: AnalysisContext,
    reviewPlan: ReviewPlan,
    contextInsight: ContextInsight,
    brief: CanonicalBrief,
    riskFindings: RiskFinding[],
    testFindings: TestFinding[]
  ): Promise<CritiqueReport>;
}
