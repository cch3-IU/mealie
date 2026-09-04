import { flushPromises } from "@vue/test-utils";
import { describe, expect, test, vi } from "vitest";
import {
  currentWeekStart,
  deriveProcessingNote,
  findNextPlannedUse,
  slotRolesToUsesPatch,
  useRecipeDaycare,
  usesToSlotRoles,
} from "../use-recipe-daycare";
import type { PlanDay, ProcessingItem, ProcessingStatus } from "~/lib/api/types/daycare";

const daycareApi = {
  getRecipeDaycare: vi.fn(),
  getInventory: vi.fn(),
  getSettings: vi.fn(),
  getWeek: vi.fn(),
  getProcessingStatus: vi.fn(),
  updateRecipeDaycare: vi.fn(),
  getIngredientWritebackPreview: vi.fn(),
  applyIngredientWriteback: vi.fn(),
  undoIngredientWriteback: vi.fn(),
};

vi.mock("~/composables/api", () => ({
  useUserApi: () => ({ daycare: daycareApi }),
}));

function ok<T>(data: T) {
  return { data, error: null };
}

function httpError(status: number, code = "some_error", message = "It broke") {
  return { data: null, error: { response: { status, data: { error: { code, message } } } } };
}

function resetMocks() {
  Object.values(daycareApi).forEach(fn => fn.mockReset());
}

const recipeDaycareFixture = {
  slug: "chicken-barley-soup",
  name: "Chicken Barley Soup",
  recipe_id: "r1",
  classified: false,
  classification: null,
  override_applied: false,
  override: null,
  settings: { enabled: true, daycare_portions_per_batch: 6, max_uses_per_week: null, max_inventory_uses_per_week: null, score_adjustment: null, reason: null },
  ingredient_writeback: false,
};

const settingsFixture = {
  planning: {
    max_recipe_uses_per_week: 2,
    max_inventory_recipe_uses_per_week: 3,
    min_recipe_gap_days: 1,
    min_same_slot_recipe_gap_days: 1,
    max_rotation_group_uses_per_week: 2,
    min_rotation_gap_days: 1,
    max_new_production_recipes_per_week: 1,
    max_new_production_recipes_by_slot: { breakfast: null, lunch: null, snack: null },
    history_weeks: 4,
  },
  production: { prefer_prepared_inventory: true, avoid_new_production: true },
  automation: {
    weekly_planning_enabled: false,
    planning_weekday: "wednesday" as const,
    planning_time: "06:00",
    timezone: "America/Indiana/Indianapolis",
    auto_publish_meal_plan: false,
    auto_publish_shopping_list: false,
    ingredient_writeback_enabled: false,
  },
  config_version: 1,
  week_start_weekday: "wednesday" as const,
  weekdays: ["wednesday", "thursday", "friday", "saturday", "sunday", "monday", "tuesday"] as const,
};

describe("currentWeekStart", () => {
  test("today, when today is the week-start weekday", () => {
    // 2026-01-07 is a Wednesday.
    expect(currentWeekStart("wednesday", new Date(2026, 0, 7))).toEqual("2026-01-07");
  });

  test("the most recent occurrence, not the next one, mid-week", () => {
    // 2026-01-09 is a Friday, two days after Wednesday 2026-01-07.
    expect(currentWeekStart("wednesday", new Date(2026, 0, 9))).toEqual("2026-01-07");
  });

  test("defaults to monday", () => {
    // 2026-01-05 is a Monday.
    expect(currentWeekStart(undefined, new Date(2026, 0, 8))).toEqual("2026-01-05");
  });
});

function planDay(date: string, day: string, recipeSlug: string | null, slot: "breakfast" | "lunch" | "snack_am" | "snack_pm" = "lunch"): PlanDay {
  const emptySlot = { recipe: null as unknown as PlanDay["breakfast"]["recipe"], produce_side: null, companion: null };
  const filledSlot = recipeSlug
    ? { recipe: { slug: recipeSlug, name: recipeSlug, role: "main", roles: ["main"], rotation_group: null, inventory_available_at_plan_time: null, production_activated: null }, produce_side: null, companion: null }
    : emptySlot;
  return {
    date,
    day,
    breakfast: { ...emptySlot },
    lunch: { ...emptySlot },
    snack_am: { ...emptySlot },
    snack_pm: { ...emptySlot },
    [slot]: filledSlot,
  } as PlanDay;
}

describe("findNextPlannedUse", () => {
  test("returns null when there's no plan", () => {
    expect(findNextPlannedUse(null, "chicken-barley-soup")).toBeNull();
  });

  test("returns null when the recipe isn't in any day", () => {
    const plan = { days: [planDay("2026-01-06", "tuesday", "other-recipe")] };
    expect(findNextPlannedUse(plan, "chicken-barley-soup", "2026-01-05")).toBeNull();
  });

  test("skips days before today and returns the next match", () => {
    const plan = {
      days: [
        planDay("2026-01-04", "sunday", "chicken-barley-soup"),
        planDay("2026-01-06", "tuesday", "chicken-barley-soup", "snack_pm"),
      ],
    };
    const result = findNextPlannedUse(plan, "chicken-barley-soup", "2026-01-05");
    expect(result).toEqual({ date: "2026-01-06", day: "tuesday", slot: "snack_pm", role: "main" });
  });
});

describe("uses <-> slot roles round trip", () => {
  test("usesToSlotRoles builds a per-slot map", () => {
    const uses = [{ slot: "lunch" as const, roles: ["main" as const] }, { slot: "snack" as const, roles: ["produce" as const, "addon" as const] }];
    expect(usesToSlotRoles(uses)).toEqual({ lunch: ["main"], snack: ["produce", "addon"] });
  });

  test("usesToSlotRoles handles undefined", () => {
    expect(usesToSlotRoles(undefined)).toEqual({});
  });

  test("slotRolesToUsesPatch fills all three slots, nulling out unselected ones", () => {
    const patch = slotRolesToUsesPatch({ lunch: ["main"] });
    expect(patch).toEqual({ breakfast: null, lunch: ["main"], snack: null });
  });

  test("slotRolesToUsesPatch treats an empty roles array the same as absent", () => {
    const patch = slotRolesToUsesPatch({ lunch: [] });
    expect(patch.lunch).toBeNull();
  });
});

function processingItem(overrides: Partial<ProcessingItem> = {}): ProcessingItem {
  return {
    recipe_id: "r1",
    slug: "chicken-barley-soup",
    name: "Chicken Barley Soup",
    state: "succeeded",
    fingerprint: "f1",
    processed_fingerprint: "f1",
    processed_at: "2026-01-01T00:00:00Z",
    attempts: 1,
    last_error: null,
    last_result: null,
    next_attempt_at: null,
    lease_expires_at: null,
    changed_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function processingFixture(overrides: Partial<ProcessingStatus> = {}): ProcessingStatus {
  return {
    write_enabled: true,
    last_export_at: null,
    recipe_count: 11,
    snapshots: {},
    caches: {},
    recipes_lacking_classification: [],
    recipes_lacking_normalization: [],
    recipes_lacking_daycare_yield: [],
    llm_triggered: false,
    processing: {
      available: true,
      counts: { pending: 0, running: 0, succeeded: 11, failed: 0, dead_lettered: 0, total: 11 },
      worker: null,
      high_water_mark: null,
      last_poll_at: null,
      last_poll: null,
      last_cycle: null,
      baseline: null,
      dead_letters: [],
      tombstones: [],
      recent: [],
      changed_since_plan: { week: null, planned_at: null, count: 0, recipes: [] },
    },
    ingredient_writeback: { enabled: false, written: 0, eligible: 0, ambiguous: 0 },
    ...overrides,
  };
}

describe("deriveProcessingNote", () => {
  test("returns null when there's no processing report", () => {
    expect(deriveProcessingNote(null, "chicken-barley-soup")).toBeNull();
  });

  test("returns null when the recipe has no recent activity and isn't flagged", () => {
    expect(deriveProcessingNote(processingFixture(), "chicken-barley-soup")).toBeNull();
  });

  test("surfaces the most recent state and error for this recipe", () => {
    const processing = processingFixture({
      processing: {
        ...processingFixture().processing,
        recent: [processingItem({ state: "failed", last_error: "LLM timeout" })],
      },
    });
    expect(deriveProcessingNote(processing, "chicken-barley-soup")).toEqual({ state: "failed", lastError: "LLM timeout", lackingYield: false });
  });

  test("flags a recipe missing its daycare yield even with no recent activity", () => {
    const processing = processingFixture({ recipes_lacking_daycare_yield: ["chicken-barley-soup"] });
    expect(deriveProcessingNote(processing, "chicken-barley-soup")).toEqual({ state: null, lastError: null, lackingYield: true });
  });

  test("ignores recent activity for a different recipe", () => {
    const processing = processingFixture({
      processing: { ...processingFixture().processing, recent: [processingItem({ slug: "other-recipe" })] },
    });
    expect(deriveProcessingNote(processing, "chicken-barley-soup")).toBeNull();
  });
});

describe("useRecipeDaycare", () => {
  test("load() populates recipeDaycare, inventory, processing, and week on success", async () => {
    resetMocks();
    daycareApi.getRecipeDaycare.mockResolvedValue(ok(recipeDaycareFixture));
    daycareApi.getSettings.mockResolvedValue(ok(settingsFixture));
    daycareApi.getInventory.mockResolvedValue(ok({ lots: [], totals: { "chicken-barley-soup": { physical: 3, reserved: 0, free: 3 } }, summary: { lot_count: 1, physical: 3, reserved: 0, free: 3 } }));
    daycareApi.getProcessingStatus.mockResolvedValue(ok(processingFixture()));
    daycareApi.getWeek.mockResolvedValue(ok({ plan: { days: [] } }));

    const daycare = useRecipeDaycare("chicken-barley-soup");
    await daycare.load();

    expect(daycare.recipeDaycare.data.value).toEqual(recipeDaycareFixture);
    expect(daycare.forbidden.value).toBe(false);
    expect(daycare.preparedPortions.value).toEqual({ physical: 3, reserved: 0, free: 3 });
    expect(daycareApi.getWeek).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(daycareApi.getProcessingStatus).toHaveBeenCalledTimes(1);
  });

  test("a 404 marks recipeDaycare empty, not an error, and still loads inventory", async () => {
    resetMocks();
    daycareApi.getRecipeDaycare.mockResolvedValue(httpError(404, "recipe_not_found"));
    daycareApi.getSettings.mockResolvedValue(ok(settingsFixture));
    daycareApi.getInventory.mockResolvedValue(ok({ lots: [], totals: {}, summary: { lot_count: 0, physical: 0, reserved: 0, free: 0 } }));
    daycareApi.getProcessingStatus.mockResolvedValue(ok(processingFixture()));
    daycareApi.getWeek.mockResolvedValue(ok({ plan: { days: [] } }));

    const daycare = useRecipeDaycare("new-recipe");
    await daycare.load();

    expect(daycare.recipeDaycare.empty.value).toBe(true);
    expect(daycare.recipeDaycare.error.value).toBeNull();
    expect(daycare.forbidden.value).toBe(false);
  });

  test("a 403 sets forbidden and skips inventory/settings/week entirely", async () => {
    resetMocks();
    daycareApi.getRecipeDaycare.mockResolvedValue(httpError(403, "forbidden"));

    const daycare = useRecipeDaycare("chicken-barley-soup");
    await daycare.load();

    expect(daycare.forbidden.value).toBe(true);
    expect(daycareApi.getInventory).not.toHaveBeenCalled();
    expect(daycareApi.getSettings).not.toHaveBeenCalled();
    expect(daycareApi.getWeek).not.toHaveBeenCalled();
    expect(daycareApi.getProcessingStatus).not.toHaveBeenCalled();
  });

  test("a 502 surfaces as an unreachable error and skips the rest", async () => {
    resetMocks();
    daycareApi.getRecipeDaycare.mockResolvedValue(httpError(502));

    const daycare = useRecipeDaycare("chicken-barley-soup");
    await daycare.load();

    expect(daycare.forbidden.value).toBe(false);
    expect(daycare.recipeDaycare.error.value?.kind).toEqual("unreachable");
    expect(daycareApi.getInventory).not.toHaveBeenCalled();
    expect(daycareApi.getProcessingStatus).not.toHaveBeenCalled();
  });

  test("inventory, processing, and settings fetch concurrently, not sequentially", async () => {
    resetMocks();
    daycareApi.getRecipeDaycare.mockResolvedValue(ok(recipeDaycareFixture));
    daycareApi.getWeek.mockResolvedValue(ok({ plan: { days: [] } }));

    const order: string[] = [];
    let releaseSettings!: () => void;
    daycareApi.getSettings.mockImplementation(() => new Promise((resolve) => {
      releaseSettings = () => { order.push("settings"); resolve(ok(settingsFixture)); };
    }));
    daycareApi.getInventory.mockImplementation(() => {
      order.push("inventory");
      return Promise.resolve(ok({ lots: [], totals: {}, summary: { lot_count: 0, physical: 0, reserved: 0, free: 0 } }));
    });
    daycareApi.getProcessingStatus.mockImplementation(() => {
      order.push("processing");
      return Promise.resolve(ok(processingFixture()));
    });

    const daycare = useRecipeDaycare("chicken-barley-soup");
    const loadPromise = daycare.load();

    // Inventory and processing resolve before settings does, proving they were fired without waiting on it.
    await flushPromises();
    expect(order).toEqual(expect.arrayContaining(["inventory", "processing"]));
    expect(order).not.toContain("settings");

    releaseSettings();
    await loadPromise;

    expect(daycareApi.getWeek).toHaveBeenCalledTimes(1);
  });

  test("retryInventory refetches only the inventory resource", async () => {
    resetMocks();
    daycareApi.getInventory.mockResolvedValueOnce({ data: null, error: { response: { status: 502, data: {} } } });
    daycareApi.getInventory.mockResolvedValueOnce(ok({ lots: [], totals: { "chicken-barley-soup": { physical: 4, reserved: 0, free: 4 } }, summary: { lot_count: 1, physical: 4, reserved: 0, free: 4 } }));

    const daycare = useRecipeDaycare("chicken-barley-soup");
    await daycare.retryInventory();
    expect(daycare.inventory.error.value?.kind).toEqual("unreachable");
    expect(daycare.preparedPortions.value).toBeNull();

    await daycare.retryInventory();
    expect(daycare.inventory.error.value).toBeNull();
    expect(daycare.preparedPortions.value).toEqual({ physical: 4, reserved: 0, free: 4 });
    expect(daycareApi.getInventory).toHaveBeenCalledTimes(2);
    expect(daycareApi.getRecipeDaycare).not.toHaveBeenCalled();
  });

  test("updateRecipeDaycare replaces recipeDaycare.data on success", async () => {
    resetMocks();
    const updated = { ...recipeDaycareFixture, settings: { ...recipeDaycareFixture.settings, enabled: false } };
    daycareApi.updateRecipeDaycare.mockResolvedValue(ok(updated));

    const daycare = useRecipeDaycare("chicken-barley-soup");
    const result = await daycare.updateRecipeDaycare({ settings: { enabled: false } });

    expect(result.error).toBeNull();
    expect(daycare.recipeDaycare.data.value).toEqual(updated);
    expect(daycareApi.updateRecipeDaycare).toHaveBeenCalledWith("chicken-barley-soup", { settings: { enabled: false } });
  });

  test("updateRecipeDaycare maps a failure without touching recipeDaycare.data", async () => {
    resetMocks();
    daycareApi.updateRecipeDaycare.mockResolvedValue(httpError(409, "recipe_not_classified"));

    const daycare = useRecipeDaycare("chicken-barley-soup");
    const result = await daycare.updateRecipeDaycare({ classification: { uses: { lunch: ["main"] } } });

    expect(result.error?.kind).toEqual("conflict");
    expect(daycare.recipeDaycare.data.value).toBeNull();
  });

  test("getIngredientWritebackPreview is a plain on-demand read", async () => {
    resetMocks();
    const preview = {
      slug: "chicken-barley-soup",
      fingerprint_ok: true,
      fingerprint_reason: null,
      enabled_global: true,
      enabled_recipe: true,
      write_enabled: true,
      can_apply: true,
      rows: [],
      creations: [],
      ambiguities: [],
      skipped: [],
      receipt: null,
    };
    daycareApi.getIngredientWritebackPreview.mockResolvedValue(ok(preview));

    const daycare = useRecipeDaycare("chicken-barley-soup");
    const result = await daycare.getIngredientWritebackPreview();

    expect(result.data).toEqual(preview);
    expect(daycareApi.getIngredientWritebackPreview).toHaveBeenCalledWith("chicken-barley-soup");
  });

  test("applyIngredientWriteback forwards an explicit Idempotency-Key and toggles mutating", async () => {
    resetMocks();
    const receipt = { slug: "chicken-barley-soup", applied_at: "2026-01-01T00:00:00Z", fingerprint: "f1", rows_written: 2, rows_plain: 1, foods_created: [], units_created: [], verified: true, receipt_path: null };
    daycareApi.applyIngredientWriteback.mockResolvedValue(ok(receipt));

    const daycare = useRecipeDaycare("chicken-barley-soup");
    expect(daycare.mutating.value).toBe(false);
    const result = await daycare.applyIngredientWriteback("11111111-1111-4111-8111-111111111111");

    expect(result.data).toEqual(receipt);
    expect(daycare.mutating.value).toBe(false);
    expect(daycareApi.applyIngredientWriteback).toHaveBeenCalledWith(
      "chicken-barley-soup",
      { headers: { "Idempotency-Key": "11111111-1111-4111-8111-111111111111" } },
    );
  });

  test("applyIngredientWriteback maps a 409 writeback_disabled failure", async () => {
    resetMocks();
    daycareApi.applyIngredientWriteback.mockResolvedValue(httpError(409, "writeback_disabled", "Ingredient write-back is turned off."));

    const daycare = useRecipeDaycare("chicken-barley-soup");
    const result = await daycare.applyIngredientWriteback();

    expect(result.data).toBeNull();
    expect(result.error?.code).toEqual("writeback_disabled");
    expect(result.error?.kind).toEqual("conflict");
  });

  test("undoIngredientWriteback forwards an explicit Idempotency-Key", async () => {
    resetMocks();
    const undoResult = { slug: "chicken-barley-soup", restored_at: "2026-01-01T00:00:00Z", rows_restored: 2 };
    daycareApi.undoIngredientWriteback.mockResolvedValue(ok(undoResult));

    const daycare = useRecipeDaycare("chicken-barley-soup");
    const result = await daycare.undoIngredientWriteback("22222222-2222-4222-8222-222222222222");

    expect(result.data).toEqual(undoResult);
    expect(daycareApi.undoIngredientWriteback).toHaveBeenCalledWith(
      "chicken-barley-soup",
      { headers: { "Idempotency-Key": "22222222-2222-4222-8222-222222222222" } },
    );
  });
});
