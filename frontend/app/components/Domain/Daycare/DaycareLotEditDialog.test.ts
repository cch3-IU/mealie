import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, test, vi } from "vitest";
import DaycareLotEditDialog from "./DaycareLotEditDialog.vue";
import { vuetifyStubs } from "~/tests/stub-vuetify";
import type { Lot } from "~/lib/api/types/daycare";

const BaseDialogStub = {
  props: ["modelValue", "title", "canSubmit", "loading", "submitDisabled"],
  emits: ["submit", "cancel", "update:modelValue"],
  template: "<div v-if=\"modelValue\" class=\"dialog\"><slot /><button v-if=\"canSubmit\" class=\"submit\" :disabled=\"submitDisabled\" @click=\"$emit('submit')\">submit</button></div>",
};

function lotFixture(overrides: Partial<Lot> = {}): Lot {
  return {
    id: 7,
    recipe_slug: "chicken-barley-soup",
    portions_remaining: 6,
    made_date: "2026-01-01",
    use_by: "2026-04-01",
    storage: "freezer",
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function mountDialog(props: Partial<InstanceType<typeof DaycareLotEditDialog>["$props"]> = {}) {
  return mount(DaycareLotEditDialog, {
    props: {
      modelValue: true,
      lot: lotFixture(),
      updateLot: vi.fn(() => Promise.resolve({ data: null, error: null })),
      ...props,
    },
    global: { stubs: { ...vuetifyStubs, BaseDialog: BaseDialogStub } },
  });
}

describe("DaycareLotEditDialog", () => {
  test("prefills portions and use-by from the lot", () => {
    const wrapper = mountDialog();
    const portionsInput = wrapper.find("input[type=\"number\"]");
    expect((portionsInput.element as HTMLInputElement).value).toEqual("6");
    const useByInput = wrapper.find("input[readonly]");
    expect((useByInput.element as HTMLInputElement).value).toEqual("2026-04-01");
  });

  test("saves the current portions and use-by, then emits saved and closes on success", async () => {
    const updatedLot = lotFixture({ portions_remaining: 6, use_by: "2026-04-01" });
    const updateLot = vi.fn(() => Promise.resolve({ data: updatedLot, error: null }));
    const wrapper = mountDialog({ updateLot });

    await wrapper.find(".submit").trigger("click");
    await flushPromises();

    expect(updateLot).toHaveBeenCalledWith(7, { portions_remaining: 6, use_by: "2026-04-01" });
    expect(wrapper.emitted("saved")?.[0]).toEqual([updatedLot]);
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([false]);
  });

  test("picking a new use-by date updates the field and is sent on save", async () => {
    const updateLot = vi.fn(() => Promise.resolve({ data: lotFixture(), error: null }));
    const wrapper = mountDialog({ updateLot });

    const dateInput = wrapper.find("input[type=\"date\"]");
    await dateInput.setValue("2026-06-15");
    await dateInput.trigger("change");

    const useByInput = wrapper.find("input[readonly]");
    expect((useByInput.element as HTMLInputElement).value).toEqual("2026-06-15");

    await wrapper.find(".submit").trigger("click");
    await flushPromises();

    expect(updateLot).toHaveBeenCalledWith(7, { portions_remaining: 6, use_by: "2026-06-15" });
  });

  test("Clear removes the use-by date, sending null on save", async () => {
    const updateLot = vi.fn(() => Promise.resolve({ data: lotFixture(), error: null }));
    const wrapper = mountDialog({ updateLot });

    const clearButton = wrapper.findAll("button").find(b => b.text() === "Clear")!;
    await clearButton.trigger("click");

    await wrapper.find(".submit").trigger("click");
    await flushPromises();

    expect(updateLot).toHaveBeenCalledWith(7, { portions_remaining: 6, use_by: null });
  });

  test("disables Save while the portions field is empty/invalid", async () => {
    const wrapper = mountDialog();
    const portionsInput = wrapper.find("input[type=\"number\"]");
    await portionsInput.setValue("");

    const submit = wrapper.find(".submit");
    expect(submit.attributes("disabled")).toBeDefined();
  });

  test("a 409 lot_reserved conflict renders the sidecar's message inline", async () => {
    const updateLot = vi.fn(() => Promise.resolve({
      data: null,
      error: { status: 409, code: "lot_reserved", message: "Can't drop below what's reserved for planned weeks.", kind: "conflict" as const, details: null },
    }));
    const wrapper = mountDialog({ updateLot });

    await wrapper.find(".submit").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Can't drop below what's reserved for planned weeks.");
    expect(wrapper.emitted("saved")).toBeUndefined();
  });

  test("a 422 renders the sidecar's validation message inline", async () => {
    const updateLot = vi.fn(() => Promise.resolve({
      data: null,
      error: { status: 422, code: null, message: "use_by must be a valid date.", kind: "validation" as const, details: null },
    }));
    const wrapper = mountDialog({ updateLot });

    await wrapper.find(".submit").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("use_by must be a valid date.");
  });

  test("a bare 404 (endpoint not deployed yet) shows an editing-not-available message, not a generic error", async () => {
    const updateLot = vi.fn(() => Promise.resolve({
      data: null,
      error: { status: 404, code: null, message: null, kind: "not-found" as const, details: null },
    }));
    const wrapper = mountDialog({ updateLot });

    await wrapper.find(".submit").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Editing inventory isn't available yet");
  });

  test("a bare 405 (method not allowed) also shows the editing-not-available message", async () => {
    const updateLot = vi.fn(() => Promise.resolve({
      data: null,
      error: { status: 405, code: null, message: null, kind: "unknown" as const, details: null },
    }));
    const wrapper = mountDialog({ updateLot });

    await wrapper.find(".submit").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Editing inventory isn't available yet");
  });

  test("reopening the dialog resets a prior error state", async () => {
    const updateLot = vi.fn(() => Promise.resolve({
      data: null,
      error: { status: 500, code: null, message: "boom", kind: "server" as const, details: null },
    }));
    const wrapper = mountDialog({ updateLot, modelValue: false });
    await wrapper.setProps({ modelValue: true });
    await wrapper.find(".submit").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("boom");

    await wrapper.setProps({ modelValue: false });
    await wrapper.setProps({ modelValue: true });

    expect(wrapper.text()).not.toContain("boom");
  });
});
