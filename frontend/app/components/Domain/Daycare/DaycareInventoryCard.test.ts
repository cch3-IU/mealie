import { mount } from "@vue/test-utils";
import { describe, expect, test, vi } from "vitest";
import DaycareInventoryCard from "./DaycareInventoryCard.vue";
import { vuetifyStubs } from "~/tests/stub-vuetify";
import type { InventoryResponse, RecipeSummary, WeekResponse } from "~/lib/api/types/daycare";

const BaseDialogStub = {
  props: ["modelValue"],
  template: "<div v-if=\"modelValue\" class=\"dialog\"><slot /></div>",
};

function inventoryFixture(overrides: Partial<InventoryResponse> = {}): InventoryResponse {
  return {
    lots: [
      { id: 1, recipe_slug: "chicken-barley-soup", portions_remaining: 6, made_date: "2026-01-01", use_by: "2026-04-01", storage: "freezer", notes: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
    ],
    totals: {},
    summary: { lot_count: 1, physical: 52, reserved: 39, free: 13 },
    ...overrides,
  };
}

function recipeSummaryFixture(overrides: Partial<RecipeSummary> = {}): RecipeSummary {
  return { slug: "chicken-barley-soup", name: "Chicken Barley Soup", classified: true, eligible: true, enabled: true, daycare_portions_per_batch: 8, ...overrides };
}

function weekFixture(overrides: Partial<WeekResponse> = {}): WeekResponse {
  return {
    week_start: "2026-01-05",
    generated_at: "2026-01-01T00:00:00Z",
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
    publication: { status: "never", last_published_at: null, plan_id: "p1", published_plan_id: null, entry_count: 0, drift: false, drift_reason: null, receipt: null },
    plan: { schema_version: 1, week_start: "2026-01-05", generated_at: "2026-01-01T00:00:00Z", plan_id: "p1", days: [], production_plan: [], warnings: [] },
    ...overrides,
  };
}

function mountCard(props: Partial<InstanceType<typeof DaycareInventoryCard>["$props"]> = {}) {
  return mount(DaycareInventoryCard, {
    props: {
      inventory: null,
      loading: false,
      error: null,
      groupSlug: "family",
      week: null,
      recipes: [],
      mutating: false,
      offline: false,
      updateLot: vi.fn(() => Promise.resolve({ data: null, error: null })),
      ...props,
    },
    global: {
      stubs: { ...vuetifyStubs, BaseDialog: BaseDialogStub },
      mocks: { $globals: { icons: { edit: "edit" } } },
    },
  });
}

describe("DaycareInventoryCard", () => {
  test("shows a loading skeleton", () => {
    const wrapper = mountCard({ loading: true });
    expect(wrapper.find(".v-skeleton-loader").exists()).toBe(true);
  });

  test("shows an error state", () => {
    const wrapper = mountCard({ error: { status: 500, code: null, message: "boom", kind: "server", details: null } });
    expect(wrapper.text()).toContain("boom");
  });

  test("shows physical, reserved and free totals", () => {
    const wrapper = mountCard({ inventory: inventoryFixture() });
    expect(wrapper.text()).toContain("52");
    expect(wrapper.text()).toContain("physical");
    expect(wrapper.text()).toContain("39");
    expect(wrapper.text()).toContain("reserved");
    expect(wrapper.text()).toContain("13");
    expect(wrapper.text()).toContain("free");
  });

  test("shows a no-inventory message when there are no lots", () => {
    const wrapper = mountCard({ inventory: inventoryFixture({ lots: [], summary: { lot_count: 0, physical: 0, reserved: 0, free: 0 } }) });
    expect(wrapper.text()).toContain("No prepared food on hand.");
  });

  test("View Inventory expands the lot list and shows the recipe name resolved from the GET /recipes summaries, linked to the recipe page", async () => {
    const wrapper = mountCard({ inventory: inventoryFixture(), recipes: [recipeSummaryFixture()] });
    expect(wrapper.text()).not.toContain("Chicken Barley Soup");

    await wrapper.findAll("button")[0].trigger("click");

    expect(wrapper.text()).toContain("Chicken Barley Soup");
    expect(wrapper.text()).not.toContain("chicken-barley-soup");
    expect(wrapper.text()).toContain("freezer");
    const recipeLink = wrapper.findAll("button").find(b => b.text() === "Chicken Barley Soup")!;
    expect(recipeLink.attributes("to")).toEqual("/g/family/r/chicken-barley-soup");
  });

  test("resolves the recipe name from the week plan's recipe choices when it's not in the GET /recipes summaries", async () => {
    const week = weekFixture({
      plan: {
        schema_version: 1,
        week_start: "2026-01-05",
        generated_at: "2026-01-01T00:00:00Z",
        plan_id: "p1",
        warnings: [],
        production_plan: [],
        days: [{
          date: "2026-01-05",
          day: "monday",
          breakfast: { recipe: { slug: "chicken-barley-soup", name: "Chicken Barley Soup", role: "main", roles: ["main"], rotation_group: null, inventory_available_at_plan_time: null, production_activated: null }, produce_side: null, companion: null },
          lunch: { recipe: { slug: "x", name: "X", role: "main", roles: ["main"], rotation_group: null, inventory_available_at_plan_time: null, production_activated: null }, produce_side: null, companion: null },
          snack_am: { recipe: { slug: "x", name: "X", role: "main", roles: ["main"], rotation_group: null, inventory_available_at_plan_time: null, production_activated: null }, produce_side: null, companion: null },
          snack_pm: { recipe: { slug: "x", name: "X", role: "main", roles: ["main"], rotation_group: null, inventory_available_at_plan_time: null, production_activated: null }, produce_side: null, companion: null },
        }],
      },
    });
    const wrapper = mountCard({ inventory: inventoryFixture(), recipes: [], week });

    await wrapper.findAll("button")[0].trigger("click");

    expect(wrapper.text()).toContain("Chicken Barley Soup");
  });

  test("falls back to a humanised slug when no name is known from either source", async () => {
    const wrapper = mountCard({
      inventory: inventoryFixture({ lots: [{ id: 2, recipe_slug: "bbq-pulled-chicken", portions_remaining: 3, made_date: null, use_by: null, storage: "freezer", notes: null, created_at: "x", updated_at: "x" }] }),
      recipes: [],
      week: null,
    });

    await wrapper.findAll("button")[0].trigger("click");

    expect(wrapper.text()).toContain("Bbq Pulled Chicken");
    expect(wrapper.text()).not.toContain("bbq-pulled-chicken");
  });

  test("clicking a lot's edit affordance opens the edit dialog for that lot", async () => {
    const wrapper = mountCard({ inventory: inventoryFixture() });
    await wrapper.findAll("button")[0].trigger("click"); // View Inventory

    expect(wrapper.find(".dialog").exists()).toBe(false);

    const editButton = wrapper.find("[aria-label=\"Edit portions and use-by date\"]");
    await editButton.trigger("click");

    expect(wrapper.find(".dialog").exists()).toBe(true);
  });

  test("the edit affordance is disabled while offline or mutating", async () => {
    const wrapper = mountCard({ inventory: inventoryFixture(), offline: true });
    await wrapper.findAll("button")[0].trigger("click");

    const editButton = wrapper.find("[aria-label=\"Edit portions and use-by date\"]");
    expect(editButton.attributes("disabled")).toBeDefined();
  });
});
