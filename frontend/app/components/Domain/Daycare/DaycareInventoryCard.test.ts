import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import DaycareInventoryCard from "./DaycareInventoryCard.vue";
import { vuetifyStubs } from "~/tests/stub-vuetify";
import type { InventoryResponse } from "~/lib/api/types/daycare";

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

function mountCard(props: Partial<InstanceType<typeof DaycareInventoryCard>["$props"]> = {}) {
  return mount(DaycareInventoryCard, {
    props: { inventory: null, loading: false, error: null, ...props },
    global: { stubs: vuetifyStubs },
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

  test("View Inventory expands the lot list", async () => {
    const wrapper = mountCard({ inventory: inventoryFixture() });
    expect(wrapper.text()).not.toContain("chicken-barley-soup");

    await wrapper.find("button").trigger("click");

    expect(wrapper.text()).toContain("chicken-barley-soup");
    expect(wrapper.text()).toContain("freezer");
  });
});
