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
    created_lots: [{ id: 9, portions: 8 }],
    consumed_lots_restored: [],
    reservations_released: [{ week: "2026-01-12", recipe: "Chicken Barley Soup", portions: 8 }],
    downstream_weeks_marked_stale: ["2026-01-12"],
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

function receiptFixture(overrides: Partial<UnlockReceipt> = {}): UnlockReceipt {
  return {
    week_start: "2026-01-05",
    unlocked_at: "2026-01-07T12:00:00Z",
    reason: null,
    forced: false,
    created_lots: [{ id: 9 }],
    consumed_lots_restored: [],
    reservations_released: [{ week: "2026-01-12", recipe: "Chicken Barley Soup", portions: 8 }],
    downstream_weeks_marked_stale: ["2026-01-12"],
    safe: true,
    reasons: [],
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
  test("fetches and renders the unlock preview in plain words when opened, with the portions each lot carries", async () => {
    const wrapper = mountDialog();
    await flushPromises();

    expect(wrapper.text()).toContain("1 prepared-food lot from this completion will be removed (8 portions).");
    expect(wrapper.text()).toContain("Chicken Barley Soup");
    expect(wrapper.text()).toContain("2026-01-12");
  });

  test("falls back to a bare count when a lot entry carries no portions figure", async () => {
    const preview = safePreviewFixture({ created_lots: [{ id: 9 }, { id: 10 }] });
    const wrapper = mountDialog({ getUnlockPreview: vi.fn(() => Promise.resolve({ data: preview, error: null })) });
    await flushPromises();

    expect(wrapper.text()).toContain("2 prepared-food lots from this completion will be removed.");
    expect(wrapper.text()).not.toContain("portions total");
  });

  test("a safe plan enables a single Confirm with no reason/acknowledgement required", async () => {
    const wrapper = mountDialog({ getUnlockPreview: vi.fn(() => Promise.resolve({ data: safePreviewFixture(), error: null })) });
    await flushPromises();

    const submit = wrapper.find(".submit");
    expect(submit.exists()).toBe(true);
    expect(submit.attributes("disabled")).toBeUndefined();
    expect(wrapper.find("textarea").exists()).toBe(false);
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

  test("shows a not-available message on a bare 404/405", async () => {
    const getUnlockPreview = vi.fn(() => Promise.resolve({ data: null, error: daycareError({ status: 404 }) }));
    const wrapper = mountDialog({ getUnlockPreview });
    await flushPromises();

    expect(wrapper.text()).toContain("isn't available yet");
    expect(wrapper.find(".submit").exists()).toBe(false);
  });
});

describe("DaycareUnlockDialog confirm — safe plan", () => {
  test("confirming a safe plan unlocks without force and shows the receipt", async () => {
    const unlockWeek = vi.fn(() => Promise.resolve({ data: receiptFixture(), error: null }));
    const wrapper = mountDialog({ unlockWeek });
    await flushPromises();

    await wrapper.find(".submit").trigger("click");
    await flushPromises();

    expect(unlockWeek).toHaveBeenCalledTimes(1);
    const [payload, key] = unlockWeek.mock.calls[0];
    expect(payload).toEqual({ reason: null, force: false });
    expect(key).toMatch(/^[0-9a-f-]{36}$/i);
    expect(wrapper.emitted("unlocked")).toHaveLength(1);
    expect(wrapper.text()).toContain("unlocked");
  });

  test("shows a prompt naming the downstream weeks that need regenerating after a successful unlock", async () => {
    const wrapper = mountDialog();
    await flushPromises();
    await wrapper.find(".submit").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("2026-01-12");
  });

  test("shows a detail-unavailable note instead of crashing when the receipt omits the plan-shaped fields entirely", async () => {
    const unlockWeek = vi.fn(() => Promise.resolve({
      data: { week_start: "2026-01-05", unlocked_at: "2026-01-07T12:00:00Z" },
      error: null,
    }));
    const wrapper = mountDialog({ unlockWeek });
    await flushPromises();

    await wrapper.find(".submit").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Receipt detail isn't available");
    expect(wrapper.emitted("unlocked")).toHaveLength(1);
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

  test("a fresh unlock_unsafe 409 on confirm refreshes the plan, keeps asking for reason/acknowledgement, and a retry mints a new key", async () => {
    const unlockWeek = vi.fn();
    unlockWeek.mockResolvedValueOnce({
      data: null,
      error: daycareError({
        status: 409,
        code: "unlock_unsafe",
        message: "Unlocking this week isn't safe.",
        details: {
          created_lots: [{ id: 9 }],
          consumed_lots_restored: [],
          reservations_released: [],
          downstream_weeks_marked_stale: [],
          safe: false,
          reasons: ["Even more food has since been used"],
        },
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
});

describe("DaycareUnlockDialog idempotent replay", () => {
  test("replaying the same successful response renders the same receipt", async () => {
    const receipt = receiptFixture();
    const unlockWeek = vi.fn(() => Promise.resolve({ data: receipt, error: null }));
    const first = mountDialog({ unlockWeek });
    await flushPromises();
    await first.find(".submit").trigger("click");
    await flushPromises();
    const firstText = first.text();

    const second = mountDialog({ unlockWeek });
    await flushPromises();
    await second.find(".submit").trigger("click");
    await flushPromises();

    expect(second.text()).toEqual(firstText);
  });
});
