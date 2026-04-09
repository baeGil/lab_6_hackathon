export type GitHubEventType =
  | "opened"
  | "reopened"
  | "ready_for_review"
  | "synchronize"
  | "review_requested"
  | "review_request_removed"
  | "review_submitted"
  | "converted_to_draft"
  | "closed"
  | "merged";

export type AttentionLevel = "low" | "medium" | "high";
export type AnalysisStrategy = "shallow" | "normal" | "deep" | "partial";
export type DeliveryChannel = "github" | "slack" | "discord";
export type PullRequestType =
  | "feature"
  | "bugfix"
  | "refactor"
  | "infra"
  | "config"
  | "migration"
  | "security-sensitive"
  | "dependency"
  | "docs-only"
  | "test-only"
  | "mixed";
export type EventReviewMode = "full-review" | "state-refresh" | "closeout";
export type ReviewerPosture = "monitor" | "careful-review" | "senior-review";

export interface PullRequestFile {
  path: string;
  patch: string;
  additions: number;
  deletions: number;
  language?: string;
}

export interface AuthenticatedUser {
  userId: string;
  githubId: string;
  login: string;
  name?: string;
  avatarUrl?: string;
}

export interface GitHubAccountToken {
  userId: string;
  accessToken: string;
  updatedAt: string;
}

export interface PullRequestSnapshot {
  repoId: string;
  repoName: string;
  prNumber: number;
  title: string;
  author: string;
  url: string;
  baseBranch: string;
  headBranch: string;
  eventType: GitHubEventType;
  labels: string[];
  reviewers: string[];
  body?: string;
  files: PullRequestFile[];
  headSha?: string;
  installationId?: number;
  createdAt: string;
  updatedAt: string;
}

export interface RepoConfig {
  repoId: string;
  repoName: string;
  notifySlack: boolean;
  notifyDiscord: boolean;
  quietHours: { startHour: number; endHour: number } | null;
  maxFilesPerAnalysis: number;
  maxChunksPerAnalysis: number;
  maxRunsPerHour: number;
}

export interface RepoMemory {
  repoId: string;
  sensitivePaths: string[];
  noisyPaths: string[];
  preferredSummaryStyle: "compact" | "balanced" | "detailed";
  highRiskModules: string[];
}

export interface WebhookEvent {
  deliveryId: string;
  receivedAt: string;
  snapshot: PullRequestSnapshot;
}

export interface SecurityFinding {
  path: string;
  kind: "masked-secret" | "sensitive-module" | "config-risk" | "auth-risk" | "dependency-risk";
  detail: string;
}

export interface FileSummary {
  path: string;
  summary: string;
  businessIntent: string;
  reviewerFocus: string;
  changeType?: "logic" | "api" | "config" | "data" | "test" | "docs";
}

export interface RiskFinding {
  path: string;
  severity: AttentionLevel;
  category: "logic" | "security" | "performance" | "breaking-change" | "configuration" | "concurrency";
  summary: string;
  reviewerAction?: string;
}

export interface TestFinding {
  path: string;
  recommendation: string;
  testType: "unit" | "integration" | "manual" | "regression";
  priority?: AttentionLevel;
}

export interface ReviewPlan {
  prType: PullRequestType;
  eventMode: EventReviewMode;
  strategy: AnalysisStrategy;
  requiresExtraContext: boolean;
  focusAreas: string[];
  reasoning: string;
  shouldNotify: boolean;
}

export interface ContextInsight {
  summary: string;
  relatedModules: string[];
  keyQuestions: string[];
  missingContext: string[];
}

export interface CritiqueReport {
  confidence: number;
  reviewerPosture: ReviewerPosture;
  missingContext: string[];
  escalationNote: string | null;
  publishToChannels: boolean;
}

export interface CanonicalBrief {
  title: string;
  eventSummary: string;
  whatChanged: string[];
  whyItMatters: string[];
  reviewerFocus: string[];
  attentionLevel: AttentionLevel;
  testImpact: string[];
  confidence: number;
  missingContext: string[];
  importantFiles: string[];
  reviewerPosture: ReviewerPosture;
  escalationNote: string | null;
  nextActions: string[];
  disclaimer: string;
}

export interface NotificationPayload {
  channel: DeliveryChannel;
  heading: string;
  summary: string[];
  attentionLevel: AttentionLevel;
  confidence: number;
  links: { label: string; url: string }[];
}

export interface AnalysisResult {
  snapshot: PullRequestSnapshot;
  reviewPlan: ReviewPlan;
  contextInsight: ContextInsight;
  strategy: AnalysisStrategy;
  securityFindings: SecurityFinding[];
  fileSummaries: FileSummary[];
  riskFindings: RiskFinding[];
  testFindings: TestFinding[];
  brief: CanonicalBrief;
  critique: CritiqueReport;
  githubPayload: NotificationPayload;
  slackPayload: NotificationPayload | null;
  discordPayload: NotificationPayload | null;
}

export interface DeliveryRecord {
  channel: DeliveryChannel;
  status: "sent" | "skipped" | "failed";
  target: string;
  timestamp: string;
  message: string;
}

export interface AnalyticsSnapshot {
  totalEvents: number;
  totalAnalyses: number;
  avgConfidence: number;
  avgFilesPerPr: number;
  attentionDistribution: Record<AttentionLevel, number>;
}

export interface RepoIntegrationInput {
  slackWebhookUrl?: string;
  discordWebhookUrl?: string;
}

export interface RepoIntegration {
  repoId: string;
  ownerUserId: string;
  slackWebhookUrl?: string;
  discordWebhookUrl?: string;
  updatedAt: string;
}

export interface TrackedRepository {
  repoId: string;
  repoName: string;
  installationId: number;
  ownerLogin: string;
  ownerUserId: string;
  enabled: boolean;
  slackConfigured: boolean;
  discordConfigured: boolean;
}

export interface DeliveryTargets {
  tracked: boolean;
  slackWebhookUrls: string[];
  discordWebhookUrls: string[];
}

export interface IntegrationCredentialsStatus {
  githubAppConfigured: boolean;
  githubOAuthConfigured: boolean;
  githubWebhookSecretConfigured: boolean;
  groqConfigured: boolean;
  githubApiUrl: string;
  groqModelId: string;
  aiProviderMode: "heuristic" | "groq";
  githubAppInstallUrl: string | null;
}
