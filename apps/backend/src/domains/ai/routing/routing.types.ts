import type { EmbeddingModel, LanguageModel } from 'ai';
import type { AiPayer, ModelAlias } from '@app/shared-types';
import type { EffortFamily, ProviderModel } from './model-tuning.middleware';

/** What a caller asks the resolver for: a chat or structured-output model by alias, or the one embedding model. */
export type AiNeed = 'language' | 'embedding';
export const AI_NEEDS: readonly AiNeed[] = ['language', 'embedding'];

/** Whether a route keeps prompts (`STANDARD`) or is contracted to keep nothing (`ZDR`, zero data retention). */
export type RetentionClass = 'ZDR' | 'STANDARD';

/** Who the provider bills for a call: the platform's own key, or the workspace's. The wire enum is shared. */
export type { AiPayer } from '@app/shared-types';

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
  /** The alias's model on this route, tuned (effort in the route family's shape, one retry one alias up). */
  languageModel(alias: ModelAlias): LanguageModel;
  modelIdFor(alias: ModelAlias): string;
  /**
   * The model id the ledger records for a call through `alias`: the alias's id on this route, or the id of the model
   * that actually answered (`response.modelId`) when a refused call fell back one alias up.
   */
  ledgerModelIdFor(alias: ModelAlias, answeredByModelId?: string): string;
  embeddingModel(): EmbeddingModel;
  embeddingModelId(): string;
}

/** What a registry entry builds: a language leg, an embedding leg, or both. */
export interface ProviderBundle {
  providerLabel: string;
  /** The alias's untuned provider model; the resolver wraps it with the tuning for `effortFamily`. */
  languageModel?: (alias: ModelAlias) => ProviderModel;
  modelIdFor?: (alias: ModelAlias) => string;
  /** How this route takes effort. Required with `languageModel`. */
  effortFamily?: EffortFamily;
  /** The ledger model id for an alias (and the model that answered), on this route's id column. */
  ledgerModelIdFor?: (alias: ModelAlias, answeredByModelId?: string) => string;
  embeddingModel?: () => EmbeddingModel;
  embeddingModelId?: string;
}
