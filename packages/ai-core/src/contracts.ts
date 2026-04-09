import { z } from "zod";

export const fileSummarySchema = z.object({
  path: z.string(),
  summary: z.string(),
  businessIntent: z.string(),
  reviewerFocus: z.string(),
  changeType: z.enum(["logic", "api", "config", "data", "test", "docs"]).optional()
});

export const riskFindingSchema = z.object({
  path: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  category: z.enum(["logic", "security", "performance", "breaking-change", "configuration", "concurrency"]),
  summary: z.string(),
  reviewerAction: z.string().optional()
});

export const testFindingSchema = z.object({
  path: z.string(),
  recommendation: z.string(),
  testType: z.enum(["unit", "integration", "manual", "regression"]),
  priority: z.enum(["low", "medium", "high"]).optional()
});

export const reviewPlanSchema = z.object({
  prType: z.enum([
    "feature",
    "bugfix",
    "refactor",
    "infra",
    "config",
    "migration",
    "security-sensitive",
    "dependency",
    "docs-only",
    "test-only",
    "mixed"
  ]),
  eventMode: z.enum(["full-review", "state-refresh", "closeout"]),
  strategy: z.enum(["shallow", "normal", "deep", "partial"]),
  requiresExtraContext: z.boolean(),
  focusAreas: z.array(z.string()),
  reasoning: z.string(),
  shouldNotify: z.boolean()
});

export const contextInsightSchema = z.object({
  summary: z.string(),
  relatedModules: z.array(z.string()),
  keyQuestions: z.array(z.string()),
  missingContext: z.array(z.string())
});

export const securityFindingSchema = z.object({
  path: z.string(),
  kind: z.enum(["masked-secret", "sensitive-module", "config-risk", "auth-risk", "dependency-risk"]),
  detail: z.string()
});

export const critiqueReportSchema = z.object({
  confidence: z.number().min(0).max(1),
  reviewerPosture: z.enum(["monitor", "careful-review", "senior-review"]),
  missingContext: z.array(z.string()),
  escalationNote: z.string().nullable(),
  publishToChannels: z.boolean()
});

export const canonicalBriefSchema = z.object({
  title: z.string(),
  eventSummary: z.string(),
  whatChanged: z.array(z.string()),
  whyItMatters: z.array(z.string()),
  reviewerFocus: z.array(z.string()),
  attentionLevel: z.enum(["low", "medium", "high"]),
  testImpact: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  missingContext: z.array(z.string()),
  importantFiles: z.array(z.string()),
  reviewerPosture: z.enum(["monitor", "careful-review", "senior-review"]),
  escalationNote: z.string().nullable(),
  nextActions: z.array(z.string()),
  disclaimer: z.string()
});
