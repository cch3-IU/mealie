import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import DaycarePrepReceipt from "./DaycarePrepReceipt.vue";
import { vuetifyStubs } from "~/tests/stub-vuetify";
import type { CommitReceiptSummary, CompletionPreviewRecipe } from "~/lib/api/types/daycare";

function summary(overrides: Partial<CommitReceiptSummary> = {}): CommitReceiptSummary {
  return {
    existing_inventory_allocated: 4,
    leftover_portions_added: 6,
    leftover_lots_added: 2,
    ...overrides,
  };
}

function recipeRow(overrides: Partial<CompletionPreviewRecipe> = {}): CompletionPreviewRecipe {
  return {
    recipe_slug: "chicken-barley-soup",
    recipe_name: "Chicken Barley Soup",
    week_demand_daycare_portions: 10,
    existing_inventory_allocated: 2,
    new_production_daycare_portions: 16,
    new_production_allocated_to_week: 8,
    leftover_portions_to_inventory: 8,
    leftover_storage: "freezer",
    ...overrides,
  };
}

function mountReceipt(props: Partial<InstanceType<typeof DaycarePrepReceipt>["$props"]> = {}) {
  return mount(DaycarePrepReceipt, {
    props: {
      committedAt: "2026-01-06T12:00:00Z",
      summary: summary(),
      ...props,
    },
    global: { stubs: vuetifyStubs },
  });
}

describe("DaycarePrepReceipt", () => {
  test("states plainly what was used from the freezer and what was saved back to it", () => {
    const wrapper = mountReceipt();
    expect(wrapper.text()).toContain("4 portions used from what was already in the freezer");
    expect(wrapper.text()).toContain("6 new portions saved to the freezer for later");
    expect(wrapper.text()).toContain("2 containers");
  });

  test("uses singular wording for exactly one portion or container", () => {
    const wrapper = mountReceipt({ summary: summary({ existing_inventory_allocated: 1, leftover_portions_added: 1, leftover_lots_added: 1 }) });
    expect(wrapper.text()).toContain("1 portion used from what was already in the freezer");
    expect(wrapper.text()).toContain("1 new portion saved to the freezer for later");
    expect(wrapper.text()).toContain("1 container");
  });

  test("shows a completed-on date when given", () => {
    const wrapper = mountReceipt();
    expect(wrapper.text()).toContain("Completed on");
  });

  test("omits the completed-on line when the date is unknown", () => {
    const wrapper = mountReceipt({ committedAt: null });
    expect(wrapper.text()).not.toContain("Completed on");
  });

  test("hides the per-recipe breakdown until expanded", async () => {
    const wrapper = mountReceipt({ recipes: [recipeRow()] });
    expect(wrapper.text()).not.toContain("Chicken Barley Soup");

    await wrapper.find("button").trigger("click");

    expect(wrapper.text()).toContain("Chicken Barley Soup");
  });

  test("omits the breakdown toggle entirely when no recipe detail is available", () => {
    const wrapper = mountReceipt({ recipes: null });
    expect(wrapper.find("button").exists()).toBe(false);
  });
});
