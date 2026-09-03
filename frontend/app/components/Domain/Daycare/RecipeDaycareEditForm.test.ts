import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import RecipeDaycareEditForm from "./RecipeDaycareEditForm.vue";
import { vuetifyStubs } from "~/tests/stub-vuetify";
import type { RecipeDaycare } from "~/lib/api/types/daycare";

const VCheckboxStub = {
  props: ["modelValue", "label"],
  emits: ["update:modelValue"],
  template: "<label><input type=\"checkbox\" :checked=\"modelValue\" @change=\"$emit('update:modelValue', $event.target.checked)\">{{ label }}</label>",
};

// A bare passthrough for VForm — deliberately declares no `emits`, so Vue's attribute-fallthrough
// attaches the real component's `@submit.prevent` listener directly to this native <form>, exactly
// as it would on real Vuetify's VForm. This is what makes the .prevent-regression test below
// meaningful: a stub that manually re-emits "submit" would mask a missing `.prevent` in the source.
const VFormStub = {
  template: "<form><slot /></form>",
};

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
      food_groups: [],
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
    ...overrides,
  };
}

function mountForm(record: RecipeDaycare, saving = false) {
  return mount(RecipeDaycareEditForm, {
    props: { record, saving },
    global: { stubs: { ...vuetifyStubs, VCheckbox: VCheckboxStub, VForm: VFormStub } },
  });
}

describe("RecipeDaycareEditForm", () => {
  test("submits settings and classification patches built from the initial record", async () => {
    const wrapper = mountForm(recordFixture());
    await wrapper.find("form").trigger("submit");

    const emitted = wrapper.emitted("save");
    expect(emitted).toHaveLength(1);
    expect(emitted![0][0]).toEqual({
      settings: { enabled: true, daycare_portions_per_batch: 6 },
      classification: {
        uses: { breakfast: null, lunch: ["main"], snack: null },
        production: { batchable: true, freezable: "yes", preferred_batch_storage: "freezer" },
      },
    });
  });

  test("prevents the native form submission (no full-page navigation)", async () => {
    const wrapper = mountForm(recordFixture());
    const formEl = wrapper.find("form").element;
    const event = new Event("submit", { bubbles: true, cancelable: true });
    formEl.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  test("toggling a role checkbox changes the submitted uses patch", async () => {
    const wrapper = mountForm(recordFixture());
    const checkboxes = wrapper.findAll("input[type=checkbox]");
    // [0] is the "enabled" VSwitch (also stubbed as a checkbox input); the per-slot/role VCheckboxes
    // follow in SLOTS x ROLES order, so [1] is breakfast/main.
    const breakfastMain = checkboxes[1];
    await breakfastMain.setValue(true);
    await wrapper.find("form").trigger("submit");

    const payload = wrapper.emitted("save")![0][0] as { classification: { uses: Record<string, string[] | null> } };
    expect(payload.classification.uses.breakfast).toEqual(["main"]);
  });

  test("omits the classification patch and shows a notice when the recipe isn't classified", async () => {
    const wrapper = mountForm(recordFixture({ classified: false, classification: null }));
    expect(wrapper.text()).toContain("aren't editable until this recipe has been classified");

    await wrapper.find("form").trigger("submit");
    const payload = wrapper.emitted("save")![0][0] as { classification?: unknown };
    expect(payload.classification).toBeUndefined();
  });

  test("emptying portions per batch submits null, not an empty string", async () => {
    const wrapper = mountForm(recordFixture());
    const portionsInput = wrapper.find("input[type=number]");
    expect(portionsInput.exists()).toBe(true);
    await portionsInput.setValue("");
    await wrapper.find("form").trigger("submit");

    const payload = wrapper.emitted("save")![0][0] as { settings: { daycare_portions_per_batch: unknown } };
    expect(payload.settings.daycare_portions_per_batch).toBeNull();
  });

  test("disables the submit button while saving", () => {
    const wrapper = mountForm(recordFixture(), true);
    expect(wrapper.find("button").attributes("disabled")).toBeDefined();
  });
});
