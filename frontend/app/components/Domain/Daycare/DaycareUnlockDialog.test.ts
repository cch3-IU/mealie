import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, test, vi } from "vitest";
import DaycareUnlockDialog from "./DaycareUnlockDialog.vue";
import { vuetifyStubs } from "~/tests/stub-vuetify";
import type { DaycareUiError, UnlockPreview, UnlockReceipt } from "~/lib/api/types/daycare";

const BaseDialogStub = {
  props: ["modelValue", "title", "canSubmit", "submitDisabled", "loading"],
  emits: ["submit", "update:modelValue"],
  template: "<div v-if=\"modelValue\"><div class=\"title\">{{ title }}</div><slot /><button v-if=\"canSubmit\" class=\"submit\" :disabled=\"submitDisabled\" @click=\"!submitDisabled && $emit('submit')\">submit</button></div>",
};

function safePreviewFixture(overrides: Partial<UnlockPreview> = {}): UnlockPreview {
  return {
    week_start: "2026-01-05",
    created_lots: [{
      lot_id: 9,
      recipe_slug: "chicken-barley-soup",
      portions: 8,
      current_portions_remaining: 8,
      exists: true,
      touched: false,
      made_date: "2026-01-06",
      use_by: "2026-02-06",
      storage: "freezer",
    }],
    consumed_source_lots: [],
    missing_source_lot: false,
    affected_reservations: [{ week_start: "2026-01-12", recipe_slug: "chicken-barley-soup", portions: 8 }],
    affected_weeks: ["2026-01-12"],
    safe: true,
    reasons: [],
    ...overrides,
  };
}

function unsafePreviewFixture(overrides: Partial<UnlockPreview> = {}): UnlockPreview {
  return safePreviewFixture({
    safe: false,
    reasons: ["Some of this week's prepared food has already been used"],
    ...overrides,
  });
}

function refusedPreviewFixture(overrides: Partial<UnlockPreview> = {}): UnlockPreview {
  return unsafePreviewFixture({
    missing_source_lot: true,
    reasons: ["A source lot consumed by this completion no longer exists, so it cannot be restored exactly."],
    ...overrides,
  });
}

function receiptFixture(overrides: Partial<UnlockReceipt> = {}): UnlockReceipt {
  return {
    schema_version: 1,
    week_start: "2026-01-05",
    unlocked_at: "2026-01-07T12:00:00Z",
    reason: "Routine unlock",
    admin_user: "admin",
    forced: false,
    deleted_leftover_lot_ids: [9],
    restored_source_lots: [],
    released_reservations: [{ week_start: "2026-01-12", recipe_slug: "chicken-barley-soup", portions: 8 }],
    affected_weeks: ["2026-01-12"],
    downstream_weeks_marked_stale: ["2026-01-12"],
    ...overrides,
  };
}

function daycareError(overrides: Partial<DaycareUiError> = {}): DaycareUiError {
  return { status: null, code: null, message: null, kind: "unknown", details: null, ...overrides };
}

function mountDialog(props: Partial<InstanceType<typeof DaycareUnlockDialog>["$props"]> = {}) {
  return mount(DaycareUnlockDialog, {
    props: {
      modelValue: true,
      getUnlockPreview: vi.fn(() => Promise.resolve({ data: safePreviewFixture(), error: null })),
      unlockWeek: vi.fn(() => Promise.resolve({ data: receiptFixture(), error: null })),
      ...props,
    },
    global: { stubs: { ...vuetifyStubs, BaseDialog: BaseDialogStub } },
  });
}

describe("DaycareUnlockDialog preview", () => {
  test("fetches and renders the unlock preview in plain words, with the portions each lot carries", async () => {
    const wrapper = mountDialog();
    await flushPromises();

    expect(wrapper.text()).toContain("1 prepared-food lot from this completion will be removed (8 portions).");
    expect(wrapper.text()).toContain("Chicken Barley Soup");
    expect(wrapper.text()).toContain("2026-01-12");
  });

  test("a reason is always required, even for a safe plan — no checkbox, but Confirm stays disabled until typed", async () => {
    const wrapper = mountDialog({ getUnlockPreview: vi.fn(() => Promise.resolve({ data: safePreviewFixture(), error: null })) });
    await flushPromises();

    expect(wrapper.find("input[type=checkbox]").exists()).toBe(false);
    const submit = wrapper.find(".submit");
    expect(submit.exists()).toBe(true);
    expect(submit.attributes("disabled")).toBeDefined();

    await wrapper.find("textarea").setValue("Routine unlock");
    expect(wrapper.find(".submit").attributes("disabled")).toBeUndefined();
  });

  test("an unsafe plan shows the reasons and disables Confirm until a reason and acknowledgement are given", async () => {
    const wrapper = mountDialog({ getUnlockPreview: vi.fn(() => Promise.resolve({ data: unsafePreviewFixture(), error: null })) });
    await flushPromises();

    expect(wrapper.text()).toContain("already been used");
    const submit = wrapper.find(".submit");
    expect(submit.attributes("disabled")).toBeDefined();

    await wrapper.find("textarea").setValue("Correcting a data-entry mistake");
    expect(wrapper.find(".submit").attributes("disabled")).toBeDefined();

    await wrapper.find("input[type=checkbox]").setValue(true);
    expect(wrapper.find(".submit").attributes("disabled")).toBeUndefined();
  });

  test("a permanently-refused plan (a source lot no longer exists) shows the reasons and offers no way to submit, even forced", async () => {
    const wrapper = mountDialog({ getUnlockPreview: vi.fn(() => Promise.resolve({ data: refusedPreviewFixture(), error: null })) });
    await flushPromises();

    expect(wrapper.text()).toContain("can't be unlocked");
    expect(wrapper.text()).toContain("no longer exists");
    expect(wrapper.find(".submit").exists()).toBe(false);
    expect(wrapper.find("textarea").exists()).toBe(false);
    expect(wrapper.find("input[type=checkbox]").exists()).toBe(false);
  });

  test("shows a not-available message on a bare 404/405", async () => {
    const getUnlockPreview = vi.fn(() => Promise.resolve({ data: null, error: daycareError({ status: 404 }) }));
    const wrapper = mountDialog({ getUnlockPreview });
    await flushPromises();

    expect(wrapper.text()).toContain("isn't available yet");
    expect(wrapper.find(".submit").exists()).toBe(false);
  });
});

describe("DaycareUnlockDialog confirm — safe plan", () => {
  test("confirming a safe plan sends force:false with the typed reason, and shows the receipt", async () => {
    const unlockWeek = vi.fn(() => Promise.resolve({ data: receiptFixture(), error: null }));
    const wrapper = mountDialog({ unlockWeek });
    await flushPromises();

    await wrapper.find("textarea").setValue("Routine unlock");
    await wrapper.find(".submit").trigger("click");
    await flushPromises();

    expect(unlockWeek).toHaveBeenCalledTimes(1);
    const [payload, key] = unlockWeek.mock.calls[0];
    expect(payload).toEqual({ reason: "Routine unlock", force: false });
    expect(key).toMatch(/^[0-9a-f-]{36}$/i);
    expect(wrapper.emitted("unlocked")).toHaveLength(1);
    expect(wrapper.text()).toContain("unlocked");
  });

  test("shows counts of lots removed/restored and a prompt naming the downstream weeks that need regenerating", async () => {
    const unlockWeek = vi.fn(() => Promise.resolve({
      data: receiptFixture({ deleted_leftover_lot_ids: [9, 10], restored_source_lots: [{ lot_id: 3, portions: 4 }] }),
      error: null,
    }));
    const wrapper = mountDialog({ unlockWeek });
    await flushPromises();
    await wrapper.find("textarea").setValue("Routine unlock");
    await wrapper.find(".submit").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("2 prepared-food lots from this completion were removed.");
    expect(wrapper.text()).toContain("1 consumed lot will be restored (4 portions).");
    expect(wrapper.text()).toContain("2026-01-12");
  });
});

describe("DaycareUnlockDialog confirm — unsafe plan", () => {
  test("confirming an unsafe plan sends force:true with the typed reason", async () => {
    const unlockWeek = vi.fn(() => Promise.resolve({ data: receiptFixture({ forced: true, reason: "Correcting a mistake" }), error: null }));
    const wrapper = mountDialog({
      getUnlockPreview: vi.fn(() => Promise.resolve({ data: unsafePreviewFixture(), error: null })),
      unlockWeek,
    });
    await flushPromises();

    await wrapper.find("textarea").setValue("Correcting a mistake");
    await wrapper.find("input[type=checkbox]").setValue(true);
    await wrapper.find(".submit").trigger("click");
    await flushPromises();

    expect(unlockWeek).toHaveBeenCalledTimes(1);
    const [payload] = unlockWeek.mock.calls[0];
    expect(payload).toEqual({ reason: "Correcting a mistake", force: true });
    expect(wrapper.emitted("unlocked")).toHaveLength(1);
  });

  test("a fresh unlock_unsafe 409 on confirm adopts the plan from details.plan, keeps asking for reason/acknowledgement, and a retry mints a new key", async () => {
    const unlockWeek = vi.fn();
    unlockWeek.mockResolvedValueOnce({
      data: null,
      error: daycareError({
        status: 409,
        code: "unlock_unsafe",
        message: "Unlocking this week isn't safe.",
        details: { week_start: "2026-01-05", plan: unsafePreviewFixture({ reasons: ["Even more food has since been used"] }) },
      }),
    });
    unlockWeek.mockResolvedValueOnce({ data: receiptFixture({ forced: true, reason: "Correcting a mistake" }), error: null });
    const wrapper = mountDialog({
      getUnlockPreview: vi.fn(() => Promise.resolve({ data: unsafePreviewFixture(), error: null })),
      unlockWeek,
    });
    await flushPromises();

    await wrapper.find("textarea").setValue("Correcting a mistake");
    await wrapper.find("input[type=checkbox]").setValue(true);
    await wrapper.find(".submit").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Even more food has since been used");
    expect(wrapper.emitted("unlocked")).toBeUndefined();
    // the typed reason/acknowledgement carry over, so retrying immediately is possible
    expect(wrapper.find(".submit").attributes("disabled")).toBeUndefined();

    await wrapper.find(".submit").trigger("click");
    await flushPromises();

    expect(unlockWeek).toHaveBeenCalledTimes(2);
    const firstKey = unlockWeek.mock.calls[0][1];
    const secondKey = unlockWeek.mock.calls[1][1];
    expect(secondKey).not.toEqual(firstKey);
    expect(wrapper.emitted("unlocked")).toHaveLength(1);
  });

  test("a fresh unlock_unsafe 409 that now reports missing_source_lot switches to the permanently-refused state", async () => {
    const unlockWeek = vi.fn(() => Promise.resolve({
      data: null,
      error: daycareError({
        status: 409,
        code: "unlock_unsafe",
        details: { week_start: "2026-01-05", plan: refusedPreviewFixture() },
      }),
    }));
    const wrapper = mountDialog({
      getUnlockPreview: vi.fn(() => Promise.resolve({ data: unsafePreviewFixture(), error: null })),
      unlockWeek,
    });
    await flushPromises();
    await wrapper.find("textarea").setValue("Correcting a mistake");
    await wrapper.find("input[type=checkbox]").setValue(true);
    await wrapper.find(".submit").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("can't be unlocked");
    expect(wrapper.find(".submit").exists()).toBe(false);
  });
});

describe("DaycareUnlockDialog idempotent replay", () => {
  test("replaying the same successful response renders the same receipt", async () => {
    const receipt = receiptFixture();
    const unlockWeek = vi.fn(() => Promise.resolve({ data: receipt, error: null }));
    const first = mountDialog({ unlockWeek });
    await flushPromises();
    await first.find("textarea").setValue("Routine unlock");
    await first.find(".submit").trigger("click");
    await flushPromises();
    const firstText = first.text();

    const second = mountDialog({ unlockWeek });
    await flushPromises();
    await second.find("textarea").setValue("Routine unlock");
    await second.find(".submit").trigger("click");
    await flushPromises();

    expect(second.text()).toEqual(firstText);
  });
});
