import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, test, vi } from "vitest";
import RecipePageDaycarePanel from "./RecipePageDaycarePanel.vue";
import { DaycareAPI } from "~/lib/api/user/daycare";
import { vuetifyStubs } from "~/tests/stub-vuetify";
import type { ApiRequestInstance } from "~/lib/api/types/non-generated";
import type { InventoryResponse, PlannerSettings, ProcessingStatus, RecipeDaycare, WeekResponse } from "~/lib/api/types/daycare";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let requests: ApiRequestInstance;

vi.mock("~/composables/api", () => ({
  useUserApi: () => ({ daycare: new DaycareAPI(requests) }),
}));

function apiResult<T>(data: T) {
  return { data, error: null, response: null };
}

function apiError(status: number, code = "some_error", message = "It broke") {
  return { data: null, error: { response: { status, data: { error: { code, message } } } } };
}

/** A network/server failure with no sidecar-supplied message, so DaycareErrorState falls back to its translated copy. */
function apiErrorNoMessage(status: number) {
  return { data: null, error: { response: { status, data: {} } } };
}

const recipeDaycareFixture: RecipeDaycare = {
  slug: "chicken-barley-soup",
  name: "Chicken Barley Soup",
  recipe_id: "r1",
  classified: true,
  classification: {
    schema_version: 2,
    eligible: true,
    uses: [{ slot: "lunch", roles: ["main"] }],
    food_groups: ["protein"],
    production: {
      batchable: true,
      freezable: "yes",
      preferred_batch_storage: "freezer",
      batch_yield_portions: 8,
      active_prep_minutes: 20,
      total_prep_minutes: 60,
    },
    service: { requires_refrigeration: true, serve: "hot", day_of_service_work: "minimal" },
    rotation_group: "soups",
    classification: { confidence: 0.9, notes: [], needs_review: false },
  },
  override_applied: false,
  override: null,
  settings: { enabled: true, daycare_portions_per_batch: 6, max_uses_per_week: null, max_inventory_uses_per_week: null, score_adjustment: null, reason: null },
};

const settingsFixture: PlannerSettings = {
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
    planning_weekday: "monday",
    planning_time: "06:00",
    timezone: "America/Indiana/Indianapolis",
    auto_publish_meal_plan: false,
    auto_publish_shopping_list: false,
  },
  config_version: 1,
  week_start_weekday: "monday",
  weekdays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
};

const inventoryFixture: InventoryResponse = {
  lots: [],
  totals: { "chicken-barley-soup": { physical: 4, reserved: 1, free: 3 } },
  summary: { lot_count: 1, physical: 4, reserved: 1, free: 3 },
};

const weekFixture: WeekResponse = {
  week_start: "2026-01-05",
  generated_at: null,
  schema_version: 1,
  committed: false,
  committed_at: null,
  stale: false,
  stale_reason: null,
  reservation_status: "active",
  reservation: { total_reserved: 0, recipe_daycare_portions: {} },
  downstream_reservations_invalidated: [],
  warnings: [],
  artifacts: {},
  publication: { status: "never", last_published_at: null, plan_id: "p", published_plan_id: null, entry_count: 0, drift: false, drift_reason: null, receipt: null },
  plan: { schema_version: 1, week_start: "2026-01-05", generated_at: "", plan_id: null, days: [], production_plan: [], warnings: [] },
};

const processingFixture: ProcessingStatus = {
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
};

function createRequests(getImpl: (url: string) => Promise<{ data: unknown; error: unknown }>): ApiRequestInstance {
  return {
    get: vi.fn(getImpl),
    post: vi.fn().mockResolvedValue({ data: null, error: null, response: null }),
    put: vi.fn().mockResolvedValue({ data: recipeDaycareFixture, error: null, response: null }),
    patch: vi.fn().mockResolvedValue({ data: null, error: null, response: null }),
    delete: vi.fn().mockResolvedValue({ data: null, error: null, response: null }),
  };
}

function happyPathGet(url: string) {
  if (url.endsWith("/daycare")) return Promise.resolve(apiResult(recipeDaycareFixture));
  if (url.endsWith("/settings")) return Promise.resolve(apiResult(settingsFixture));
  if (url.endsWith("/inventory")) return Promise.resolve(apiResult(inventoryFixture));
  if (url.endsWith("/processing")) return Promise.resolve(apiResult(processingFixture));
  if (url.includes("/weeks/")) return Promise.resolve(apiResult(weekFixture));
  throw new Error(`unexpected GET ${url}`);
}

// A bare passthrough for VForm — deliberately declares no `emits`, so Vue's attribute-fallthrough
// attaches the real component's `@submit.prevent` listener directly to this native <form>, exactly
// as it would on real Vuetify's VForm. A stub that manually re-emits "submit" would mask a missing
// `.prevent` in the source (see RecipeDaycareEditForm.test.ts's dedicated regression test).
const VFormStub = {
  template: "<form><slot /></form>",
};

function mountPanel() {
  return mount(RecipePageDaycarePanel, {
    props: { slug: "chicken-barley-soup", groupSlug: "home" },
    global: {
      mocks: { $globals: { icons: {} } },
      stubs: { ...vuetifyStubs, VCheckbox: vuetifyStubs.VSwitch, VForm: VFormStub },
    },
  });
}

describe("RecipePageDaycarePanel", () => {
  test("read rendering: loads and shows the recipe's daycare record once settled", async () => {
    requests = createRequests(happyPathGet);
    const wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.text()).toContain("Daycare");
    expect(wrapper.text()).toContain("Enabled");
    expect(wrapper.text()).toContain("Eligible for Daycare");
    expect(wrapper.text()).toContain("4"); // physical prepared portions
  });

  test("shows a link to Daycare Settings", async () => {
    requests = createRequests(happyPathGet);
    const wrapper = mountPanel();
    await flushPromises();

    const link = wrapper.findAll("a, button").find(el => el.text() === "Daycare Settings");
    expect(link).toBeTruthy();
  });

  test("edit round-trip attaches a fresh Idempotency-Key header to the PUT", async () => {
    requests = createRequests(happyPathGet);
    const wrapper = mountPanel();
    await flushPromises();

    const editButton = wrapper.findAll("button").find(b => b.text() === "Edit");
    expect(editButton).toBeTruthy();
    await editButton!.trigger("click");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(requests.put).toHaveBeenCalledTimes(1);
    const [url, payload, config] = (requests.put as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toEqual("/api/daycare/v1/recipes/chicken-barley-soup/daycare");
    expect(payload).toEqual({
      settings: { enabled: true, daycare_portions_per_batch: 6 },
      classification: {
        uses: { breakfast: null, lunch: ["main"], snack: null },
        production: { batchable: true, freezable: "yes", preferred_batch_storage: "freezer" },
      },
    });
    expect(config?.headers?.["Idempotency-Key"]).toMatch(UUID_RE);
  });

  test("unavailable state: shows an inline error without hiding the panel when the sidecar is unreachable", async () => {
    requests = createRequests(() => Promise.resolve(apiErrorNoMessage(502)));
    const wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.find(".v-card").exists()).toBe(true);
    expect(wrapper.text()).toContain("temporarily unavailable");
  });

  test("permission gating: renders nothing for a user outside the daycare household", async () => {
    requests = createRequests(() => Promise.resolve(apiError(403, "forbidden")));
    const wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.find(".v-card").exists()).toBe(false);
    expect(wrapper.text()).toEqual("");
  });

  test("shows a not-tracked notice instead of an error when the sidecar hasn't seen this recipe yet", async () => {
    requests = createRequests(url => (url.endsWith("/daycare") ? Promise.resolve(apiError(404, "recipe_not_found")) : happyPathGet(url)));
    const wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.find(".v-card").exists()).toBe(true);
    expect(wrapper.text()).toContain("hasn't been picked up by Daycare yet");
  });
});
