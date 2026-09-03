/**
 * Hand-written TypeScript mirror of the daycare-processor sidecar's Pydantic
 * schemas (src/daycare_processor/api/schemas.py in the sidecar repository,
 * served live at /api/daycare/v1/openapi.json).
 *
 * This is NOT produced by Mealie's own pydantic2ts generator (that pipeline
 * only walks mealie/schema/*, which the sidecar is not part of) and it does
 * NOT follow Mealie's camelCase wire convention: the sidecar has no
 * alias_generator, so every field name below matches the sidecar's raw
 * snake_case JSON exactly. Keep this file in sync by hand with the sidecar's
 * schemas.py; do not run Mealie codegen against it and do not move it next
 * to the auto-generated files' naming pattern.
 */

export type Weekday = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
export type Slot = "breakfast" | "lunch" | "snack";
export type Role = "main" | "produce" | "addon";
export type FoodGroup = "fruit" | "vegetable" | "grain" | "protein" | "dairy" | "fat";
export type Freezability = "yes" | "no" | "uncertain";
export type PreferredBatchStorage = "freezer" | "refrigerator" | "fresh" | "shelf_stable" | "unknown";
export type Serve = "cold" | "room_temperature" | "warm" | "hot" | "flexible" | "unknown";
export type ServiceWork = "none" | "minimal" | "moderate" | "substantial" | "unknown";
export type SimpleFoodKind = "produce" | "substantial_companion" | "condiment";
export type PublicationState = "never" | "published" | "dry_run" | "ambiguous" | "failed" | "unknown";
export type ProcessingState = "pending" | "running" | "succeeded" | "failed" | "dead_lettered";
export type StorageLocation = "freezer" | "refrigerator" | "shelf_stable" | "other";

// ---------------------------------------------------------------------------
// Error envelope
// ---------------------------------------------------------------------------

export interface DaycareErrorDetail {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

export interface DaycareErrorResponse {
  error: DaycareErrorDetail;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export interface MealieStatus {
  reachable: boolean;
  version: string | null;
  checked_at: string | null;
  cached: boolean;
  error: string | null;
}

export interface HouseholdInfo {
  household_id: string | null;
  household_name: string | null;
  group_id: string | null;
}

export interface Counts {
  lots: number;
  reservations: number;
  commits: number;
}

export interface SchedulerStatus {
  last_run: string | null;
  next_run: string | null;
  reason: string;
}

export interface StatusResponse {
  service: string;
  version: string;
  mealie: MealieStatus;
  daycare_household: HouseholdInfo;
  counts: Counts;
  latest_plan_week: string | null;
  scheduler: SchedulerStatus;
  write_enabled: boolean;
}

export interface HealthResponse {
  status: "ok";
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface NewProductionBySlot {
  breakfast: number | null;
  lunch: number | null;
  snack: number | null;
}

export interface PlanningSettings {
  max_recipe_uses_per_week: number;
  max_inventory_recipe_uses_per_week: number;
  min_recipe_gap_days: number;
  min_same_slot_recipe_gap_days: number;
  max_rotation_group_uses_per_week: number;
  min_rotation_gap_days: number;
  max_new_production_recipes_per_week: number;
  max_new_production_recipes_by_slot: NewProductionBySlot;
  history_weeks: number;
}

export interface ProductionSettings {
  prefer_prepared_inventory: boolean;
  avoid_new_production: boolean;
}

export interface AutomationSettings {
  weekly_planning_enabled: boolean;
  planning_weekday: Weekday;
  planning_time: string;
  timezone: string;
  auto_publish_meal_plan: boolean;
  auto_publish_shopping_list: boolean;
}

export interface PlannerSettingsUpdate {
  planning: PlanningSettings;
  production: ProductionSettings;
  automation: AutomationSettings;
}

export interface PlannerSettings extends PlannerSettingsUpdate {
  config_version: number | null;
  week_start_weekday: Weekday;
  weekdays: Weekday[];
}

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

export interface RecipeSummary {
  slug: string;
  name: string;
  classified: boolean;
  eligible: boolean | null;
  enabled: boolean;
  daycare_portions_per_batch: number | null;
}

export interface RecipeList {
  recipes: RecipeSummary[];
}

export interface SlotUse {
  slot: Slot;
  roles: Role[];
}

export interface Production {
  batchable: boolean;
  freezable: Freezability;
  preferred_batch_storage: PreferredBatchStorage;
  batch_yield_portions: number | null;
  active_prep_minutes: number | null;
  total_prep_minutes: number | null;
}

export interface Service {
  requires_refrigeration: boolean | null;
  serve: Serve;
  day_of_service_work: ServiceWork;
}

export interface ClassificationInfo {
  confidence: number;
  notes: string[];
  needs_review: boolean;
}

export interface DaycareMeta {
  schema_version: 2;
  eligible: boolean;
  uses: SlotUse[];
  food_groups: FoodGroup[];
  production: Production;
  service: Service;
  rotation_group: string;
  classification: ClassificationInfo;
}

export interface RecipeSettings {
  enabled: boolean | null;
  daycare_portions_per_batch: number | null;
  max_uses_per_week: number | null;
  max_inventory_uses_per_week: number | null;
  score_adjustment: number | null;
  reason: string | null;
}

export interface RecipeDaycare {
  slug: string;
  name: string;
  recipe_id: string | null;
  classified: boolean;
  classification: DaycareMeta | null;
  override_applied: boolean;
  override: Record<string, unknown> | null;
  settings: RecipeSettings;
}

export interface RecipeSettingsPatch {
  enabled?: boolean | null;
  daycare_portions_per_batch?: number | null;
  max_uses_per_week?: number | null;
  max_inventory_uses_per_week?: number | null;
  score_adjustment?: number | null;
  reason?: string | null;
}

export interface ProductionOverride {
  batchable?: boolean | null;
  freezable?: Freezability | null;
  preferred_batch_storage?: PreferredBatchStorage | null;
  batch_yield_portions?: number | null;
  active_prep_minutes?: number | null;
  total_prep_minutes?: number | null;
}

export interface ServiceOverride {
  requires_refrigeration?: boolean | null;
  serve?: Serve | null;
  day_of_service_work?: ServiceWork | null;
}

export interface ClassificationOverridePatch {
  eligible?: boolean | null;
  uses?: Partial<Record<Slot, Role[] | null>> | null;
  food_groups?: FoodGroup[] | null;
  rotation_group?: string | null;
  production?: ProductionOverride | null;
  service?: ServiceOverride | null;
}

export interface RecipeDaycareUpdate {
  settings?: RecipeSettingsPatch | null;
  classification?: ClassificationOverridePatch | null;
}

// ---------------------------------------------------------------------------
// Simple foods
// ---------------------------------------------------------------------------

export interface SimpleFood {
  id: string;
  name: string;
  kind: SimpleFoodKind | null;
  enabled: boolean;
  daycare_allowed: boolean;
  groups: FoodGroup[];
  slots: Slot[];
  aliases: string[];
  restriction_reason: string | null;
}

export interface SimpleFoodList {
  foods: SimpleFood[];
}

export interface SimpleFoodUpdate {
  name?: string | null;
  kind: SimpleFoodKind;
  enabled: boolean;
  daycare_allowed?: boolean;
  groups: FoodGroup[];
  slots?: Slot[];
  aliases?: string[] | null;
  restriction_reason?: string | null;
}

// ---------------------------------------------------------------------------
// Weeks / plan
// ---------------------------------------------------------------------------

export interface PlanRecipeChoice {
  slug: string;
  name: string;
  role: string;
  roles: string[];
  rotation_group: string | null;
  inventory_available_at_plan_time: number | null;
  production_activated: boolean | null;
}

export interface PlanSimpleFood {
  status: string;
  key: string | null;
  name: string | null;
  kind: string | null;
  groups: string[];
  reason: string | null;
}

export interface PlanSlot {
  recipe: PlanRecipeChoice;
  produce_side: PlanSimpleFood | null;
  companion: PlanSimpleFood | null;
}

export interface PlanDay {
  date: string;
  day: string;
  breakfast: PlanSlot;
  lunch: PlanSlot;
  snack_am: PlanSlot;
  snack_pm: PlanSlot;
}

export interface ProductionRow {
  recipe_slug: string;
  recipe_name: string;
  demand_daycare_portions: number;
  inventory_available: number;
  shortage_daycare_portions: number;
  batchable: boolean;
  daycare_portions_per_batch: number | null;
  batches_to_make: number | null;
  yield_needs_configuration: boolean;
}

export interface WeekPlan {
  schema_version: number;
  week_start: string;
  generated_at: string;
  plan_id: string | null;
  days: PlanDay[];
  production_plan: ProductionRow[];
  warnings: string[];
}

export type ReservationStatus = "active" | "none" | "stale" | "released" | "mismatch" | "committed";

export interface ReservationSummary {
  total_reserved: number;
  recipe_daycare_portions: Record<string, number>;
}

export interface PublicationStatus {
  status: PublicationState;
  last_published_at: string | null;
  plan_id: string;
  published_plan_id: string | null;
  entry_count: number;
  drift: boolean;
  drift_reason: string | null;
  receipt: string | null;
}

export interface ShoppingPublicationStatus {
  status: PublicationState;
  last_published_at: string | null;
  plan_id: string;
  published_plan_id: string | null;
  list_id: string | null;
  item_count: number;
  drift: boolean;
  drift_reason: string | null;
  receipt: string | null;
}

export interface WeekResponse {
  week_start: string;
  generated_at: string | null;
  schema_version: number | null;
  committed: boolean;
  committed_at: string | null;
  stale: boolean;
  stale_reason: string | null;
  reservation_status: ReservationStatus;
  reservation: ReservationSummary;
  downstream_reservations_invalidated: string[];
  warnings: string[];
  artifacts: Record<string, string>;
  publication: PublicationStatus;
  plan: WeekPlan;
  /** Absent on a sidecar that predates the unlock feature — callers must treat a missing/falsy `available` as "hide the action", not an error. */
  unlock?: UnlockAvailability;
}

export type PublicationOutcomeStatus = "published" | "pending" | "ambiguous" | "failed" | "dry_run";

export interface PublishReceipt {
  schema_version: number;
  week_start: string;
  plan_id: string;
  status: "published" | "dry_run" | "ambiguous" | "failed";
  dry_run: boolean;
  forced: boolean;
  force_reason: string | null;
  published_at: string;
  counts: PublishCounts;
  created: (number | string | null)[];
  updated: (number | string | null)[];
  deleted: (number | string | null)[];
  unchanged: (number | string | null)[];
  foreign: (number | string | null)[];
  entries: PublishedEntry[];
  ambiguities: PublishAmbiguity[];
  warnings: string[];
  error: string | null;
  receipt_path: string | null;
  plan: PublishAction[];
}

export interface PublishCounts {
  created: number;
  updated: number;
  deleted: number;
  unchanged: number;
  foreign: number;
  ambiguous: number;
}

export interface PublishedEntry {
  entry_id: number | string | null;
  date: string | null;
  slot: string | null;
  entry_type: string | null;
  title: string | null;
  recipe_id: string | null;
  action: string;
}

export interface PublishAmbiguity {
  entry_id: number | string | null;
  date: string | null;
  reason: string;
  text: string | null;
}

export interface PublishAction {
  action: string;
  [key: string]: unknown;
}

export interface PublicationOutcome {
  status: PublicationOutcomeStatus;
  reason: string | null;
  error: string | null;
  code: string | null;
  receipt: PublishReceipt | null;
}

export interface ShoppingPublicationOutcome {
  status: PublicationOutcomeStatus;
  reason: string | null;
  error: string | null;
  code: string | null;
  receipt: ShoppingPublishReceipt | null;
}

export interface RegenerateResponse {
  week_start: string;
  plan: WeekPlan;
  warnings: string[];
  downstream_reservations_invalidated: string[];
  downstream_weeks_marked_stale: string[];
  publication: PublicationOutcome;
  shopping_publication: ShoppingPublicationOutcome;
}

export interface PublishRequest {
  dry_run?: boolean;
  force?: boolean;
  reason?: string | null;
}

export interface PrepPlan {
  schema_version: number;
  week_start: string;
  production: Record<string, unknown>[];
  simple_foods: Record<string, unknown>[];
  blockers: string[];
  summary: Record<string, unknown>;
}

export interface CompletionPreviewRecipe {
  recipe_slug: string;
  recipe_name: string;
  week_demand_daycare_portions: number;
  existing_inventory_allocated: number;
  new_production_daycare_portions: number;
  new_production_allocated_to_week: number;
  leftover_portions_to_inventory: number;
  leftover_storage: string | null;
}

export interface CompletionPreviewSummary {
  week_recipe_portions: number;
  existing_inventory_allocated: number;
  new_production_portions: number;
  new_production_allocated_to_week: number;
  leftover_portions_to_inventory: number;
}

export interface CompletionPreview {
  schema_version: number;
  week_start: string;
  recipes: CompletionPreviewRecipe[];
  summary: CompletionPreviewSummary;
}

export interface CompleteRequest {
  made_date?: string | null;
}

export interface CommitReceiptSummary {
  existing_inventory_allocated: number;
  leftover_portions_added: number;
  leftover_lots_added: number;
}

export interface CommitReceipt {
  schema_version: number;
  week_start: string;
  made_date: string;
  committed_at: string;
  summary: CommitReceiptSummary;
  /** Present on the sidecar's Artifact-typed response (extra="allow"); the full per-recipe breakdown behind `summary`. */
  completion_preview?: CompletionPreview | null;
}

export interface UndoResult {
  schema_version: number;
  week_start: string;
  undone_at: string;
  deleted_leftover_lot_ids: number[];
  restored_source_lots: Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// Unlock (uncommit a completed week)
// ---------------------------------------------------------------------------

export interface UnlockAvailability {
  available: boolean;
  safe: boolean;
  reasons: string[];
}

export interface UnlockReservationRelease {
  week: string;
  recipe: string;
  portions: number;
}

/**
 * `created_lots`/`consumed_lots_restored` entries are typed loosely (mirrors
 * `UndoResult.restored_source_lots` above) since the contract only pins down
 * `reservations_released`'s shape; the dialog reads an optional `portions`
 * field defensively rather than assuming every lot entry carries one.
 */
export interface UnlockPlan {
  created_lots: Record<string, unknown>[];
  consumed_lots_restored: Record<string, unknown>[];
  reservations_released: UnlockReservationRelease[];
  downstream_weeks_marked_stale: string[];
  safe: boolean;
  reasons: string[];
}

export type UnlockPreview = UnlockPlan;

export interface UnlockRequest {
  reason?: string | null;
  force?: boolean;
}

/**
 * Shape assumed to echo `UnlockPlan`'s fields plus what-actually-happened fields; the sidecar's
 * exact receipt schema isn't confirmed yet (see overlay/README.md's Phase F8 entry), so every
 * plan-shaped field here is optional and the dialog must render "detail unavailable" rather than
 * crash if the real receipt omits one — mirrors `CommitReceipt.completion_preview?` below.
 */
export interface UnlockReceipt {
  week_start: string;
  unlocked_at: string;
  reason?: string | null;
  forced?: boolean;
  created_lots?: Record<string, unknown>[];
  consumed_lots_restored?: Record<string, unknown>[];
  reservations_released?: UnlockReservationRelease[];
  downstream_weeks_marked_stale?: string[];
}

// ---------------------------------------------------------------------------
// Shopping
// ---------------------------------------------------------------------------

export interface ShoppingPlan {
  schema_version: number;
  week_start: string;
  basis: string;
  recipe_ingredients: Record<string, unknown>[];
  simple_foods: Record<string, unknown>[];
  review_items: Record<string, unknown>[];
  summary: Record<string, unknown>;
  publication: ShoppingPublicationStatus;
}

export interface ShoppingPublishCounts {
  created: number;
  updated: number;
  deleted: number;
  unchanged: number;
  foreign_items: number;
  foreign_lists: number;
  ambiguous: number;
}

export interface ShoppingPublishedItem {
  item_id: string | null;
  list_id: string | null;
  section: string | null;
  text: string | null;
  quantity: number | null;
  action: string;
}

export interface ShoppingAmbiguity {
  scope: "list" | "item";
  ref_id: string | null;
  reason: string;
  detail: string | null;
}

export interface ShoppingPublishAction {
  action: string;
  [key: string]: unknown;
}

export interface ShoppingPublishReceipt {
  schema_version: number;
  week_start: string;
  plan_id: string;
  status: "published" | "dry_run" | "ambiguous" | "failed";
  dry_run: boolean;
  forced: boolean;
  force_reason: string | null;
  published_at: string;
  list_id: string | null;
  list_created: boolean;
  counts: ShoppingPublishCounts;
  created: (string | null)[];
  updated: (string | null)[];
  deleted: (string | null)[];
  unchanged: (string | null)[];
  foreign_items: (string | null)[];
  foreign_lists: (string | null)[];
  entries: ShoppingPublishedItem[];
  ambiguities: ShoppingAmbiguity[];
  error: string | null;
  receipt_path: string | null;
  plan: ShoppingPublishAction[];
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export interface Lot {
  id: number;
  recipe_slug: string;
  portions_remaining: number;
  made_date: string | null;
  use_by: string | null;
  storage: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LotTotals {
  physical: number;
  reserved: number;
  free: number;
}

export interface InventorySummary {
  lot_count: number;
  physical: number;
  reserved: number;
  free: number;
}

export interface InventoryResponse {
  lots: Lot[];
  totals: Record<string, LotTotals>;
  summary: InventorySummary;
}

export interface LotCreate {
  recipe_slug: string;
  portions: number;
  made_date?: string | null;
  use_by?: string | null;
  storage?: StorageLocation;
  notes?: string | null;
}

export interface LotPatch {
  portions_remaining?: number;
  use_by?: string | null;
}

export interface LotConsumeRequest {
  portions: number;
}

export interface LotConsumeResponse {
  lot_id: number;
  recipe_slug: string;
  portions: number;
  portions_remaining: number;
  lot: Lot;
}

export interface ReservationRow {
  week_start: string;
  recipe_slug: string;
  portions: number;
  plan_generated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReservationWeek {
  week_start: string;
  total_reserved: number;
}

export interface ReservationsResponse {
  reservations: ReservationRow[];
  weeks: ReservationWeek[];
}

// ---------------------------------------------------------------------------
// Processing
// ---------------------------------------------------------------------------

export interface SnapshotInfo {
  path: string;
  exists: boolean;
  count: number | null;
  updated_at: string | null;
}

export interface CacheInfo {
  path: string;
  exists: boolean;
  entries: number | null;
  updated_at: string | null;
}

export interface QueueCounts {
  pending: number;
  running: number;
  succeeded: number;
  failed: number;
  dead_lettered: number;
  total: number;
}

export interface ProcessingWorkerStatus {
  enabled: boolean;
  running: boolean;
  cycles: number;
  last_error: string | null;
  llm_configured: boolean;
  llm_calls: number;
  write_enabled: boolean;
  poll_interval_seconds: number;
  quiet_seconds: number;
  overlap_seconds: number;
  max_attempts: number;
  [key: string]: unknown;
}

export interface ProcessingItem {
  recipe_id: string;
  slug: string | null;
  name: string | null;
  state: ProcessingState;
  fingerprint: string;
  processed_fingerprint: string | null;
  processed_at: string | null;
  attempts: number;
  last_error: string | null;
  last_result: Record<string, unknown> | null;
  next_attempt_at: string | null;
  lease_expires_at: string | null;
  changed_at: string;
  created_at: string;
  updated_at: string;
}

export interface Tombstone {
  recipe_id: string;
  slug: string | null;
  name: string | null;
  deleted_at: string;
  reason: string;
}

export interface ChangedRecipe {
  recipe_id: string;
  slug: string | null;
  name: string | null;
  at: string | null;
  kind: "processed" | "deleted";
}

export interface ChangedSincePlan {
  week: string | null;
  planned_at: string | null;
  count: number;
  recipes: ChangedRecipe[];
}

export interface ProcessingQueue {
  available: boolean;
  counts: QueueCounts;
  worker: ProcessingWorkerStatus | null;
  high_water_mark: string | null;
  last_poll_at: string | null;
  last_poll: Record<string, unknown> | null;
  last_cycle: Record<string, unknown> | null;
  baseline: Record<string, unknown> | null;
  dead_letters: ProcessingItem[];
  tombstones: Tombstone[];
  recent: ProcessingItem[];
  changed_since_plan: ChangedSincePlan;
}

export interface ProcessingStatus {
  write_enabled: boolean;
  last_export_at: string | null;
  recipe_count: number;
  snapshots: Record<string, SnapshotInfo>;
  caches: Record<string, CacheInfo>;
  recipes_lacking_classification: string[];
  recipes_lacking_normalization: string[];
  recipes_lacking_daycare_yield: string[];
  llm_triggered: false;
  processing: ProcessingQueue;
}

export interface PollRequest {
  full?: boolean;
  wait?: boolean;
}

export interface PollResponse {
  ran: boolean;
  scheduled: boolean;
  report: Record<string, unknown> | null;
  counts: QueueCounts;
}

export interface RetryResponse {
  item: ProcessingItem;
}
