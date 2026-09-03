import { mount } from "@vue/test-utils";
import { describe, expect, test, vi } from "vitest";
import DaycarePrepCard from "./DaycarePrepCard.vue";
import { vuetifyStubs } from "~/tests/stub-vuetify";
import type { ProductionRow, WeekResponse } from "~/lib/api/types/daycare";

const BaseDialogStub = {
  props: ["modelValue", "title", "canSubmit", "loading"],
  emits: ["submit", "confirm", "update:modelValue"],
  template: "<div v-if=\"modelValue\" class=\"dialog\"><slot /><button v-if=\"canSubmit\" class=\"submit\" @click=\"$emit('submit')\">submit</button><button class=\"confirm\" @click=\"$emit('confirm')\">confirm</button></div>",
};

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

function mountCard(props: Partial<InstanceType<typeof DaycarePrepCard>["$props"]> = {}) {
  return mount(DaycarePrepCard, {
    props: {
      productionRows: [],
      blockers: [],
      loading: false,
      error: null,
      weekEmpty: false,
      groupSlug: "family",
      week: weekFixture(),
      mutating: false,
      offline: false,
      getCompletionPreview: vi.fn(() => Promise.resolve({ data: null, error: null })),
      completeWeek: vi.fn(() => Promise.resolve({ data: null, error: null })),
      undoCompleteWeek: vi.fn(() => Promise.resolve({ data: null, error: null })),
      ...props,
    },
    global: { stubs: { ...vuetifyStubs, BaseDialog: BaseDialogStub } },
  });
}

describe("DaycarePrepCard", () => {
  test("shows a loading skeleton", () => {
    const wrapper = mountCard({ loading: true });
    expect(wrapper.find(".v-skeleton-loader").exists()).toBe(true);
  });

  test("shows an error state", () => {
    const wrapper = mountCard({ error: { status: 500, code: null, message: "boom", kind: "server", details: null } });
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

  test("offers Mark Prep Complete for an uncommitted week", () => {
    const wrapper = mountCard({ week: weekFixture({ committed: false }) });
    const buttons = wrapper.findAll("button");
    expect(buttons.some(b => b.text() === "Mark Prep Complete")).toBe(true);
    expect(wrapper.text()).not.toContain("View Receipt");
  });

  test("disables Mark Prep Complete while blockers remain", () => {
    const wrapper = mountCard({ week: weekFixture({ committed: false }), blockers: ["Batch yield not configured"] });
    const buttons = wrapper.findAll("button");
    const markComplete = buttons.find(b => b.text() === "Mark Prep Complete")!;
    expect(markComplete.attributes("disabled")).toBeDefined();
  });

  test("shows the completed date, a View Receipt link and Undo for a committed week, not the Mark Prep Complete button", () => {
    const wrapper = mountCard({ week: weekFixture({ committed: true, committed_at: "2026-01-06T12:00:00Z" }) });
    expect(wrapper.text()).toContain("Prep completed on");
    const buttons = wrapper.findAll("button");
    expect(buttons.some(b => b.text() === "View Receipt")).toBe(true);
    expect(buttons.some(b => b.text() === "Undo")).toBe(true);
    expect(buttons.some(b => b.text() === "Mark Prep Complete")).toBe(false);
  });
});
