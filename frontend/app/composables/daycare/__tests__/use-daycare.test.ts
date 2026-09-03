import { describe, expect, test, vi } from "vitest";
import { mapDaycareError, nextWeekStart, useDaycare } from "../use-daycare";

const daycareApi = {
  getStatus: vi.fn(),
  getSettings: vi.fn(),
  getWeek: vi.fn(),
  getPrep: vi.fn(),
  getShopping: vi.fn(),
  getInventory: vi.fn(),
  getReservations: vi.fn(),
  getProcessingStatus: vi.fn(),
  regenerateWeek: vi.fn(),
  publishWeek: vi.fn(),
  publishShopping: vi.fn(),
  completeWeek: vi.fn(),
  undoCompleteWeek: vi.fn(),
  updateSettings: vi.fn(),
};

let currentUser: { admin?: boolean } | null = { admin: false };

vi.mock("~/composables/api", () => ({
  useUserApi: () => ({ daycare: daycareApi }),
}));

vi.mock("~/composables/use-mealie-auth", () => ({
  useMealieAuth: () => ({ user: { value: currentUser } }),
}));

function ok<T>(data: T) {
  return { data, error: null };
}

function httpError(status: number, code = "some_error", message = "It broke") {
  return { data: null, error: { response: { status, data: { error: { code, message } } } } };
}

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
  },
  config_version: 1,
  week_start_weekday: "wednesday" as const,
  weekdays: ["wednesday", "thursday", "friday", "saturday", "sunday", "monday", "tuesday"] as const,
};

function resetMocks() {
  Object.values(daycareApi).forEach(fn => fn.mockReset());
  daycareApi.getStatus.mockResolvedValue(ok({ service: "daycare" }));
  daycareApi.getSettings.mockResolvedValue(ok(settingsFixture));
  daycareApi.getWeek.mockResolvedValue(ok({ week_start: "x" }));
  daycareApi.getPrep.mockResolvedValue(ok({ week_start: "x" }));
  daycareApi.getShopping.mockResolvedValue(ok({ week_start: "x" }));
  daycareApi.getInventory.mockResolvedValue(ok({ lots: [] }));
  daycareApi.getReservations.mockResolvedValue(ok({ reservations: [] }));
  daycareApi.getProcessingStatus.mockResolvedValue(ok({ recipe_count: 0 }));
}

describe("mapDaycareError", () => {
  test("no response means the sidecar/network is unreachable client-side", () => {
    expect(mapDaycareError(null).kind).toEqual("offline");
    expect(mapDaycareError({}).kind).toEqual("offline");
  });

  test.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [404, "not-found"],
    [409, "conflict"],
    [422, "validation"],
    [502, "unreachable"],
    [503, "unreachable"],
    [500, "server"],
    [418, "unknown"],
  ])("status %d maps to kind %s", (status, kind) => {
    const error = { response: { status, data: { error: { code: "c", message: "m" } } } };
    expect(mapDaycareError(error).kind).toEqual(kind);
  });

  test("carries the server's code and message through", () => {
    const error = { response: { status: 409, data: { error: { code: "week_committed", message: "That week is already committed." } } } };
    const mapped = mapDaycareError(error);
    expect(mapped.code).toEqual("week_committed");
    expect(mapped.message).toEqual("That week is already committed.");
  });
});

describe("nextWeekStart", () => {
  test("returns next week's date for the given start weekday, never today", () => {
    // 2026-08-19 is a Wednesday.
    const wednesday = new Date(2026, 7, 19);
    expect(nextWeekStart("wednesday", wednesday)).toEqual("2026-08-26");
    expect(nextWeekStart("monday", wednesday)).toEqual("2026-08-24");
    expect(nextWeekStart("thursday", wednesday)).toEqual("2026-08-20");
  });
});

describe("useDaycare permissions", () => {
  test("gates admin-only actions on the Mealie user's admin flag", () => {
    currentUser = { admin: true };
    expect(useDaycare().isAdmin.value).toBe(true);

    currentUser = { admin: false };
    expect(useDaycare().isAdmin.value).toBe(false);
  });

  test("canView is true for any signed-in household user", () => {
    currentUser = { admin: false };
    expect(useDaycare().canView.value).toBe(true);

    currentUser = null;
    expect(useDaycare().canView.value).toBe(false);
  });
});

describe("useDaycare refresh", () => {
  test("derives the auto-selected week from settings before fetching week-scoped resources", async () => {
    resetMocks();
    currentUser = { admin: true };
    const daycare = useDaycare();

    await daycare.refresh();

    expect(daycare.selectedWeek.value).toEqual(nextWeekStart("wednesday"));
    // Exactly one fetch per week-scoped resource — no double-fetch from re-deriving the week.
    expect(daycareApi.getWeek).toHaveBeenCalledTimes(1);
    expect(daycareApi.getPrep).toHaveBeenCalledTimes(1);
    expect(daycareApi.getShopping).toHaveBeenCalledTimes(1);
    expect(daycareApi.getWeek).toHaveBeenCalledWith(nextWeekStart("wednesday"));
  });

  test("an explicit initial week is never overridden by settings", async () => {
    resetMocks();
    const daycare = useDaycare({ week: "2026-01-05" });

    await daycare.refresh();

    expect(daycare.selectedWeek.value).toEqual("2026-01-05");
    expect(daycareApi.getWeek).toHaveBeenCalledWith("2026-01-05");
  });

  test("a week with no stored plan (404) is an empty state, not an error", async () => {
    resetMocks();
    daycareApi.getWeek.mockResolvedValue(httpError(404, "not_found", "no plan"));
    const daycare = useDaycare({ week: "2026-01-05" });

    await daycare.refresh();

    expect(daycare.week.empty.value).toBe(true);
    expect(daycare.week.error.value).toBeNull();
    expect(daycare.week.data.value).toBeNull();
  });

  test("a real failure (e.g. sidecar unreachable) surfaces as an error, not empty", async () => {
    resetMocks();
    daycareApi.getStatus.mockResolvedValue(httpError(503, "mealie_unavailable", "Mealie is unavailable."));
    const daycare = useDaycare({ week: "2026-01-05" });

    await daycare.refresh();

    expect(daycare.status.error.value?.kind).toEqual("unreachable");
    expect(daycare.status.error.value?.message).toEqual("Mealie is unavailable.");
  });
});

describe("useDaycare setSelectedWeek", () => {
  test("changing the week refetches only the week-scoped resources", async () => {
    resetMocks();
    const daycare = useDaycare({ week: "2026-01-05" });
    await daycare.refresh();
    daycareApi.getWeek.mockClear();
    daycareApi.getPrep.mockClear();
    daycareApi.getShopping.mockClear();
    daycareApi.getInventory.mockClear();

    await daycare.setSelectedWeek("2026-01-12");

    expect(daycare.selectedWeek.value).toEqual("2026-01-12");
    expect(daycareApi.getWeek).toHaveBeenCalledWith("2026-01-12");
    expect(daycareApi.getPrep).toHaveBeenCalledWith("2026-01-12");
    expect(daycareApi.getShopping).toHaveBeenCalledWith("2026-01-12");
    expect(daycareApi.getInventory).not.toHaveBeenCalled();
  });
});

describe("useDaycare mutations", () => {
  test("regenerateWeek requests then refetches the week, prep, shopping and status", async () => {
    resetMocks();
    daycareApi.regenerateWeek.mockResolvedValue(ok({ week_start: "2026-01-05" }));
    const daycare = useDaycare({ week: "2026-01-05" });
    await daycare.refresh();
    daycareApi.getWeek.mockClear();
    daycareApi.getPrep.mockClear();
    daycareApi.getShopping.mockClear();
    daycareApi.getStatus.mockClear();

    const result = await daycare.regenerateWeek();

    expect(daycareApi.regenerateWeek).toHaveBeenCalledWith("2026-01-05");
    expect(daycareApi.getWeek).toHaveBeenCalledTimes(1);
    expect(daycareApi.getPrep).toHaveBeenCalledTimes(1);
    expect(daycareApi.getShopping).toHaveBeenCalledTimes(1);
    expect(daycareApi.getStatus).toHaveBeenCalledTimes(1);
    expect(result.error).toBeNull();
  });

  test("a failed mutation still refetches and surfaces the mapped error", async () => {
    resetMocks();
    daycareApi.regenerateWeek.mockResolvedValue(httpError(409, "week_committed", "Week is committed."));
    const daycare = useDaycare({ week: "2026-01-05" });
    await daycare.refresh();

    const result = await daycare.regenerateWeek();

    expect(result.data).toBeNull();
    expect(result.error?.kind).toEqual("conflict");
    expect(result.error?.message).toEqual("Week is committed.");
  });

  test("updateSettings requests then refetches settings only", async () => {
    resetMocks();
    daycareApi.updateSettings.mockResolvedValue(ok(settingsFixture));
    const daycare = useDaycare({ week: "2026-01-05" });
    await daycare.refresh();
    daycareApi.getSettings.mockClear();
    daycareApi.getWeek.mockClear();

    await daycare.updateSettings({
      planning: settingsFixture.planning,
      production: settingsFixture.production,
      automation: settingsFixture.automation,
    });

    expect(daycareApi.updateSettings).toHaveBeenCalledTimes(1);
    expect(daycareApi.getSettings).toHaveBeenCalledTimes(1);
    expect(daycareApi.getWeek).not.toHaveBeenCalled();
  });
});
