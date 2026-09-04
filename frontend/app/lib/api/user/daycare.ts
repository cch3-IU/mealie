import type { AxiosRequestConfig } from "axios";
import { BaseAPI } from "../base/base-clients";
import type {
  CompleteRequest,
  CommitReceipt,
  CompletionPreview,
  IngredientWritebackPreview,
  IngredientWritebackReceipt,
  IngredientWritebackUndoResult,
  InventoryResponse,
  Lot,
  LotPatch,
  PlannerSettings,
  PlannerSettingsUpdate,
  PollRequest,
  PollResponse,
  PrepPlan,
  ProcessingStatus,
  PublishReceipt,
  PublishRequest,
  RecipeDaycare,
  RecipeDaycareUpdate,
  RecipeList,
  RegenerateResponse,
  ReservationsResponse,
  ShoppingPlan,
  ShoppingPublishReceipt,
  SimpleFood,
  SimpleFoodList,
  SimpleFoodUpdate,
  StatusResponse,
  UndoResult,
  UnlockPreview,
  UnlockReceipt,
  UnlockRequest,
  WeekResponse,
} from "~/lib/api/types/daycare";

const prefix = "/api/daycare/v1";

const routes = {
  status: `${prefix}/status`,
  settings: `${prefix}/settings`,
  recipes: `${prefix}/recipes`,
  recipeDaycare: (slug: string) => `${prefix}/recipes/${slug}/daycare`,
  recipeIngredientWritebackPreview: (slug: string) => `${prefix}/recipes/${slug}/ingredient-writeback/preview`,
  recipeIngredientWriteback: (slug: string) => `${prefix}/recipes/${slug}/ingredient-writeback`,
  recipeIngredientWritebackUndo: (slug: string) => `${prefix}/recipes/${slug}/ingredient-writeback/undo`,
  simpleFoods: `${prefix}/simple-foods`,
  simpleFood: (foodId: string) => `${prefix}/simple-foods/${foodId}`,
  week: (week: string) => `${prefix}/weeks/${week}`,
  weekRegenerate: (week: string) => `${prefix}/weeks/${week}/regenerate`,
  weekPublish: (week: string) => `${prefix}/weeks/${week}/publish`,
  weekPrep: (week: string) => `${prefix}/weeks/${week}/prep`,
  weekCompletionPreview: (week: string) => `${prefix}/weeks/${week}/completion-preview`,
  weekComplete: (week: string) => `${prefix}/weeks/${week}/complete`,
  weekCommitReceipt: (week: string) => `${prefix}/weeks/${week}/commit-receipt`,
  weekUndoComplete: (week: string) => `${prefix}/weeks/${week}/undo-complete`,
  weekUnlockPreview: (week: string) => `${prefix}/weeks/${week}/unlock-preview`,
  weekUnlock: (week: string) => `${prefix}/weeks/${week}/unlock`,
  weekShopping: (week: string) => `${prefix}/weeks/${week}/shopping`,
  weekShoppingPublish: (week: string) => `${prefix}/weeks/${week}/shopping/publish`,
  inventory: `${prefix}/inventory`,
  lot: (lotId: number) => `${prefix}/inventory/lots/${lotId}`,
  reservations: `${prefix}/reservations`,
  processing: `${prefix}/processing`,
  processingPoll: `${prefix}/processing/poll`,
};

/** Every mutating daycare route requires a client-generated UUID replay key. */
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID (older WebViews).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Attaches an Idempotency-Key, generating a fresh one unless the caller
 * already supplied one in `config.headers` — callers that need a retry of
 * the same logical mutation to replay (rather than mutate twice) pass their
 * own key through.
 */
function withIdempotencyKey(config?: AxiosRequestConfig): AxiosRequestConfig {
  const existing = (config?.headers as Record<string, unknown> | undefined)?.["Idempotency-Key"];
  return {
    ...config,
    headers: {
      ...config?.headers,
      "Idempotency-Key": typeof existing === "string" && existing ? existing : newIdempotencyKey(),
    },
  };
}

/**
 * Client for the daycare-processor sidecar, reached same-origin at
 * /api/daycare/v1/... through the gateway that forwards Mealie's own bearer
 * token. Every mutating call attaches a fresh Idempotency-Key per the
 * sidecar's contract (api/idempotency.py); reads never mutate.
 */
export class DaycareAPI extends BaseAPI {
  async getStatus(config?: AxiosRequestConfig) {
    return await this.requests.get<StatusResponse>(routes.status, undefined, config);
  }

  async getSettings(config?: AxiosRequestConfig) {
    return await this.requests.get<PlannerSettings>(routes.settings, undefined, config);
  }

  async updateSettings(payload: PlannerSettingsUpdate, config?: AxiosRequestConfig) {
    return await this.requests.put<PlannerSettings, PlannerSettingsUpdate>(
      routes.settings,
      payload,
      withIdempotencyKey(config),
    );
  }

  async getRecipes(config?: AxiosRequestConfig) {
    return await this.requests.get<RecipeList>(routes.recipes, undefined, config);
  }

  async getRecipeDaycare(slug: string, config?: AxiosRequestConfig) {
    return await this.requests.get<RecipeDaycare>(routes.recipeDaycare(slug), undefined, config);
  }

  async updateRecipeDaycare(slug: string, payload: RecipeDaycareUpdate, config?: AxiosRequestConfig) {
    return await this.requests.put<RecipeDaycare, RecipeDaycareUpdate>(
      routes.recipeDaycare(slug),
      payload,
      withIdempotencyKey(config),
    );
  }

  /** Dry-run diff of what applying ingredient write-back would change for this recipe. A read; never mutates. */
  async getIngredientWritebackPreview(slug: string, config?: AxiosRequestConfig) {
    return await this.requests.get<IngredientWritebackPreview>(
      routes.recipeIngredientWritebackPreview(slug),
      undefined,
      config,
    );
  }

  /**
   * Applies the previewed ingredient clean-up to the recipe. 409s with `writeback_disabled` (global
   * or per-recipe switch off), `write_disabled` (sidecar-wide write gate off), `recipe_edited`
   * (fingerprint moved since preview — reload it) or `ambiguous_organizer` (details.ambiguities).
   */
  async applyIngredientWriteback(slug: string, config?: AxiosRequestConfig) {
    return await this.requests.post<IngredientWritebackReceipt>(
      routes.recipeIngredientWriteback(slug),
      {},
      withIdempotencyKey(config),
    );
  }

  /** Restores the recipe's ingredients to their pre-writeback state. 409s with `no_receipt` or `recipe_edited`. */
  async undoIngredientWriteback(slug: string, config?: AxiosRequestConfig) {
    return await this.requests.post<IngredientWritebackUndoResult>(
      routes.recipeIngredientWritebackUndo(slug),
      {},
      withIdempotencyKey(config),
    );
  }

  async getSimpleFoods(config?: AxiosRequestConfig) {
    return await this.requests.get<SimpleFoodList>(routes.simpleFoods, undefined, config);
  }

  async updateSimpleFood(foodId: string, payload: SimpleFoodUpdate, config?: AxiosRequestConfig) {
    return await this.requests.put<SimpleFood, SimpleFoodUpdate>(
      routes.simpleFood(foodId),
      payload,
      withIdempotencyKey(config),
    );
  }

  async getWeek(week: string, config?: AxiosRequestConfig) {
    return await this.requests.get<WeekResponse>(routes.week(week), undefined, config);
  }

  async regenerateWeek(week: string, config?: AxiosRequestConfig) {
    return await this.requests.post<RegenerateResponse>(
      routes.weekRegenerate(week),
      {},
      withIdempotencyKey(config),
    );
  }

  async publishWeek(week: string, payload: PublishRequest = {}, config?: AxiosRequestConfig) {
    return await this.requests.post<PublishReceipt>(
      routes.weekPublish(week),
      payload,
      withIdempotencyKey(config),
    );
  }

  async getPrep(week: string, config?: AxiosRequestConfig) {
    return await this.requests.get<PrepPlan>(routes.weekPrep(week), undefined, config);
  }

  async getCompletionPreview(week: string, config?: AxiosRequestConfig) {
    return await this.requests.get<CompletionPreview>(routes.weekCompletionPreview(week), undefined, config);
  }

  async completeWeek(week: string, payload: CompleteRequest = {}, config?: AxiosRequestConfig) {
    return await this.requests.post<CommitReceipt>(
      routes.weekComplete(week),
      payload,
      withIdempotencyKey(config),
    );
  }

  async getCommitReceipt(week: string, config?: AxiosRequestConfig) {
    return await this.requests.get<CommitReceipt>(routes.weekCommitReceipt(week), undefined, config);
  }

  async undoCompleteWeek(week: string, config?: AxiosRequestConfig) {
    return await this.requests.post<UndoResult>(
      routes.weekUndoComplete(week),
      {},
      withIdempotencyKey(config),
    );
  }

  /**
   * Read-only: what unlocking a completed week would do (lots removed/restored,
   * reservations released, downstream weeks marked stale) and whether the
   * sidecar considers it safe. Not yet present on every deployed sidecar —
   * callers should treat a bare 404/405 as "not available yet".
   */
  async getUnlockPreview(week: string, config?: AxiosRequestConfig) {
    return await this.requests.get<UnlockPreview>(routes.weekUnlockPreview(week), undefined, config);
  }

  /**
   * Uncommits a completed week. A 409 `unlock_unsafe` (when `force` is false and the
   * plan isn't safe) carries the same plan shape in its `details`.
   */
  async unlockWeek(week: string, payload: UnlockRequest = {}, config?: AxiosRequestConfig) {
    return await this.requests.post<UnlockReceipt>(
      routes.weekUnlock(week),
      payload,
      withIdempotencyKey(config),
    );
  }

  async getShopping(week: string, config?: AxiosRequestConfig) {
    return await this.requests.get<ShoppingPlan>(routes.weekShopping(week), undefined, config);
  }

  async publishShopping(week: string, payload: PublishRequest = {}, config?: AxiosRequestConfig) {
    return await this.requests.post<ShoppingPublishReceipt>(
      routes.weekShoppingPublish(week),
      payload,
      withIdempotencyKey(config),
    );
  }

  async getInventory(config?: AxiosRequestConfig) {
    return await this.requests.get<InventoryResponse>(routes.inventory, undefined, config);
  }

  /**
   * Patches a lot's remaining portions and/or use-by date. A 409 `lot_reserved` means the new
   * portions figure is below what's already reserved for planned weeks; a 422 means a bad date.
   * Not yet present on every deployed sidecar — callers should treat a bare 404/405 as "editing
   * not available yet" rather than a generic failure.
   */
  async updateLot(lotId: number, payload: LotPatch, config?: AxiosRequestConfig) {
    return await this.requests.patch<Lot, LotPatch>(
      routes.lot(lotId),
      payload,
      withIdempotencyKey(config),
    );
  }

  async getReservations(config?: AxiosRequestConfig) {
    return await this.requests.get<ReservationsResponse>(routes.reservations, undefined, config);
  }

  async getProcessingStatus(config?: AxiosRequestConfig) {
    return await this.requests.get<ProcessingStatus>(routes.processing, undefined, config);
  }

  async pollProcessing(payload: PollRequest = {}, config?: AxiosRequestConfig) {
    return await this.requests.post<PollResponse>(
      routes.processingPoll,
      payload,
      withIdempotencyKey(config),
    );
  }
}
