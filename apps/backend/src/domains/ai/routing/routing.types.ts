import type { EmbeddingModel, LanguageModel } from 'ai';
import type { ModelAlias } from '@app/shared-types';

/** What a caller asks the resolver for: a chat or structured-output model by alias, or the one embedding model. */
export type AiNeed = 'language' | 'embedding';
export const AI_NEEDS: readonly AiNeed[] = ['language', 'embedding'];

/** Whether a route keeps prompts (`STANDARD`) or is contracted to keep nothing (`ZDR`, zero data retention). */
export type RetentionClass = 'ZDR' | 'STANDARD';

/** Who the provider bills for a call: the platform's own key, or the workspace's. */
export type AiPayer = 'TENANT' | 'PLATFORM';

/**
 * The resolver's answer: everything a consumer needs to make the call and to attribute it in the ledger. The model
 * getters enforce the per-model zero-retention capability (a zero-retention tenant asking for an alias that is not
 * `zdrCapable` is refused here, not at the call site) and refuse an alias the route has no id for.
 */
export interface ResolvedRoute {
  /** `platform-openrouter`, `platform-cohere`, or (with bring-your-own-key) a credential's public id. */
  routeId: string;
  /** `PLATFORM_OPENROUTER`, `PLATFORM_COHERE`, or (with bring-your-own-key) the credential type. A ledger string. */
  credentialType: string;
  payer: AiPayer;
  retention: RetentionClass;
  /** Ledger vendor label: who bills the tokens (`AI_PROVIDER_LABELS`). */
  providerLabel: string;
  languageModel(alias: ModelAlias): LanguageModel;
  modelIdFor(alias: ModelAlias): string;
  embeddingModel(): EmbeddingModel;
  embeddingModelId(): string;
}

/** What a registry entry builds: a language leg, an embedding leg, or both. */
export interface ProviderBundle {
  providerLabel: string;
  languageModel?: (alias: ModelAlias) => LanguageModel;
  modelIdFor?: (alias: ModelAlias) => string;
  embeddingModel?: () => EmbeddingModel;
  embeddingModelId?: string;
}
