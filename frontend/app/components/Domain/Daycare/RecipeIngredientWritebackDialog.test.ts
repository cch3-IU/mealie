import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, test, vi } from "vitest";
import RecipeIngredientWritebackDialog from "./RecipeIngredientWritebackDialog.vue";
import { vuetifyStubs } from "~/tests/stub-vuetify";
import type { DaycareUiError, IngredientWritebackPreview, IngredientWritebackReceipt } from "~/lib/api/types/daycare";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Prop types declared explicitly (not the array shorthand) so Vue's runtime boolean-attribute
// coercion applies to bare `can-confirm`/`can-submit` (no `:` binding) exactly as it does on the
// real BaseDialog — an array-only props declaration leaves them as the empty string, which is
// falsy and would hide both buttons.
const BaseDialogStub = {
  props: { modelValue: Boolean, title: String, canSubmit: Boolean, canConfirm: Boolean, submitDisabled: Boolean, loading: Boolean },
  emits: ["submit", "confirm", "update:modelValue"],
  template: "<div v-if=\"modelValue\"><div class=\"title\">{{ title }}</div><slot />"
    + "<button v-if=\"canSubmit\" class=\"submit\" :disabled=\"submitDisabled\" @click=\"$emit('submit')\">submit</button>"
    + "<button v-if=\"canConfirm\" class=\"confirm\" @click=\"$emit('confirm'); $emit('update:modelValue', false)\">confirm</button></div>",
};

function ingredientFixture(overrides: Partial<IngredientWritebackPreview["rows"][number]["before"]> = {}) {
  return { quantity: 2, unit: "cup", food: "chicken broth", note: null, original_text: null, reference_id: "ref-1", ...overrides };
}

function previewFixture(overrides: Partial<IngredientWritebackPreview> = {}): IngredientWritebackPreview {
  return {
    slug: "chicken-barley-soup",
    fingerprint_ok: true,
    fingerprint_reason: null,
    enabled_global: true,
    enabled_recipe: true,
    write_enabled: true,
    can_apply: true,
    rows: [
      {
        index: 0,
        before: ingredientFixture({ unit: "cups" }),
        after: ingredientFixture(),
        status: "structured",
      },
    ],
    creations: [],
    ambiguities: [],
    skipped: [],
    receipt: null,
    ...overrides,
  };
}

function receiptFixture(overrides: Partial<IngredientWritebackReceipt> = {}): IngredientWritebackReceipt {
  return {
    slug: "chicken-barley-soup",
    applied_at: "2026-01-01T00:00:00Z",
    fingerprint: "f2",
    rows_written: 3,
    rows_plain: 1,
    foods_created: [],
    units_created: [],
    verified: true,
    receipt_path: null,
    ...overrides,
  };
}

function daycareError(overrides: Partial<DaycareUiError> = {}): DaycareUiError {
  return { status: null, code: null, message: null, kind: "unknown", details: null, ...overrides };
}

function mountDialog(props: Partial<InstanceType<typeof RecipeIngredientWritebackDialog>["$props"]> = {}) {
  return mount(RecipeIngredientWritebackDialog, {
    props: {
      modelValue: true,
      getPreview: vi.fn(() => Promise.resolve({ data: previewFixture(), error: null })),
      applyWriteback: vi.fn(() => Promise.resolve({ data: receiptFixture(), error: null })),
      undoWriteback: vi.fn(() => Promise.resolve({ data: { slug: "chicken-barley-soup", restored_at: "2026-01-02T00:00:00Z", rows_restored: 3 }, error: null })),
      ...props,
    },
    global: { stubs: { ...vuetifyStubs, BaseDialog: BaseDialogStub } },
  });
}

describe("RecipeIngredientWritebackDialog preview", () => {
  test("fetches and renders the before/after rows, in plain words, when opened", async () => {
    const wrapper = mountDialog();
    await flushPromises();

    expect(wrapper.text()).toContain("2 cups chicken broth");
    expect(wrapper.text()).toContain("2 cup chicken broth");
  });

  test("falls back to the original ingredient text for a row with nothing structured", async () => {
    const getPreview = vi.fn(() => Promise.resolve({
      data: previewFixture({
        rows: [{
          index: 0,
          before: { quantity: null, unit: null, food: null, note: null, original_text: "a pinch of salt", reference_id: "ref-2" },
          after: { quantity: null, unit: null, food: null, note: null, original_text: "a pinch of salt", reference_id: "ref-2" },
          status: "plain_no_quantity",
        }],
      }),
      error: null,
    }));
    const wrapper = mountDialog({ getPreview });
    await flushPromises();

    expect(wrapper.text()).toContain("a pinch of salt");
  });

  test("falls back to the note when nothing structured and no original text is available", async () => {
    const getPreview = vi.fn(() => Promise.resolve({
      data: previewFixture({
        rows: [{
          index: 0,
          before: { quantity: null, unit: null, food: null, note: "to taste", original_text: null, reference_id: "ref-3" },
          after: { quantity: null, unit: null, food: null, note: "to taste", original_text: null, reference_id: "ref-3" },
          status: "plain_no_quantity",
        }],
      }),
      error: null,
    }));
    const wrapper = mountDialog({ getPreview });
    await flushPromises();

    expect(wrapper.text()).toContain("to taste");
    expect(wrapper.text()).not.toContain("(empty)");
  });

  test("shows what foods/units would be created and any ambiguities", async () => {
    const getPreview = vi.fn(() => Promise.resolve({
      data: previewFixture({
        creations: [{ kind: "food", name: "Chicken Broth" }, { kind: "unit", name: "cup" }],
        ambiguities: [{ kind: "food", name: "broth", candidates: ["Chicken Broth", "Beef Broth"] }],
        can_apply: false,
      }),
      error: null,
    }));
    const wrapper = mountDialog({ getPreview });
    await flushPromises();

    expect(wrapper.text()).toContain("Chicken Broth");
    expect(wrapper.text()).toContain("Beef Broth");
  });

  test("shows the fingerprint-stale warning when the recipe changed since it was last seen", async () => {
    const getPreview = vi.fn(() => Promise.resolve({
      data: previewFixture({ fingerprint_ok: false, fingerprint_reason: "The recipe was edited after this preview was generated.", can_apply: false }),
      error: null,
    }));
    const wrapper = mountDialog({ getPreview });
    await flushPromises();

    expect(wrapper.text()).toContain("The recipe was edited after this preview was generated.");
  });

  test("disables Apply and explains when writes are globally disabled", async () => {
    const getPreview = vi.fn(() => Promise.resolve({
      data: previewFixture({ write_enabled: false, can_apply: false }),
      error: null,
    }));
    const wrapper = mountDialog({ getPreview });
    await flushPromises();

    expect(wrapper.find(".submit").attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("disabled for this Daycare deployment");
  });

  test("disables Apply and explains when the household-wide switch is off", async () => {
    const getPreview = vi.fn(() => Promise.resolve({
      data: previewFixture({ enabled_global: false, can_apply: false }),
      error: null,
    }));
    const wrapper = mountDialog({ getPreview });
    await flushPromises();

    expect(wrapper.text()).toContain("Daycare Settings");
  });

  test("disables Apply and explains when this recipe's switch is off", async () => {
    const getPreview = vi.fn(() => Promise.resolve({
      data: previewFixture({ enabled_recipe: false, can_apply: false }),
      error: null,
    }));
    const wrapper = mountDialog({ getPreview });
    await flushPromises();

    expect(wrapper.text()).toContain("this recipe");
  });

  test("shows a generic error state when the preview fetch itself fails", async () => {
    const getPreview = vi.fn(() => Promise.resolve({ data: null, error: daycareError({ status: 502, kind: "unreachable" }) }));
    const wrapper = mountDialog({ getPreview });
    await flushPromises();

    expect(wrapper.find(".submit").exists()).toBe(false);
  });

  test("skips straight to the receipt view when the preview already carries one", async () => {
    const getPreview = vi.fn(() => Promise.resolve({ data: previewFixture({ receipt: receiptFixture({ rows_written: 5 }) }), error: null }));
    const wrapper = mountDialog({ getPreview });
    await flushPromises();

    expect(wrapper.find(".submit").exists()).toBe(false);
    expect(wrapper.text()).toContain("5");
  });
});

describe("RecipeIngredientWritebackDialog apply", () => {
  test("applying posts with a fresh Idempotency-Key, shows the receipt, and emits applied", async () => {
    const applyWriteback = vi.fn(() => Promise.resolve({ data: receiptFixture(), error: null }));
    const wrapper = mountDialog({ applyWriteback });
    await flushPromises();

    await wrapper.find(".submit").trigger("click");
    await flushPromises();

    expect(applyWriteback).toHaveBeenCalledTimes(1);
    expect(applyWriteback.mock.calls[0][0]).toMatch(UUID_RE);
    expect(wrapper.emitted("applied")).toHaveLength(1);
    expect(wrapper.text()).toContain("3");
  });

  test("a recipe_edited conflict reloads the preview instead of showing a raw error", async () => {
    const applyWriteback = vi.fn(() => Promise.resolve({ data: null, error: daycareError({ status: 409, code: "recipe_edited", message: "This recipe changed." }) }));
    const getPreview = vi.fn()
      .mockResolvedValueOnce({ data: previewFixture(), error: null })
      .mockResolvedValueOnce({ data: previewFixture({ fingerprint_ok: false, can_apply: false }), error: null });
    const wrapper = mountDialog({ applyWriteback, getPreview });
    await flushPromises();

    await wrapper.find(".submit").trigger("click");
    await flushPromises();

    expect(getPreview).toHaveBeenCalledTimes(2);
    expect(wrapper.emitted("applied")).toBeUndefined();
  });

  test("a race-condition failure (can_apply was stale) renders the sidecar's message inline without leaving the preview", async () => {
    const applyWriteback = vi.fn(() => Promise.resolve({ data: null, error: daycareError({ status: 409, code: "ambiguous_organizer", message: "\"broth\" could mean Chicken Broth or Beef Broth." }) }));
    const wrapper = mountDialog({ applyWriteback });
    await flushPromises();

    await wrapper.find(".submit").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("\"broth\" could mean Chicken Broth or Beef Broth.");
    expect(wrapper.find(".submit").exists()).toBe(true);
  });
});

describe("RecipeIngredientWritebackDialog idempotency keys", () => {
  test("a repeat Apply after an Undo, within the same open dialog, uses a fresh Idempotency-Key", async () => {
    const applyWriteback = vi.fn(() => Promise.resolve({ data: receiptFixture(), error: null }));
    const undoWriteback = vi.fn(() => Promise.resolve({ data: { slug: "chicken-barley-soup", restored_at: "2026-01-02T00:00:00Z", rows_restored: 3 }, error: null }));
    const getPreview = vi.fn(() => Promise.resolve({ data: previewFixture(), error: null }));
    const wrapper = mountDialog({ applyWriteback, undoWriteback, getPreview });
    await flushPromises();

    await wrapper.find(".submit").trigger("click");
    await flushPromises();

    await wrapper.findAll("button").find(b => b.text() === "Undo")!.trigger("click");
    await wrapper.find(".confirm").trigger("click");
    await flushPromises();

    await wrapper.find(".submit").trigger("click");
    await flushPromises();

    expect(applyWriteback).toHaveBeenCalledTimes(2);
    const firstKey = applyWriteback.mock.calls[0][0];
    const secondKey = applyWriteback.mock.calls[1][0];
    expect(firstKey).toMatch(UUID_RE);
    expect(secondKey).toMatch(UUID_RE);
    expect(secondKey).not.toBe(firstKey);
  });
});

describe("RecipeIngredientWritebackDialog undo", () => {
  test("undo requires confirmation, then posts with a fresh Idempotency-Key and emits undone", async () => {
    const undoWriteback = vi.fn(() => Promise.resolve({ data: { slug: "chicken-barley-soup", restored_at: "2026-01-02T00:00:00Z", rows_restored: 3 }, error: null }));
    const getPreview = vi.fn(() => Promise.resolve({ data: previewFixture({ receipt: receiptFixture() }), error: null }));
    const wrapper = mountDialog({ undoWriteback, getPreview });
    await flushPromises();

    await wrapper.findAll("button").find(b => b.text() === "Undo")!.trigger("click");
    expect(undoWriteback).not.toHaveBeenCalled();

    await wrapper.find(".confirm").trigger("click");
    await flushPromises();

    expect(undoWriteback).toHaveBeenCalledTimes(1);
    expect(undoWriteback.mock.calls[0][0]).toMatch(UUID_RE);
    expect(wrapper.emitted("undone")).toHaveLength(1);
  });

  test("an undo failure renders the sidecar's message inline", async () => {
    const undoWriteback = vi.fn(() => Promise.resolve({ data: null, error: daycareError({ status: 409, code: "no_receipt", message: "There's nothing to undo." }) }));
    const getPreview = vi.fn(() => Promise.resolve({ data: previewFixture({ receipt: receiptFixture() }), error: null }));
    const wrapper = mountDialog({ undoWriteback, getPreview });
    await flushPromises();

    await wrapper.findAll("button").find(b => b.text() === "Undo")!.trigger("click");
    await wrapper.find(".confirm").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("There's nothing to undo.");
    expect(wrapper.emitted("undone")).toBeUndefined();
  });
});
