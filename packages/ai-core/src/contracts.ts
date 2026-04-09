import { z } from "zod";

export const fileSummarySchema = z.object({
  path: z.string(),
  summary: z.string(),
  businessIntent: z.string(),
  reviewerFocus: z.string()
});

export const riskFindingSchema = z.object({
  path: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  category: z.enum(["logic", "security", "performance", "breaking-change", "configuration"]),
  summary: z.string()
});

export const testFindingSchema = z.object({
  path: z.string(),
  recommendation: z.string(),
  testType: z.enum(["unit", "integration", "manual", "regression"])
});
