import type { AxiosRequestConfig } from "axios";
import { BaseAPI } from "../base/base-clients";
import type {
  CompleteRequest,
  CommitReceipt,
  CompletionPreview,
  InventoryResponse,
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
  WeekResponse,
} from "~/lib/api/types/daycare";

const prefix = "/api/daycare/v1";

const routes = {
  status: `${prefix}/status`,
  settings: `${prefix}/settings`,
  recipes: `${prefix}/recipes`,
  recipeDaycare: (slug: string) => `${prefix}/recipes/${slug}/daycare`,
  simpleFoods: `${prefix}/simple-foods`,
  simpleFood: (foodId: string) => `${prefix}/simple-foods/${foodId}`,
  week: (week: string) => `${prefix}/weeks/${week}`,
  weekRegenerate: (week: string) => `${prefix}/weeks/${week}/regenerate`,
  weekPublish: (week: string) => `${prefix}/weeks/${week}/publish`,
  weekPrep: (week: string) => `${prefix}/weeks/${week}/prep`,
  weekCompletionPreview: (week: string) => `${prefix}/weeks/${week}/completion-preview`,
  weekComplete: (week: string) => `${prefix}/weeks/${week}/complete`,
  weekUndoComplete: (week: string) => `${prefix}/weeks/${week}/undo-complete`,
  weekShopping: (week: string) => `${prefix}/weeks/${week}/shopping`,
  weekShoppingPublish: (week: string) => `${prefix}/weeks/${week}/shopping/publish`,
  inventory: `${prefix}/inventory`,
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

function withIdempotencyKey(config?: AxiosRequestConfig): AxiosRequestConfig {
  return {
    ...config,
    headers: {
      ...config?.headers,
      "Idempotency-Key": newIdempotencyKey(),
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

  async undoCompleteWeek(week: string, config?: AxiosRequestConfig) {
    return await this.requests.post<UndoResult>(
      routes.weekUndoComplete(week),
      {},
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
