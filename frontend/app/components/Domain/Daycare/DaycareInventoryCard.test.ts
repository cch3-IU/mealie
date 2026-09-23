import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, test, vi } from "vitest";
import DaycareInventoryCard from "./DaycareInventoryCard.vue";
import { toastAlert } from "~/composables/use-toast";
import { vuetifyStubs } from "~/tests/stub-vuetify";
import type { InventoryResponse, Lot, RecipeSummary, WeekResponse } from "~/lib/api/types/daycare";

const BaseDialogStub = {
  props: { modelValue: Boolean, canConfirm: Boolean, canSubmit: Boolean, canDelete: Boolean, submitDisabled: Boolean },
  emits: ["confirm", "cancel", "submit", "delete", "update:modelValue"],
  template: "<div v-if=\"modelValue\" class=\"dialog\">"
    + "<slot />"
    + "<button v-if=\"canConfirm\" class=\"confirm\" @click=\"$emit('confirm')\">confirm</button>"
    + "<button v-if=\"canSubmit\" class=\"submit\" :disabled=\"submitDisabled\" @click=\"$emit('submit')\">submit</button>"
    + "<button v-if=\"canDelete\" class=\"delete\" @click=\"$emit('delete')\">delete</button>"
    + "</div>",
};

function lotFixture(overrides: Partial<Lot> = {}): Lot {
  return {
    id: 1,
    recipe_slug: "chicken-barley-soup",
    portions_remaining: 6,
    made_date: "2026-01-01",
    use_by: "2026-04-01",
    storage: "freezer",
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function inventoryFixture(overrides: Partial<InventoryResponse> = {}): InventoryResponse {
  return {
    lots: [lotFixture()],
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
      consumeLot: vi.fn(() => Promise.resolve({ data: null, error: null })),
      deleteLot: vi.fn(() => Promise.resolve({ data: null, error: null })),
      ...props,
    },
    global: {
      stubs: { ...vuetifyStubs, BaseDialog: BaseDialogStub },
      mocks: { $globals: { icons: { edit: "edit", minus: "minus", createAlt: "plus" } } },
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

  test("the lot list is shown open by default, resolved from the GET /recipes summaries, linked to the recipe page", () => {
    const wrapper = mountCard({ inventory: inventoryFixture(), recipes: [recipeSummaryFixture()] });

    expect(wrapper.text()).toContain("Chicken Barley Soup");
    expect(wrapper.text()).not.toContain("chicken-barley-soup");
    expect(wrapper.text()).toContain("Freezer");
    const recipeLink = wrapper.findAll("button").find(b => b.text() === "Chicken Barley Soup")!;
    expect(recipeLink.attributes("to")).toEqual("/g/family/r/chicken-barley-soup");
  });

  test("resolves the recipe name from the week plan's recipe choices when it's not in the GET /recipes summaries", () => {
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

    expect(wrapper.text()).toContain("Chicken Barley Soup");
  });

  test("falls back to a humanised slug when no name is known from either source", () => {
    const wrapper = mountCard({
      inventory: inventoryFixture({ lots: [{ id: 2, recipe_slug: "bbq-pulled-chicken", portions_remaining: 3, made_date: null, use_by: null, storage: "freezer", notes: null, created_at: "x", updated_at: "x" }] }),
      recipes: [],
      week: null,
    });

    expect(wrapper.text()).toContain("Bbq Pulled Chicken");
    expect(wrapper.text()).not.toContain("bbq-pulled-chicken");
  });

  test("lots are sorted by recipe name", () => {
    const wrapper = mountCard({
      inventory: inventoryFixture({
        lots: [
          lotFixture({ id: 1, recipe_slug: "zucchini-bread", use_by: null, made_date: null }),
          lotFixture({ id: 2, recipe_slug: "apple-oat-bars", use_by: null, made_date: null }),
        ],
      }),
      recipes: [],
    });

    const rows = wrapper.findAll("tbody tr");
    expect(rows[0].text()).toContain("Apple Oat Bars");
    expect(rows[1].text()).toContain("Zucchini Bread");
  });

  test("clicking a lot's edit affordance opens the edit dialog for that lot", async () => {
    const wrapper = mountCard({ inventory: inventoryFixture() });

    expect(wrapper.find(".dialog").exists()).toBe(false);

    const editButton = wrapper.find("[aria-label=\"Edit portions and use-by date\"]");
    await editButton.trigger("click");

    expect(wrapper.find(".dialog").exists()).toBe(true);
  });

  test("the edit affordance is disabled while offline or mutating", () => {
    const wrapper = mountCard({ inventory: inventoryFixture(), offline: true });

    const editButton = wrapper.find("[aria-label=\"Edit portions and use-by date\"]");
    expect(editButton.attributes("disabled")).toBeDefined();
  });

  test("-1 eaten consumes one portion with release_reservations, refreshing immediately via the passed-in action", async () => {
    const consumeLot = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const wrapper = mountCard({ inventory: inventoryFixture({ lots: [lotFixture({ id: 1, portions_remaining: 6 })] }), consumeLot });

    await wrapper.find("[aria-label^=\"Eat one serving\"]").trigger("click");
    await flushPromises();

    expect(consumeLot).toHaveBeenCalledWith(1, { portions: 1, release_reservations: true });
  });

  test("-1 on the last serving asks for confirmation before consuming", async () => {
    const consumeLot = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const wrapper = mountCard({ inventory: inventoryFixture({ lots: [lotFixture({ id: 1, portions_remaining: 1 })] }), consumeLot });

    await wrapper.find("[aria-label^=\"Eat one serving\"]").trigger("click");

    expect(consumeLot).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("Last serving of Chicken Barley Soup — remove from inventory?");

    await wrapper.find(".confirm").trigger("click");
    await flushPromises();

    expect(consumeLot).toHaveBeenCalledWith(1, { portions: 1, release_reservations: true });
  });

  test("cancelling the last-serving confirmation never consumes", async () => {
    const consumeLot = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const wrapper = mountCard({ inventory: inventoryFixture({ lots: [lotFixture({ id: 1, portions_remaining: 1 })] }), consumeLot });

    await wrapper.find("[aria-label^=\"Eat one serving\"]").trigger("click");
    await wrapper.findComponent(BaseDialogStub).vm.$emit("cancel");
    await flushPromises();

    expect(consumeLot).not.toHaveBeenCalled();
  });

  test("-1 is disabled when a lot somehow has 0 portions remaining", () => {
    const wrapper = mountCard({ inventory: inventoryFixture({ lots: [lotFixture({ id: 1, portions_remaining: 0 })] }) });

    const consumeButton = wrapper.find("[aria-label^=\"Eat one serving\"]");
    expect(consumeButton.attributes("disabled")).toBeDefined();
  });

  test("a failed -1 shows an error toast", async () => {
    toastAlert.open = false;
    const consumeLot = vi.fn(() => Promise.resolve({
      data: null,
      error: { status: 409, code: "lot_reserved", message: "Can't take off more than is free.", kind: "conflict" as const, details: null },
    }));
    const wrapper = mountCard({ inventory: inventoryFixture({ lots: [lotFixture({ id: 1, portions_remaining: 6 })] }), consumeLot });

    await wrapper.find("[aria-label^=\"Eat one serving\"]").trigger("click");
    await flushPromises();

    expect(toastAlert.open).toBe(true);
    expect(toastAlert.text).toEqual("Can't take off more than is free.");
  });

  test("+1 patches portions_remaining and nothing else, refreshing immediately via the passed-in action", async () => {
    const updateLot = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const wrapper = mountCard({ inventory: inventoryFixture({ lots: [lotFixture({ id: 1, portions_remaining: 6, use_by: "2026-04-01" })] }), updateLot });

    await wrapper.find("[aria-label^=\"Add one serving\"]").trigger("click");
    await flushPromises();

    expect(updateLot).toHaveBeenCalledWith(1, { portions_remaining: 7 });
  });

  test("a failed +1 shows an error toast", async () => {
    toastAlert.open = false;
    const updateLot = vi.fn(() => Promise.resolve({
      data: null,
      error: { status: 500, code: null, message: "boom", kind: "server" as const, details: null },
    }));
    const wrapper = mountCard({ inventory: inventoryFixture(), updateLot });

    await wrapper.find("[aria-label^=\"Add one serving\"]").trigger("click");
    await flushPromises();

    expect(toastAlert.open).toBe(true);
    expect(toastAlert.text).toEqual("boom");
  });

  test("deleting a lot from the edit dialog calls deleteLot and shows a success toast", async () => {
    toastAlert.open = false;
    const deleteLot = vi.fn(() => Promise.resolve({ data: lotFixture(), error: null }));
    const wrapper = mountCard({ inventory: inventoryFixture(), deleteLot });

    await wrapper.find("[aria-label=\"Edit portions and use-by date\"]").trigger("click");
    await wrapper.find(".delete").trigger("click");
    await flushPromises();

    expect(deleteLot).toHaveBeenCalledWith(1);
    expect(toastAlert.open).toBe(true);
    expect(toastAlert.text).toEqual("Removed from inventory.");
  });
});
