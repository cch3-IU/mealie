import { describe, expect, test, vi } from "vitest";
import { DaycareAPI, newIdempotencyKey } from "./daycare";
import type { ApiRequestInstance } from "~/lib/api/types/non-generated";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createRequests(): ApiRequestInstance {
  return {
    get: vi.fn().mockResolvedValue({ data: null, error: null, response: null }),
    post: vi.fn().mockResolvedValue({ data: null, error: null, response: null }),
    put: vi.fn().mockResolvedValue({ data: null, error: null, response: null }),
    patch: vi.fn().mockResolvedValue({ data: null, error: null, response: null }),
    delete: vi.fn().mockResolvedValue({ data: null, error: null, response: null }),
  };
}

describe("newIdempotencyKey", () => {
  test("generates a v4 UUID", () => {
    expect(newIdempotencyKey()).toMatch(UUID_RE);
  });

  test("generates a different key each time", () => {
    expect(newIdempotencyKey()).not.toEqual(newIdempotencyKey());
  });
});

describe("DaycareAPI reads", () => {
  test("getStatus hits /api/daycare/v1/status with no Idempotency-Key", async () => {
    const requests = createRequests();
    await new DaycareAPI(requests).getStatus();
    expect(requests.get).toHaveBeenCalledWith("/api/daycare/v1/status", undefined, undefined);
  });

  test("getSettings hits /api/daycare/v1/settings", async () => {
    const requests = createRequests();
    await new DaycareAPI(requests).getSettings();
    expect(requests.get).toHaveBeenCalledWith("/api/daycare/v1/settings", undefined, undefined);
  });

  test("getWeek shapes the path with the week param", async () => {
    const requests = createRequests();
    await new DaycareAPI(requests).getWeek("2026-09-07");
    expect(requests.get).toHaveBeenCalledWith("/api/daycare/v1/weeks/2026-09-07", undefined, undefined);
  });

  test("getPrep, getShopping and getCompletionPreview shape their sub-paths", async () => {
    const requests = createRequests();
    const api = new DaycareAPI(requests);
    await api.getPrep("2026-09-07");
    await api.getCompletionPreview("2026-09-07");
    await api.getShopping("2026-09-07");
    expect(requests.get).toHaveBeenNthCalledWith(1, "/api/daycare/v1/weeks/2026-09-07/prep", undefined, undefined);
    expect(requests.get).toHaveBeenNthCalledWith(2, "/api/daycare/v1/weeks/2026-09-07/completion-preview", undefined, undefined);
    expect(requests.get).toHaveBeenNthCalledWith(3, "/api/daycare/v1/weeks/2026-09-07/shopping", undefined, undefined);
  });

  test("getRecipeDaycare shapes the recipe slug into the path", async () => {
    const requests = createRequests();
    await new DaycareAPI(requests).getRecipeDaycare("chicken-barley-soup");
    expect(requests.get).toHaveBeenCalledWith("/api/daycare/v1/recipes/chicken-barley-soup/daycare", undefined, undefined);
  });

  test("getInventory, getReservations and getProcessingStatus hit their fixed paths", async () => {
    const requests = createRequests();
    const api = new DaycareAPI(requests);
    await api.getInventory();
    await api.getReservations();
    await api.getProcessingStatus();
    expect(requests.get).toHaveBeenNthCalledWith(1, "/api/daycare/v1/inventory", undefined, undefined);
    expect(requests.get).toHaveBeenNthCalledWith(2, "/api/daycare/v1/reservations", undefined, undefined);
    expect(requests.get).toHaveBeenNthCalledWith(3, "/api/daycare/v1/processing", undefined, undefined);
  });
});

describe("DaycareAPI mutations attach a fresh Idempotency-Key", () => {
  test("regenerateWeek posts to the regenerate path with a UUID header", async () => {
    const requests = createRequests();
    await new DaycareAPI(requests).regenerateWeek("2026-09-07");
    expect(requests.post).toHaveBeenCalledTimes(1);
    const [url, body, config] = vi.mocked(requests.post).mock.calls[0];
    expect(url).toEqual("/api/daycare/v1/weeks/2026-09-07/regenerate");
    expect(body).toEqual({});
    expect(config?.headers?.["Idempotency-Key"]).toMatch(UUID_RE);
  });

  test("publishWeek forwards dry_run/force and attaches a UUID header", async () => {
    const requests = createRequests();
    await new DaycareAPI(requests).publishWeek("2026-09-07", { dry_run: true });
    const [url, body, config] = vi.mocked(requests.post).mock.calls[0];
    expect(url).toEqual("/api/daycare/v1/weeks/2026-09-07/publish");
    expect(body).toEqual({ dry_run: true });
    expect(config?.headers?.["Idempotency-Key"]).toMatch(UUID_RE);
  });

  test("publishShopping posts to the shopping publish path with a UUID header", async () => {
    const requests = createRequests();
    await new DaycareAPI(requests).publishShopping("2026-09-07", { force: true, reason: "admin override" });
    const [url, body, config] = vi.mocked(requests.post).mock.calls[0];
    expect(url).toEqual("/api/daycare/v1/weeks/2026-09-07/shopping/publish");
    expect(body).toEqual({ force: true, reason: "admin override" });
    expect(config?.headers?.["Idempotency-Key"]).toMatch(UUID_RE);
  });

  test("completeWeek and undoCompleteWeek attach a UUID header", async () => {
    const requests = createRequests();
    const api = new DaycareAPI(requests);
    await api.completeWeek("2026-09-07", { made_date: "2026-09-08" });
    await api.undoCompleteWeek("2026-09-07");
    const completeCall = vi.mocked(requests.post).mock.calls[0];
    const undoCall = vi.mocked(requests.post).mock.calls[1];
    expect(completeCall[0]).toEqual("/api/daycare/v1/weeks/2026-09-07/complete");
    expect(completeCall[2]?.headers?.["Idempotency-Key"]).toMatch(UUID_RE);
    expect(undoCall[0]).toEqual("/api/daycare/v1/weeks/2026-09-07/undo-complete");
    expect(undoCall[2]?.headers?.["Idempotency-Key"]).toMatch(UUID_RE);
  });

  test("updateSettings PUTs with a UUID header (admin-only route, enforced server-side)", async () => {
    const requests = createRequests();
    const payload = {
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
        planning_weekday: "monday" as const,
        planning_time: "06:00",
        timezone: "America/Indiana/Indianapolis",
        auto_publish_meal_plan: false,
        auto_publish_shopping_list: false,
      },
    };
    await new DaycareAPI(requests).updateSettings(payload);
    const [url, body, config] = vi.mocked(requests.put).mock.calls[0];
    expect(url).toEqual("/api/daycare/v1/settings");
    expect(body).toEqual(payload);
    expect(config?.headers?.["Idempotency-Key"]).toMatch(UUID_RE);
  });

  test("updateRecipeDaycare and updateSimpleFood PUT with a UUID header", async () => {
    const requests = createRequests();
    const api = new DaycareAPI(requests);
    await api.updateRecipeDaycare("chicken-barley-soup", { settings: { enabled: false } });
    await api.updateSimpleFood("apple-slices", { kind: "produce", enabled: true, groups: ["fruit"] });
    const recipeCall = vi.mocked(requests.put).mock.calls[0];
    const foodCall = vi.mocked(requests.put).mock.calls[1];
    expect(recipeCall[0]).toEqual("/api/daycare/v1/recipes/chicken-barley-soup/daycare");
    expect(recipeCall[2]?.headers?.["Idempotency-Key"]).toMatch(UUID_RE);
    expect(foodCall[0]).toEqual("/api/daycare/v1/simple-foods/apple-slices");
    expect(foodCall[2]?.headers?.["Idempotency-Key"]).toMatch(UUID_RE);
  });

  test("pollProcessing posts to the poll path with a UUID header", async () => {
    const requests = createRequests();
    await new DaycareAPI(requests).pollProcessing({ full: true, wait: false });
    const [url, body, config] = vi.mocked(requests.post).mock.calls[0];
    expect(url).toEqual("/api/daycare/v1/processing/poll");
    expect(body).toEqual({ full: true, wait: false });
    expect(config?.headers?.["Idempotency-Key"]).toMatch(UUID_RE);
  });

  test("each mutation call gets its own distinct Idempotency-Key", async () => {
    const requests = createRequests();
    const api = new DaycareAPI(requests);
    await api.regenerateWeek("2026-09-07");
    await api.regenerateWeek("2026-09-14");
    const [, , firstConfig] = vi.mocked(requests.post).mock.calls[0];
    const [, , secondConfig] = vi.mocked(requests.post).mock.calls[1];
    expect(firstConfig?.headers?.["Idempotency-Key"]).not.toEqual(secondConfig?.headers?.["Idempotency-Key"]);
  });
});
