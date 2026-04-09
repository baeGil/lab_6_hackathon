import type {
  AnalysisResult,
  AnalyticsSnapshot,
  AuthenticatedUser,
  DeliveryRecord,
  DeliveryTargets,
  IntegrationCredentialsStatus,
  RepoConfig,
  RepoIntegration,
  RepoIntegrationInput,
  RepoMemory,
  TrackedRepository,
  WebhookEvent
} from "../../shared/src/index";
import { ensureRootEnvLoaded } from "../../shared/src/env";
import { decryptSecret, encryptSecret } from "./secrets";

ensureRootEnvLoaded();

interface StoredUser {
  profile: AuthenticatedUser;
  encryptedAccessToken?: string;
}

interface StoredTrackedRepository {
  repoId: string;
  repoName: string;
  installationId?: number;
  ownerLogin: string;
  ownerUserId: string;
  enabled: boolean;
  webhookConfigured: boolean;
}

interface StoredRepoIntegration {
  repoId: string;
  ownerUserId: string;
  slackWebhookUrl?: string;
  discordWebhookUrl?: string;
  updatedAt: string;
}

function defaultConfig(repoId: string, repoName: string): RepoConfig {
  return {
    repoId,
    repoName,
    notifySlack: false,
    notifyDiscord: false,
    quietHours: null,
    maxFilesPerAnalysis: 25,
    maxChunksPerAnalysis: 12,
    maxRunsPerHour: 20
  };
}

function defaultMemory(repoId: string): RepoMemory {
  return {
    repoId,
    sensitivePaths: ["auth/", "security/", "permissions/"],
    noisyPaths: ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "dist/"],
    preferredSummaryStyle: "balanced",
    highRiskModules: ["auth", "billing", "payments", "migrations"]
  };
}

function toInstallUrl() {
  const slug = process.env.GITHUB_APP_SLUG;
  return slug ? `https://github.com/apps/${slug}/installations/new` : null;
}

function repoOwnerKey(ownerUserId: string, repoId: string) {
  return `${ownerUserId}:${repoId}`;
}

function withIntegrationStatus(
  repository: StoredTrackedRepository,
  integration?: StoredRepoIntegration
): TrackedRepository {
  return {
    ...repository,
    slackConfigured: Boolean(decryptSecret(integration?.slackWebhookUrl)),
    discordConfigured: Boolean(decryptSecret(integration?.discordWebhookUrl)),
    webhookConfigured: repository.webhookConfigured
  };
}

function sliceAnalysesForRepos(results: AnalysisResult[], repoIds: Set<string>, limit: number) {
  return results.filter((item) => repoIds.has(item.snapshot.repoId)).slice(-limit).reverse();
}

export class MemoryStore {
  private users = new Map<string, StoredUser>();
  private configs = new Map<string, RepoConfig>();
  private memories = new Map<string, RepoMemory>();
  private trackedRepositories = new Map<string, StoredTrackedRepository>();
  private repoIntegrations = new Map<string, StoredRepoIntegration>();
  private webhookEvents: WebhookEvent[] = [];
  private analyses: AnalysisResult[] = [];
  private deliveries: DeliveryRecord[] = [];

  ensureRepository(repoId: string, repoName: string) {
    if (!this.configs.has(repoId)) {
      this.configs.set(repoId, defaultConfig(repoId, repoName));
    }
    if (!this.memories.has(repoId)) {
      this.memories.set(repoId, defaultMemory(repoId));
    }
  }

  getConfig(repoId: string, repoName: string) {
    this.ensureRepository(repoId, repoName);
    return this.configs.get(repoId)!;
  }

  getMemory(repoId: string, repoName: string) {
    this.ensureRepository(repoId, repoName);
    return this.memories.get(repoId)!;
  }

  updateMemory(repoId: string, memory: Partial<RepoMemory>) {
    const current = this.getMemory(repoId, repoId);
    const next = { ...current, ...memory };
    this.memories.set(repoId, next);
    return next;
  }

  upsertUser(profile: AuthenticatedUser, accessToken?: string) {
    const current = this.users.get(profile.userId);
    this.users.set(profile.userId, {
      profile,
      encryptedAccessToken: accessToken
        ? encryptSecret(accessToken)
        : current?.encryptedAccessToken
    });
    return this.users.get(profile.userId)!.profile;
  }

  getUser(userId: string) {
    return this.users.get(userId)?.profile ?? null;
  }

  getUserAccessToken(userId: string) {
    return decryptSecret(this.users.get(userId)?.encryptedAccessToken);
  }

  replaceTrackedRepositoriesForUser(
    ownerUserId: string,
    repositories: Array<{
      repoId: string;
      repoName: string;
      installationId?: number;
      ownerLogin: string;
    }>
  ) {
    const nextRepoIds = new Set(repositories.map((repo) => repo.repoId));

    for (const [key, repository] of this.trackedRepositories.entries()) {
      if (repository.ownerUserId === ownerUserId && !nextRepoIds.has(repository.repoId)) {
        this.trackedRepositories.delete(key);
        this.repoIntegrations.delete(key);
      }
    }

    for (const repository of repositories) {
      this.ensureRepository(repository.repoId, repository.repoName);
      const key = repoOwnerKey(ownerUserId, repository.repoId);
      const existing = this.trackedRepositories.get(key);
      this.trackedRepositories.set(key, {
        repoId: repository.repoId,
        repoName: repository.repoName,
        installationId: repository.installationId,
        ownerLogin: repository.ownerLogin,
        ownerUserId,
        enabled: existing?.enabled ?? false,
        webhookConfigured: existing?.webhookConfigured ?? Boolean(repository.installationId)
      });
    }

    return this.listTrackedRepositoriesForUser(ownerUserId);
  }

  listTrackedRepositoriesForUser(ownerUserId: string) {
    return Array.from(this.trackedRepositories.values())
      .filter((repository) => repository.ownerUserId === ownerUserId)
      .sort((left, right) => left.repoName.localeCompare(right.repoName))
      .map((repository) =>
        withIntegrationStatus(
          repository,
          this.repoIntegrations.get(repoOwnerKey(ownerUserId, repository.repoId))
        )
      );
  }

  getTrackedRepositoryForUser(ownerUserId: string, repoId: string) {
    const repository = this.trackedRepositories.get(repoOwnerKey(ownerUserId, repoId));
    if (!repository) {
      return null;
    }
    return withIntegrationStatus(
      repository,
      this.repoIntegrations.get(repoOwnerKey(ownerUserId, repoId))
    );
  }

  isRepoTracked(repoId: string) {
    return Array.from(this.trackedRepositories.values()).some((repository) => repository.repoId === repoId && repository.enabled);
  }

  setRepositoryTracking(ownerUserId: string, repoId: string, enabled: boolean) {
    const key = repoOwnerKey(ownerUserId, repoId);
    const current = this.trackedRepositories.get(key);
    if (!current) {
      throw new Error("Repository is not available for this user.");
    }
    this.trackedRepositories.set(key, {
      ...current,
      enabled
    });
    return this.getTrackedRepositoryForUser(ownerUserId, repoId)!;
  }

  setRepositoryWebhookConfigured(ownerUserId: string, repoId: string, configured: boolean) {
    const key = repoOwnerKey(ownerUserId, repoId);
    const current = this.trackedRepositories.get(key);
    if (!current) {
      throw new Error("Repository is not available for this user.");
    }
    this.trackedRepositories.set(key, {
      ...current,
      webhookConfigured: configured
    });
    return this.getTrackedRepositoryForUser(ownerUserId, repoId)!;
  }

  saveRepoIntegration(ownerUserId: string, repoId: string, input: RepoIntegrationInput) {
    const repository = this.trackedRepositories.get(repoOwnerKey(ownerUserId, repoId));
    if (!repository) {
      throw new Error("Repository is not tracked for this user.");
    }
    const key = repoOwnerKey(ownerUserId, repoId);
    const current = this.repoIntegrations.get(key);
    const next: StoredRepoIntegration = {
      repoId,
      ownerUserId,
      slackWebhookUrl:
        typeof input.slackWebhookUrl === "undefined"
          ? current?.slackWebhookUrl
          : input.slackWebhookUrl
            ? encryptSecret(input.slackWebhookUrl)
            : undefined,
      discordWebhookUrl:
        typeof input.discordWebhookUrl === "undefined"
          ? current?.discordWebhookUrl
          : input.discordWebhookUrl
            ? encryptSecret(input.discordWebhookUrl)
            : undefined,
      updatedAt: new Date().toISOString()
    };
    this.repoIntegrations.set(key, next);
    return this.getRepoIntegration(ownerUserId, repoId)!;
  }

  getRepoIntegration(ownerUserId: string, repoId: string): RepoIntegration | null {
    const current = this.repoIntegrations.get(repoOwnerKey(ownerUserId, repoId));
    if (!current) {
      return null;
    }
    return {
      repoId,
      ownerUserId,
      slackWebhookUrl: decryptSecret(current.slackWebhookUrl),
      discordWebhookUrl: decryptSecret(current.discordWebhookUrl),
      updatedAt: current.updatedAt
    };
  }

  getDeliveryTargetsForRepo(repoId: string): DeliveryTargets {
    const tracked = Array.from(this.trackedRepositories.values()).filter(
      (repository) => repository.repoId === repoId && repository.enabled
    );
    const slackWebhookUrls = tracked
      .map((repository) => decryptSecret(this.repoIntegrations.get(repoOwnerKey(repository.ownerUserId, repoId))?.slackWebhookUrl))
      .filter((value): value is string => Boolean(value));
    const discordWebhookUrls = tracked
      .map((repository) => decryptSecret(this.repoIntegrations.get(repoOwnerKey(repository.ownerUserId, repoId))?.discordWebhookUrl))
      .filter((value): value is string => Boolean(value));

    return {
      tracked: tracked.length > 0,
      slackWebhookUrls: Array.from(new Set(slackWebhookUrls)),
      discordWebhookUrls: Array.from(new Set(discordWebhookUrls))
    };
  }

  saveWebhookEvent(event: WebhookEvent) {
    if (this.webhookEvents.some((item) => item.deliveryId === event.deliveryId)) {
      return false;
    }
    this.webhookEvents.push(event);
    return true;
  }

  saveAnalysis(result: AnalysisResult) {
    this.analyses.push(result);
  }

  saveDeliveries(records: DeliveryRecord[]) {
    this.deliveries.push(...records);
  }

  getCredentialsStatus(): IntegrationCredentialsStatus {
    return {
      githubAppConfigured: Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY),
      githubOAuthConfigured: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
      githubWebhookSecretConfigured: Boolean(process.env.GITHUB_WEBHOOK_SECRET),
      groqConfigured: Boolean(process.env.GROQ_API_KEY),
      githubUserTokenConfigured: false,
      githubApiUrl: process.env.GITHUB_API_URL ?? "https://api.github.com",
      groqModelId: process.env.GROQ_MODEL_ID ?? "llama-3.3-70b-versatile",
      aiProviderMode: (process.env.AI_PROVIDER_MODE as "heuristic" | "groq") ?? "heuristic",
      githubAppInstallUrl: toInstallUrl()
    };
  }

  getCredentialsStatusForUser(userId?: string): IntegrationCredentialsStatus {
    const status = this.getCredentialsStatus();
    return {
      ...status,
      githubUserTokenConfigured: userId ? Boolean(this.getUserAccessToken(userId)) : false
    };
  }

  getRecentActivity(limit = 10) {
    return this.analyses.slice(-limit).reverse();
  }

  getRecentActivityForUser(userId: string, limit = 10) {
    const repoIds = new Set(this.listTrackedRepositoriesForUser(userId).map((repository) => repository.repoId));
    return sliceAnalysesForRepos(this.analyses, repoIds, limit);
  }

  getAnalytics(): AnalyticsSnapshot {
    return buildAnalytics(this.analyses, this.webhookEvents.length);
  }

  getAnalyticsForUser(userId: string) {
    const repoIds = new Set(this.listTrackedRepositoriesForUser(userId).map((repository) => repository.repoId));
    const analyses = this.analyses.filter((item) => repoIds.has(item.snapshot.repoId));
    const totalEvents = this.webhookEvents.filter((event) => repoIds.has(event.snapshot.repoId)).length;
    return buildAnalytics(analyses, totalEvents);
  }
}

function buildAnalytics(analyses: AnalysisResult[], totalEvents: number): AnalyticsSnapshot {
  const totalAnalyses = analyses.length;
  const avgConfidence =
    totalAnalyses === 0
      ? 0
      : analyses.reduce((sum, item) => sum + item.brief.confidence, 0) / totalAnalyses;
  const avgFilesPerPr =
    totalAnalyses === 0
      ? 0
      : analyses.reduce((sum, item) => sum + item.snapshot.files.length, 0) / totalAnalyses;
  const attentionDistribution = analyses.reduce(
    (acc, item) => {
      acc[item.brief.attentionLevel] += 1;
      return acc;
    },
    { low: 0, medium: 0, high: 0 }
  );

  return {
    totalEvents,
    totalAnalyses,
    avgConfidence: Number(avgConfidence.toFixed(2)),
    avgFilesPerPr: Number(avgFilesPerPr.toFixed(2)),
    attentionDistribution
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __prIntelStore: MemoryStore | undefined;
}

export function getStore() {
  if (!globalThis.__prIntelStore) {
    globalThis.__prIntelStore = new MemoryStore();
  }
  return globalThis.__prIntelStore;
}
