import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, test, vi } from "vitest";
import DaycarePlanCard from "./DaycarePlanCard.vue";
import { vuetifyStubs } from "~/tests/stub-vuetify";
import type { WeekResponse } from "~/lib/api/types/daycare";

const BaseDialogStub = {
  props: ["modelValue", "title", "canSubmit", "submitDisabled"],
  emits: ["confirm", "submit", "update:modelValue"],
  template: "<div v-if=\"modelValue\" class=\"dialog\"><div class=\"title\">{{ title }}</div><slot /><button class=\"confirm\" @click=\"$emit('confirm')\">confirm</button><button v-if=\"canSubmit\" class=\"submit\" :disabled=\"submitDisabled\" @click=\"!submitDisabled && $emit('submit')\">submit</button></div>",
};

function weekFixture(overrides: Partial<WeekResponse> = {}): WeekResponse {
  const emptySlot = { recipe: { slug: "x", name: "x", role: "main", roles: ["main"], rotation_group: null, inventory_available_at_plan_time: null, production_activated: false }, produce_side: null, companion: null };
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
    plan: {
      schema_version: 1,
      week_start: "2026-01-05",
      generated_at: "2026-01-01T00:00:00Z",
      plan_id: "p1",
      days: [
        {
          date: "2026-01-05",
          day: "monday",
          breakfast: { ...emptySlot, recipe: { ...emptySlot.recipe, name: "Oat Muffins" } },
          lunch: { ...emptySlot, recipe: { ...emptySlot.recipe, name: "Veggie Bowl", production_activated: true } },
          snack_am: { ...emptySlot, recipe: { ...emptySlot.recipe, name: "Apple Slices" } },
          snack_pm: { ...emptySlot, recipe: { ...emptySlot.recipe, name: "Yogurt Cup" } },
        },
      ],
      production_plan: [],
      warnings: [],
    },
    ...overrides,
  };
}

function mountCard(props: Partial<InstanceType<typeof DaycarePlanCard>["$props"]> = {}) {
  return mount(DaycarePlanCard, {
    props: {
      week: null,
      weekEmpty: false,
      loading: false,
      error: null,
      mutating: false,
      offline: false,
      isAdmin: false,
      getUnlockPreview: vi.fn(() => Promise.resolve({ data: null, error: null })),
      unlockWeek: vi.fn(() => Promise.resolve({ data: null, error: null })),
      ...props,
    },
    global: {
      mocks: { $globals: { icons: { refresh: "refresh" } } },
      stubs: { ...vuetifyStubs, BaseDialog: BaseDialogStub },
    },
  });
}

describe("DaycarePlanCard", () => {
  test("shows a loading skeleton while the week hasn't loaded", () => {
    const wrapper = mountCard({ loading: true });
    expect(wrapper.find(".v-skeleton-loader").exists()).toBe(true);
  });

  test("shows an error state when the fetch failed", () => {
    const wrapper = mountCard({ error: { status: 503, code: "mealie_unavailable", message: "Mealie is unavailable.", kind: "unreachable", details: null } });
    expect(wrapper.text()).toContain("Mealie is unavailable.");
  });

  test("shows a no-plan-yet message, not an error, for an empty week", () => {
    const wrapper = mountCard({ weekEmpty: true });
    expect(wrapper.text()).toContain("No plan yet for this week.");
  });

  test("summarizes planned meals and freezer/production split", () => {
    const wrapper = mountCard({ week: weekFixture() });
    expect(wrapper.text()).toContain("4");
    expect(wrapper.text()).toContain("from freezer");
    expect(wrapper.text()).toContain("new production");
  });

  test("expands the day-by-day list with AM/PM snacks clearly labeled", async () => {
    const wrapper = mountCard({ week: weekFixture() });
    expect(wrapper.text()).not.toContain("Oat Muffins");

    await wrapper.find("button").trigger("click");

    expect(wrapper.text()).toContain("Breakfast: Oat Muffins");
    expect(wrapper.text()).toContain("Lunch: Veggie Bowl");
    expect(wrapper.text()).toContain("AM Snack: Apple Slices");
    expect(wrapper.text()).toContain("PM Snack: Yogurt Cup");
  });

  test("shows a locked notice with the commit date for a committed week", () => {
    const wrapper = mountCard({ week: weekFixture({ committed: true, committed_at: "2026-01-06T12:00:00Z" }) });
    expect(wrapper.text()).toContain("This week is completed and locked.");
    expect(wrapper.text()).toContain(new Date("2026-01-06T12:00:00Z").toLocaleString());
  });

  test("shows a warning banner for a stale plan with its reason", () => {
    const wrapper = mountCard({ week: weekFixture({ stale: true, stale_reason: "a recipe changed" }) });
    expect(wrapper.text()).toContain("a recipe changed");
  });

  test("regenerate requires confirmation before emitting", async () => {
    const wrapper = mountCard({ week: weekFixture() });
    const buttons = wrapper.findAll("button");
    const regenerateButton = buttons.find(b => b.text().includes("Regenerate"))!;

    await regenerateButton.trigger("click");
    expect(wrapper.emitted("regenerate")).toBeUndefined();

    await wrapper.find(".confirm").trigger("click");
    expect(wrapper.emitted("regenerate")).toHaveLength(1);
  });

  test("warns before confirming regenerate on a committed week", async () => {
    const wrapper = mountCard({ week: weekFixture({ committed: true }) });
    const buttons = wrapper.findAll("button");
    const regenerateButton = buttons.find(b => b.text().includes("Regenerate"))!;
    await regenerateButton.trigger("click");

    expect(wrapper.text()).toContain("already been marked complete");
  });

  test("disables regenerate while offline or mutating", () => {
    const wrapper = mountCard({ week: weekFixture(), offline: true });
    const buttons = wrapper.findAll("button");
    const regenerateButton = buttons.find(b => b.text().includes("Regenerate"))!;
    expect(regenerateButton.attributes("disabled")).toBeDefined();
  });

  test("an admin sees Unlock Week on a locked week whose unlock action is available", () => {
    const wrapper = mountCard({
      week: weekFixture({ committed: true, unlock: { available: true, safe: true, reasons: [] } }),
      isAdmin: true,
    });
    expect(wrapper.findAll("button").some(b => b.text() === "Unlock Week")).toBe(true);
  });

  test("a non-admin never sees Unlock Week even when the action is available", () => {
    const wrapper = mountCard({
      week: weekFixture({ committed: true, unlock: { available: true, safe: true, reasons: [] } }),
      isAdmin: false,
    });
    expect(wrapper.findAll("button").some(b => b.text() === "Unlock Week")).toBe(false);
  });

  test("hides Unlock Week when the week response carries no unlock field (older sidecar without the endpoint)", () => {
    const wrapper = mountCard({
      week: weekFixture({ committed: true }),
      isAdmin: true,
    });
    expect(wrapper.findAll("button").some(b => b.text() === "Unlock Week")).toBe(false);
  });

  test("hides Unlock Week when the sidecar reports the action unavailable", () => {
    const wrapper = mountCard({
      week: weekFixture({ committed: true, unlock: { available: false, safe: false, reasons: [] } }),
      isAdmin: true,
    });
    expect(wrapper.findAll("button").some(b => b.text() === "Unlock Week")).toBe(false);
  });

  test("clicking Unlock Week opens the unlock dialog, which loads its preview", async () => {
    const getUnlockPreview = vi.fn(() => Promise.resolve({
      data: { week_start: "2026-01-05", created_lots: [], consumed_source_lots: [], missing_source_lot: false, affected_reservations: [], affected_weeks: [], safe: true, reasons: [] },
      error: null,
    }));
    const wrapper = mountCard({
      week: weekFixture({ committed: true, unlock: { available: true, safe: true, reasons: [] } }),
      isAdmin: true,
      getUnlockPreview,
    });

    const unlockButton = wrapper.findAll("button").find(b => b.text() === "Unlock Week")!;
    await unlockButton.trigger("click");
    await flushPromises();

    expect(getUnlockPreview).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("Unlock this week's completed prep?");
  });
});
