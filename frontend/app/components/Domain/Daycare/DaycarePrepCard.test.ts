import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import DaycarePrepCard from "./DaycarePrepCard.vue";
import { vuetifyStubs } from "~/tests/stub-vuetify";
import type { ProductionRow } from "~/lib/api/types/daycare";

function row(overrides: Partial<ProductionRow> = {}): ProductionRow {
  return {
    recipe_slug: "chicken-barley-soup",
    recipe_name: "Chicken Barley Soup",
    demand_daycare_portions: 10,
    inventory_available: 2,
    shortage_daycare_portions: 8,
    batchable: true,
    daycare_portions_per_batch: 8,
    batches_to_make: 2,
    yield_needs_configuration: false,
    ...overrides,
  };
}

function mountCard(props: Partial<InstanceType<typeof DaycarePrepCard>["$props"]> = {}) {
  return mount(DaycarePrepCard, {
    props: {
      productionRows: [],
      blockers: [],
      loading: false,
      error: null,
      weekEmpty: false,
      groupSlug: "family",
      ...props,
    },
    global: { stubs: vuetifyStubs },
  });
}

describe("DaycarePrepCard", () => {
  test("shows a loading skeleton", () => {
    const wrapper = mountCard({ loading: true });
    expect(wrapper.find(".v-skeleton-loader").exists()).toBe(true);
  });

  test("shows an error state", () => {
    const wrapper = mountCard({ error: { status: 500, code: null, message: "boom", kind: "server" } });
    expect(wrapper.text()).toContain("boom");
  });

  test("shows the no-plan message for an empty week, not the empty-prep message", () => {
    const wrapper = mountCard({ weekEmpty: true });
    expect(wrapper.text()).toContain("No plan yet for this week.");
  });

  test("shows nothing-to-prep when there is a plan but nothing needs production", () => {
    const wrapper = mountCard({ productionRows: [] });
    expect(wrapper.text()).toContain("Nothing to prep for this week.");
  });

  test("lists recipes needing production with a batch count and an Open Recipe link", () => {
    const wrapper = mountCard({ productionRows: [row({ batches_to_make: 2 })] });
    expect(wrapper.text()).toContain("Chicken Barley Soup");
    expect(wrapper.text()).toContain("2 batches");
    expect(wrapper.html()).toContain("/g/family/r/chicken-barley-soup");
  });

  test("surfaces blockers as an actionable warning", () => {
    const wrapper = mountCard({ blockers: ["Batch yield not configured for Chicken Barley Soup"] });
    expect(wrapper.text()).toContain("Before this can be prepped");
    expect(wrapper.text()).toContain("Batch yield not configured for Chicken Barley Soup");
  });
});
