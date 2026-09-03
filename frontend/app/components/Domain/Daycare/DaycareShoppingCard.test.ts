import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import DaycareShoppingCard from "./DaycareShoppingCard.vue";
import { vuetifyStubs } from "~/tests/stub-vuetify";
import type { ShoppingPlan } from "~/lib/api/types/daycare";

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
      weekEmpty: false,
      loading: false,
      error: null,
      mutating: false,
      offline: false,
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
    const wrapper = mountCard({ error: { status: 502, code: null, message: null, kind: "unreachable" } });
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
});
