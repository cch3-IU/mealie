import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import DaycareShoppingCard from "./DaycareShoppingCard.vue";
import { vuetifyStubs } from "~/tests/stub-vuetify";
import type { ProductionRow, ShoppingPlan, WeekResponse } from "~/lib/api/types/daycare";

function productionRow(overrides: Partial<ProductionRow> = {}): ProductionRow {
  return {
    recipe_slug: "sweet-potato-apple-biscuits",
    recipe_name: "Sweet Potato & Apple Biscuits",
    demand_daycare_portions: 10,
    inventory_available: 0,
    shortage_daycare_portions: 10,
    batchable: true,
    daycare_portions_per_batch: null,
    batches_to_make: null,
    yield_needs_configuration: true,
    ...overrides,
  };
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
    plan: { schema_version: 1, week_start: "2026-01-05", generated_at: "2026-01-01T00:00:00Z", plan_id: "p1", days: [], production_plan: [productionRow()], warnings: [] },
    ...overrides,
  };
}

function shoppingFixture(overrides: Partial<ShoppingPlan> = {}): ShoppingPlan {
  return {
    schema_version: 1,
    week_start: "2026-01-05",
    basis: "gross-demand",
    recipe_ingredients: [],
    simple_foods: [],
    review_items: [],
    summary: {},
    publication: {
      status: "never",
      last_published_at: null,
      plan_id: "p1",
      published_plan_id: null,
      list_id: null,
      item_count: 0,
      drift: false,
      drift_reason: null,
      receipt: null,
    },
    ...overrides,
  };
}

function mountCard(props: Partial<InstanceType<typeof DaycareShoppingCard>["$props"]> = {}) {
  return mount(DaycareShoppingCard, {
    props: {
      shopping: null,
      week: null,
      weekEmpty: false,
      loading: false,
      error: null,
      mutating: false,
      offline: false,
      groupSlug: "family",
      ...props,
    },
    global: { stubs: vuetifyStubs },
  });
}

describe("DaycareShoppingCard", () => {
  test("shows a loading skeleton", () => {
    const wrapper = mountCard({ loading: true });
    expect(wrapper.find(".v-skeleton-loader").exists()).toBe(true);
  });

  test("shows an error state", () => {
    const wrapper = mountCard({ error: { status: 502, code: null, message: null, kind: "unreachable", details: null } });
    expect(wrapper.text()).toContain("temporarily unavailable");
  });

  test("shows the no-plan message for an empty week", () => {
    const wrapper = mountCard({ weekEmpty: true });
    expect(wrapper.text()).toContain("No plan yet for this week.");
  });

  test("shows remaining review items and published item count", () => {
    const wrapper = mountCard({
      shopping: shoppingFixture({
        review_items: [{ text: "mystery ingredient" }],
        publication: { status: "published", last_published_at: "2026-01-01T00:00:00Z", plan_id: "p1", published_plan_id: "p1", list_id: "list-1", item_count: 12, drift: false, drift_reason: null, receipt: "r" },
      }),
    });
    expect(wrapper.text()).toContain("12 items on the list");
    expect(wrapper.text()).toContain("1 item needs review");
  });

  test("links to the owned Mealie shopping list once one exists", () => {
    const wrapper = mountCard({
      shopping: shoppingFixture({
        publication: { status: "published", last_published_at: null, plan_id: "p1", published_plan_id: "p1", list_id: "list-42", item_count: 3, drift: false, drift_reason: null, receipt: null },
      }),
    });
    expect(wrapper.html()).toContain("/shopping-lists/list-42");
  });

  test("does not show a shopping-list link before one is published", () => {
    const wrapper = mountCard({ shopping: shoppingFixture() });
    expect(wrapper.html()).not.toContain("/shopping-lists/");
  });

  test("plainly states the shopping list hasn't been published yet", () => {
    const wrapper = mountCard({ shopping: shoppingFixture() });
    expect(wrapper.text()).toContain("Not published yet.");
  });

  test("publish is the primary (filled) action and preview the secondary text action", () => {
    const wrapper = mountCard({ shopping: shoppingFixture() });
    const buttons = wrapper.findAll("button");
    const preview = buttons.find(b => b.text().includes("Preview"))!;
    const publish = buttons.find(b => b.text() === "Publish")!;
    // VBtn's stub only wires up `disabled`/`loading` as declared props; `variant="text"` falls through
    // as a plain attribute — a filled (primary) v-btn never sets it at all.
    expect(preview.attributes("variant")).toEqual("text");
    expect(publish.attributes("variant")).toBeUndefined();
  });

  test("emits preview and publish separately", async () => {
    const wrapper = mountCard({ shopping: shoppingFixture() });
    const buttons = wrapper.findAll("button");
    const preview = buttons.find(b => b.text().includes("Preview"))!;
    const publish = buttons.find(b => b.text() === "Publish")!;

    await preview.trigger("click");
    expect(wrapper.emitted("preview")).toHaveLength(1);
    expect(wrapper.emitted("publish")).toBeUndefined();

    await publish.trigger("click");
    expect(wrapper.emitted("publish")).toHaveLength(1);
  });

  test("disables publish actions while offline or for an unplanned week", () => {
    const wrapper = mountCard({ shopping: shoppingFixture(), offline: true });
    wrapper.findAll("button").forEach((button) => {
      expect(button.attributes("disabled")).toBeDefined();
    });
  });

  test("shows the blocked state with a linked blocker and a hint instead of a raw error, and disables actions", () => {
    const wrapper = mountCard({
      week: weekFixture(),
      error: {
        status: 409,
        code: "shopping_blocked",
        message: "Shopping plan cannot be complete until batch sizing is calibrated.",
        kind: "conflict",
        details: { blockers: ["Sweet Potato & Apple Biscuits: batch size is not calibrated"] },
      },
    });

    expect(wrapper.text()).toContain("Shopping needs one more thing");
    expect(wrapper.text()).toContain("Sweet Potato & Apple Biscuits");
    expect(wrapper.text()).toContain("batch size is not calibrated");
    expect(wrapper.html()).toContain("/g/family/r/sweet-potato-apple-biscuits");
    expect(wrapper.text()).toContain("daycare portions per batch");
    expect(wrapper.find("[data-type='error']").exists()).toBe(false);

    const buttons = wrapper.findAll("button");
    const preview = buttons.find(b => b.text().includes("Preview"))!;
    const publish = buttons.find(b => b.text() === "Publish")!;
    expect(preview.attributes("disabled")).toBeDefined();
    expect(publish.attributes("disabled")).toBeDefined();
  });

  test("falls back to plain text for a blocker that can't be resolved to a recipe in this week's plan", () => {
    const wrapper = mountCard({
      week: weekFixture({ plan: { ...weekFixture().plan, production_plan: [] } }),
      error: {
        status: 409,
        code: "shopping_blocked",
        message: "Shopping plan cannot be complete until batch sizing is calibrated.",
        kind: "conflict",
        details: { blockers: ["Sweet Potato & Apple Biscuits: batch size is not calibrated"] },
      },
    });

    expect(wrapper.text()).toContain("Sweet Potato & Apple Biscuits");
    expect(wrapper.html()).not.toContain("/g/family/r/");
  });

  test("shows a locked notice with the commit date for a committed week, and hides publish actions", () => {
    const wrapper = mountCard({
      shopping: shoppingFixture(),
      week: weekFixture({ committed: true, committed_at: "2026-01-06T12:00:00Z" }),
    });

    expect(wrapper.text()).toContain("This week is completed and locked.");
    expect(wrapper.text()).toContain(new Date("2026-01-06T12:00:00Z").toLocaleString());
    expect(wrapper.findAll("button")).toHaveLength(0);
  });

  test("treats a week_committed publish error the same as a locked week when the week prop hasn't caught up yet", () => {
    const wrapper = mountCard({
      shopping: shoppingFixture(),
      error: {
        status: 409,
        code: "week_committed",
        message: "Week is already committed.",
        kind: "conflict",
        details: { committed_at: "2026-01-06T12:00:00Z" },
      },
    });

    expect(wrapper.text()).toContain("This week is completed and locked.");
    expect(wrapper.findAll("button")).toHaveLength(0);
  });
});
