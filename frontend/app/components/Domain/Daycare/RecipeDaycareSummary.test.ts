import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import RecipeDaycareSummary from "./RecipeDaycareSummary.vue";
import { vuetifyStubs } from "~/tests/stub-vuetify";
import type { NextPlannedUse, ProcessingNote } from "~/composables/daycare/use-recipe-daycare";
import type { LotTotals, RecipeDaycare } from "~/lib/api/types/daycare";

function recordFixture(overrides: Partial<RecipeDaycare> = {}): RecipeDaycare {
  return {
    slug: "chicken-barley-soup",
    name: "Chicken Barley Soup",
    recipe_id: "r1",
    classified: true,
    classification: {
      schema_version: 2,
      eligible: true,
      uses: [{ slot: "lunch", roles: ["main"] }],
      food_groups: ["protein", "grain"],
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
    ingredient_writeback: false,
    ...overrides,
  };
}

function mountSummary(props: { record: RecipeDaycare; prepared?: LotTotals | null; nextUse?: NextPlannedUse | null; processingNote?: ProcessingNote | null }) {
  return mount(RecipeDaycareSummary, {
    props: { prepared: null, nextUse: null, processingNote: null, ...props },
    global: { stubs: vuetifyStubs },
  });
}

describe("RecipeDaycareSummary", () => {
  test("shows enabled, eligible, slots/roles, and production info when classified", () => {
    const wrapper = mountSummary({ record: recordFixture() });
    expect(wrapper.text()).toContain("Enabled");
    expect(wrapper.text()).toContain("Eligible for Daycare");
    expect(wrapper.text()).toContain("Lunch (Main)");
    expect(wrapper.text()).toContain("Freezes well");
    expect(wrapper.text()).toContain("Freezer");
  });

  test("shows disabled and not-classified when the recipe has no classification yet", () => {
    const wrapper = mountSummary({ record: recordFixture({ classified: false, classification: null, settings: { ...recordFixture().settings, enabled: false } }) });
    expect(wrapper.text()).toContain("Disabled");
    expect(wrapper.text()).toContain("Not yet classified");
    expect(wrapper.text()).not.toContain("Eligible for Daycare");
  });

  test("shows a needs-review chip when classification flags it", () => {
    const record = recordFixture();
    record.classification!.classification.needs_review = true;
    const wrapper = mountSummary({ record });
    expect(wrapper.text()).toContain("Needs review");
  });

  test("shows total prepared portions (physical, not just free) and next planned use when provided", () => {
    const wrapper = mountSummary({
      record: recordFixture(),
      prepared: { physical: 4, reserved: 1, free: 3 },
      nextUse: { date: "2026-01-06", day: "tuesday", slot: "lunch", role: "main" },
    });
    expect(wrapper.text()).toContain("4");
    expect(wrapper.text()).toContain("tuesday");
    expect(wrapper.text()).toContain("2026-01-06");
  });

  test("shows a fallback when there's no planned use this week", () => {
    const wrapper = mountSummary({ record: recordFixture() });
    expect(wrapper.text()).toContain("Not on this week's plan");
  });

  test("shows no processing line when there's nothing to report", () => {
    const wrapper = mountSummary({ record: recordFixture() });
    expect(wrapper.text()).not.toContain("Processing");
  });

  test("shows the most recent processing outcome", () => {
    const wrapper = mountSummary({ record: recordFixture(), processingNote: { state: "succeeded", lastError: null, lackingYield: false } });
    expect(wrapper.text()).toContain("Processed successfully");
  });

  test("shows the processing error when the most recent run failed", () => {
    const wrapper = mountSummary({ record: recordFixture(), processingNote: { state: "failed", lastError: "LLM timeout", lackingYield: false } });
    expect(wrapper.text()).toContain("LLM timeout");
  });

  test("flags a batchable recipe that's missing a daycare portions-per-batch yield", () => {
    const wrapper = mountSummary({ record: recordFixture(), processingNote: { state: null, lastError: null, lackingYield: true } });
    expect(wrapper.text()).toContain("Set portions per batch to enable batch production");
  });

  test("shows an unavailable notice, not a zero, when the inventory fetch failed", () => {
    const wrapper = mountSummary({
      record: recordFixture(),
      prepared: null,
      preparedError: { status: 502, code: null, message: null, kind: "unreachable", details: null },
    });
    expect(wrapper.text()).toContain("Unavailable");
    expect(wrapper.text()).not.toContain("Prepared now: 0");
    expect(wrapper.text()).not.toContain("Prepared now:0");
  });

  test("shows the ingredient write-back state", () => {
    const enabledWrapper = mountSummary({ record: recordFixture({ ingredient_writeback: true }) });
    expect(enabledWrapper.text()).toContain("Ingredient write-back");
    expect(enabledWrapper.text()).toContain("Enabled");

    const disabledWrapper = mountSummary({ record: recordFixture({ ingredient_writeback: false }) });
    expect(disabledWrapper.text()).toContain("Disabled");
  });

  test("emits preview-writeback when the preview action is clicked", async () => {
    const wrapper = mountSummary({ record: recordFixture() });
    const previewButton = wrapper.findAll("button").find(b => b.text() === "Preview cleaned ingredients");
    expect(previewButton).toBeDefined();
    await previewButton!.trigger("click");
    expect(wrapper.emitted("preview-writeback")).toHaveLength(1);
  });

  test("emits retry-prepared when the retry affordance is clicked after a failed inventory fetch", async () => {
    const wrapper = mountSummary({
      record: recordFixture(),
      prepared: null,
      preparedError: { status: 502, code: null, message: null, kind: "unreachable", details: null },
    });
    await wrapper.find("button").trigger("click");
    expect(wrapper.emitted("retry-prepared")).toHaveLength(1);
  });
});
