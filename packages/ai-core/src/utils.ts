import type {
  AnalysisStrategy,
  EventReviewMode,
  PullRequestFile,
  PullRequestSnapshot,
  PullRequestType,
  RepoConfig,
  RepoMemory,
  ReviewPlan,
  SecurityFinding
} from "../../shared/src/index";

const SECRET_PATTERNS = [
  /ghp_[A-Za-z0-9_]{20,}/g,
  /sk-[A-Za-z0-9]{16,}/g,
  /AIza[0-9A-Za-z\-_]{20,}/g,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/g,
  /password\s*[:=]\s*["'][^"']+["']/gi,
  /token\s*[:=]\s*["'][^"']+["']/gi
];

const IRRELEVANT_PATTERNS = [/package-lock\.json$/, /pnpm-lock\.yaml$/, /yarn\.lock$/, /\.svg$/, /\.png$/, /\.map$/];

export function filterRelevantFiles(files: PullRequestFile[], memory: RepoMemory) {
  return files.filter((file) => {
    if (memory.noisyPaths.some((pattern) => file.path.includes(pattern))) {
      return false;
    }
    return !IRRELEVANT_PATTERNS.some((pattern) => pattern.test(file.path));
  });
}

export function maskSensitiveTokens(files: PullRequestFile[], memory: RepoMemory) {
  const findings: SecurityFinding[] = [];
  const maskedFiles = files.map((file) => {
    let patch = file.patch;
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(patch)) {
        findings.push({
          path: file.path,
          kind: "masked-secret",
          detail: "Sensitive token-like content was masked before analysis."
        });
        patch = patch.replace(pattern, "[MASKED]");
      }
      pattern.lastIndex = 0;
    }

    if (memory.sensitivePaths.some((segment) => file.path.includes(segment))) {
      findings.push({
        path: file.path,
        kind: "sensitive-module",
        detail: "Changed file is inside a sensitive module and should receive human review."
      });
    }

    return { ...file, patch };
  });

  return { maskedFiles, findings };
}

export function estimateTokenBudget(files: PullRequestFile[]) {
  const charCount = files.reduce((sum, file) => sum + file.patch.length, 0);
  return Math.ceil(charCount / 4);
}

export function chooseStrategy(files: PullRequestFile[], config: RepoConfig): AnalysisStrategy {
  if (files.length > config.maxFilesPerAnalysis) {
    return "partial";
  }
  const tokenBudget = estimateTokenBudget(files);
  if (tokenBudget > 12000) {
    return "deep";
  }
  if (tokenBudget > 6000) {
    return "normal";
  }
  return "shallow";
}

export function classifyPullRequest(snapshot: PullRequestSnapshot, files: PullRequestFile[]): PullRequestType {
  const normalized = [
    snapshot.title,
    snapshot.body ?? "",
    ...snapshot.labels,
    ...files.map((file) => file.path),
    ...files.map((file) => file.patch.slice(0, 500))
  ]
    .join("\n")
    .toLowerCase();

  if (files.length > 0 && files.every((file) => /\.(md|mdx|txt|rst)$/i.test(file.path))) return "docs-only";
  if (files.length > 0 && files.every((file) => /test|spec/i.test(file.path))) return "test-only";
  if (/dependabot|renovate|bump|upgrade dependency|package\.json|pnpm-lock|yarn\.lock/.test(normalized)) {
    return "dependency";
  }
  if (/migration|schema|db\/migrate|alter table/.test(normalized)) return "migration";
  if (/auth|permission|token|secret|session|role|billing/.test(normalized)) return "security-sensitive";
  if (/deploy|docker|terraform|helm|k8s|workflow|infra/.test(normalized)) return "infra";
  if (/config|env|feature flag|settings/.test(normalized)) return "config";
  if (/refactor|cleanup|rename|restructure/.test(normalized)) return "refactor";
  if (/fix|bug|hotfix|regression|guard/.test(normalized)) return "bugfix";
  if (/feat|feature|add|introduce|implement/.test(normalized)) return "feature";
  return "mixed";
}

export function deriveEventMode(eventType: PullRequestSnapshot["eventType"]): EventReviewMode {
  if (["opened", "reopened", "ready_for_review", "synchronize"].includes(eventType)) {
    return "full-review";
  }
  if (["closed", "merged"].includes(eventType)) {
    return "closeout";
  }
  return "state-refresh";
}

export function deriveFocusAreas(files: PullRequestFile[], memory: RepoMemory) {
  return rankImportantFiles(files, memory)
    .map((path) => path.split("/")[0] ?? path)
    .filter((value, index, list) => Boolean(value) && list.indexOf(value) === index)
    .slice(0, 5);
}

export function mergeStrategies(left: AnalysisStrategy, right: AnalysisStrategy): AnalysisStrategy {
  const rank: Record<AnalysisStrategy, number> = {
    shallow: 0,
    normal: 1,
    deep: 2,
    partial: 3
  };
  return rank[left] >= rank[right] ? left : right;
}

export function selectFilesForPlan(files: PullRequestFile[], plan: ReviewPlan, config: RepoConfig) {
  if (plan.strategy === "partial") {
    return files.slice(0, config.maxFilesPerAnalysis);
  }
  if (plan.eventMode === "closeout") {
    return files.slice(0, Math.min(5, files.length));
  }
  if (plan.eventMode === "state-refresh") {
    return files.slice(0, Math.min(8, files.length));
  }
  return files;
}

export function chunkFiles(files: PullRequestFile[], config: RepoConfig) {
  const chunks: PullRequestFile[][] = [];
  const limit = Math.max(1, Math.ceil(files.length / config.maxChunksPerAnalysis));
  for (let i = 0; i < files.length; i += limit) {
    chunks.push(files.slice(i, i + limit));
  }
  return chunks;
}

export function rankImportantFiles(files: PullRequestFile[], memory: RepoMemory) {
  return [...files]
    .sort((a, b) => scoreFile(b, memory) - scoreFile(a, memory))
    .slice(0, 5)
    .map((file) => file.path);
}

function scoreFile(file: PullRequestFile, memory: RepoMemory) {
  let score = file.additions + file.deletions;
  if (memory.highRiskModules.some((item) => file.path.includes(item))) {
    score += 50;
  }
  if (/auth|payment|billing|migration|config/i.test(file.path)) {
    score += 30;
  }
  return score;
}
