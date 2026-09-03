import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, test, vi } from "vitest";
import DaycarePrepCompletionDialog from "./DaycarePrepCompletionDialog.vue";
import { vuetifyStubs } from "~/tests/stub-vuetify";
import type { CommitReceipt, CompletionPreview, DaycareUiError } from "~/lib/api/types/daycare";

const BaseDialogStub = {
  props: ["modelValue", "title", "canSubmit", "loading"],
  emits: ["submit", "update:modelValue"],
  template: "<div v-if=\"modelValue\"><div class=\"title\">{{ title }}</div><slot /><button v-if=\"canSubmit\" class=\"submit\" @click=\"$emit('submit')\">submit</button></div>",
};

function previewFixture(overrides: Partial<CompletionPreview> = {}): CompletionPreview {
  return {
    schema_version: 1,
    week_start: "2026-01-05",
    recipes: [
      {
        recipe_slug: "chicken-barley-soup",
        recipe_name: "Chicken Barley Soup",
        week_demand_daycare_portions: 10,
        existing_inventory_allocated: 2,
        new_production_daycare_portions: 16,
        new_production_allocated_to_week: 8,
        leftover_portions_to_inventory: 8,
        leftover_storage: "freezer",
      },
    ],
    summary: {
      week_recipe_portions: 10,
      existing_inventory_allocated: 2,
      new_production_portions: 16,
      new_production_allocated_to_week: 8,
      leftover_portions_to_inventory: 8,
    },
    ...overrides,
  };
}

function receiptFixture(overrides: Partial<CommitReceipt> = {}): CommitReceipt {
  return {
    schema_version: 2,
    week_start: "2026-01-05",
    made_date: "2026-01-06",
    committed_at: "2026-01-06T12:00:00Z",
    summary: { existing_inventory_allocated: 2, leftover_portions_added: 8, leftover_lots_added: 1 },
    ...overrides,
  };
}

function daycareError(overrides: Partial<DaycareUiError> = {}): DaycareUiError {
  return { status: null, code: null, message: null, kind: "unknown", details: null, ...overrides };
}

function mountDialog(props: Partial<InstanceType<typeof DaycarePrepCompletionDialog>["$props"]> = {}) {
  return mount(DaycarePrepCompletionDialog, {
    props: {
      modelValue: true,
      committed: false,
      committedAt: null,
      getCompletionPreview: vi.fn(() => Promise.resolve({ data: previewFixture(), error: null })),
      completeWeek: vi.fn(() => Promise.resolve({ data: receiptFixture(), error: null })),
      getCommitReceipt: vi.fn(() => Promise.resolve({ data: receiptFixture(), error: null })),
      ...props,
    },
    global: { stubs: { ...vuetifyStubs, BaseDialog: BaseDialogStub } },
  });
}

describe("DaycarePrepCompletionDialog preview", () => {
  test("fetches and renders the completion preview when opened, in plain words", async () => {
    const wrapper = mountDialog();
    await flushPromises();

    expect(wrapper.text()).toContain("Chicken Barley Soup");
    expect(wrapper.text()).toContain("8"); // leftover-to-freezer note
  });

  test("the confirm action is unavailable until the preview has loaded", async () => {
    let resolvePreview!: (value: { data: CompletionPreview; error: null }) => void;
    const getCompletionPreview = vi.fn(() => new Promise<{ data: CompletionPreview; error: null }>((resolve) => { resolvePreview = resolve; }));
    const wrapper = mountDialog({ getCompletionPreview });

    expect(wrapper.find(".submit").exists()).toBe(false);

    resolvePreview({ data: previewFixture(), error: null });
    await flushPromises();

    expect(wrapper.find(".submit").exists()).toBe(true);
  });

  test("shows blockers instead of a preview when the sidecar refuses with prep_blocked", async () => {
    const getCompletionPreview = vi.fn(() => Promise.resolve({
      data: null,
      error: daycareError({ status: 409, code: "prep_blocked", details: { blockers: ["Batch yield not configured for Chicken Barley Soup"] } }),
    }));
    const wrapper = mountDialog({ getCompletionPreview });
    await flushPromises();

    expect(wrapper.text()).toContain("Before this can be prepped");
    expect(wrapper.text()).toContain("Batch yield not configured for Chicken Barley Soup");
    expect(wrapper.find(".submit").exists()).toBe(false);
  });

  test("shows a plain not-planned message on a 404", async () => {
    const getCompletionPreview = vi.fn(() => Promise.resolve({
      data: null,
      error: daycareError({ status: 404, code: "week_not_planned" }),
    }));
    const wrapper = mountDialog({ getCompletionPreview });
    await flushPromises();

    expect(wrapper.text()).toContain("hasn't been planned yet");
  });
});

describe("DaycarePrepCompletionDialog confirm", () => {
  test("confirming posts the completion and shows the returned receipt", async () => {
    const completeWeek = vi.fn(() => Promise.resolve({ data: receiptFixture(), error: null }));
    const wrapper = mountDialog({ completeWeek });
    await flushPromises();

    await wrapper.find(".submit").trigger("click");
    await flushPromises();

    expect(completeWeek).toHaveBeenCalledTimes(1);
    const [payload, key] = completeWeek.mock.calls[0];
    expect(payload).toEqual({});
    expect(key).toMatch(/^[0-9a-f-]{36}$/i);
    expect(wrapper.emitted("completed")).toHaveLength(1);
    expect(wrapper.text()).toContain("2 portions used from what was already in the freezer");
  });

  test("a week_committed conflict on confirm reads the canonical receipt and never mutates again", async () => {
    const completeWeek = vi.fn(() => Promise.resolve({
      data: null,
      error: daycareError({ status: 409, code: "week_committed" }),
    }));
    const getCommitReceipt = vi.fn(() => Promise.resolve({ data: receiptFixture(), error: null }));
    const wrapper = mountDialog({ completeWeek, getCommitReceipt });
    await flushPromises();

    await wrapper.find(".submit").trigger("click");
    await flushPromises();

    expect(getCommitReceipt).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("2 portions used from what was already in the freezer");
    expect(wrapper.text()).toContain("already marked complete");
    expect(wrapper.emitted("completed")).toBeUndefined();
  });
});

describe("DaycarePrepCompletionDialog for an already-committed week", () => {
  test("skips the preview step and reads the persisted receipt via a GET, never replaying the commit", async () => {
    const getCompletionPreview = vi.fn();
    const completeWeek = vi.fn();
    const getCommitReceipt = vi.fn(() => Promise.resolve({ data: receiptFixture(), error: null }));
    const wrapper = mountDialog({ committed: true, committedAt: "2026-01-06T12:00:00Z", getCompletionPreview, completeWeek, getCommitReceipt });
    await flushPromises();

    expect(getCompletionPreview).not.toHaveBeenCalled();
    expect(completeWeek).not.toHaveBeenCalled();
    expect(getCommitReceipt).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("2 portions used from what was already in the freezer");
    expect(wrapper.find(".submit").exists()).toBe(false);
  });

  test("falls back to a completed-on date and a detail-unavailable note on a 404 receipt_not_found", async () => {
    const completeWeek = vi.fn();
    const getCommitReceipt = vi.fn(() => Promise.resolve({
      data: null,
      error: daycareError({ status: 404, code: "receipt_not_found" }),
    }));
    const wrapper = mountDialog({ committed: true, committedAt: "2026-01-06T12:00:00Z", completeWeek, getCommitReceipt });
    await flushPromises();

    expect(completeWeek).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("Completed on");
    expect(wrapper.text()).toContain("Receipt detail isn't available");
    expect(wrapper.text()).not.toContain("portions used from what was already in the freezer");
  });

  test("falls back to a completed-on date and a detail-unavailable note on a bare 404 with no structured error code", async () => {
    const completeWeek = vi.fn();
    const getCommitReceipt = vi.fn(() => Promise.resolve({
      data: null,
      error: daycareError({ status: 404, code: null }),
    }));
    const wrapper = mountDialog({ committed: true, committedAt: "2026-01-06T12:00:00Z", completeWeek, getCommitReceipt });
    await flushPromises();

    expect(completeWeek).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("Completed on");
    expect(wrapper.text()).toContain("Receipt detail isn't available");
    expect(wrapper.text()).not.toContain("This week hasn't been planned yet");
  });
});
