import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, test, vi } from "vitest";
import DaycareMakeThisDialog from "./DaycareMakeThisDialog.vue";
import { vuetifyStubs } from "~/tests/stub-vuetify";
import type { Lot } from "~/lib/api/types/daycare";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const BaseDialogStub = {
  props: ["modelValue", "title", "canSubmit", "loading", "submitDisabled"],
  emits: ["submit", "cancel", "update:modelValue"],
  template: "<div v-if=\"modelValue\" class=\"dialog\"><div class=\"title\">{{ title }}</div><slot /><button class=\"submit\" :disabled=\"submitDisabled\" @click=\"$emit('submit')\">submit</button></div>",
};

function lotFixture(overrides: Partial<Lot> = {}): Lot {
  return {
    id: 9,
    recipe_slug: "chicken-barley-soup",
    portions_remaining: 4,
    made_date: "2026-01-01",
    use_by: null,
    storage: "freezer",
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function mountDialog(props: Partial<InstanceType<typeof DaycareMakeThisDialog>["$props"]> = {}) {
  return mount(DaycareMakeThisDialog, {
    props: {
      modelValue: true,
      createLot: vi.fn(() => Promise.resolve({ data: null, error: null })),
      ...props,
    },
    global: { stubs: { ...vuetifyStubs, BaseDialog: BaseDialogStub } },
  });
}

describe("DaycareMakeThisDialog", () => {
  test("defaults the made date to today and storage to freezer, with servings and use-by empty", () => {
    const wrapper = mountDialog();

    const servingsInput = wrapper.find("input[type=\"number\"]");
    expect((servingsInput.element as HTMLInputElement).value).toEqual("");

    const dateInputs = wrapper.findAll("input[readonly]");
    expect(dateInputs[0].element.value).toMatch(ISO_DATE_RE);
    expect(dateInputs[1].element.value).toEqual("");
  });

  test("Submit is disabled until servings is a positive number", async () => {
    const wrapper = mountDialog();
    expect(wrapper.find(".submit").attributes("disabled")).toBeDefined();

    const servingsInput = wrapper.find("input[type=\"number\"]");
    await servingsInput.setValue("0");
    expect(wrapper.find(".submit").attributes("disabled")).toBeDefined();

    await servingsInput.setValue("3");
    expect(wrapper.find(".submit").attributes("disabled")).toBeUndefined();
  });

  test("creates a lot with servings, today's made date, default storage and no use-by, then emits saved and closes", async () => {
    const createdLot = lotFixture({ portions_remaining: 3 });
    const createLot = vi.fn(() => Promise.resolve({ data: createdLot, error: null }));
    const wrapper = mountDialog({ createLot });

    await wrapper.find("input[type=\"number\"]").setValue("3");
    await wrapper.find(".submit").trigger("click");
    await flushPromises();

    expect(createLot).toHaveBeenCalledTimes(1);
    const [payload, idempotencyKey] = createLot.mock.calls[0];
    expect(payload.portions).toEqual(3);
    expect(payload.made_date).toMatch(ISO_DATE_RE);
    expect(payload.use_by).toBeNull();
    expect(payload.storage).toEqual("freezer");
    expect(idempotencyKey).toMatch(UUID_RE);

    expect(wrapper.emitted("saved")?.[0]).toEqual([createdLot]);
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([false]);
  });

  test("picking a use-by date includes it in the payload", async () => {
    const createLot = vi.fn(() => Promise.resolve({ data: lotFixture(), error: null }));
    const wrapper = mountDialog({ createLot });

    await wrapper.find("input[type=\"number\"]").setValue("2");

    const dateInputs = wrapper.findAll("input[type=\"date\"]");
    const useByDateInput = dateInputs[dateInputs.length - 1];
    await useByDateInput.setValue("2026-06-15");
    await useByDateInput.trigger("change");

    await wrapper.find(".submit").trigger("click");
    await flushPromises();

    const [payload] = createLot.mock.calls[0];
    expect(payload.use_by).toEqual("2026-06-15");
  });

  test("Clear removes a picked use-by date", async () => {
    const createLot = vi.fn(() => Promise.resolve({ data: lotFixture(), error: null }));
    const wrapper = mountDialog({ createLot });

    await wrapper.find("input[type=\"number\"]").setValue("2");
    const dateInputs = wrapper.findAll("input[type=\"date\"]");
    const useByDateInput = dateInputs[dateInputs.length - 1];
    await useByDateInput.setValue("2026-06-15");
    await useByDateInput.trigger("change");

    const clearButton = wrapper.findAll("button").find(b => b.text() === "Clear")!;
    await clearButton.trigger("click");

    await wrapper.find(".submit").trigger("click");
    await flushPromises();

    expect(createLot.mock.calls[0][0].use_by).toBeNull();
  });

  test("a retry after a failed submit reuses the same idempotency key", async () => {
    const createLot = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { status: 500, code: null, message: "boom", kind: "server" as const, details: null } })
      .mockResolvedValueOnce({ data: lotFixture(), error: null });
    const wrapper = mountDialog({ createLot });

    await wrapper.find("input[type=\"number\"]").setValue("2");
    await wrapper.find(".submit").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("boom");

    await wrapper.find(".submit").trigger("click");
    await flushPromises();

    expect(createLot).toHaveBeenCalledTimes(2);
    expect(createLot.mock.calls[0][1]).toEqual(createLot.mock.calls[1][1]);
  });

  test("a server error renders inline without closing the dialog", async () => {
    const createLot = vi.fn(() => Promise.resolve({
      data: null,
      error: { status: 422, code: null, message: "portions must be > 0", kind: "validation" as const, details: null },
    }));
    const wrapper = mountDialog({ createLot });

    await wrapper.find("input[type=\"number\"]").setValue("2");
    await wrapper.find(".submit").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("portions must be > 0");
    expect(wrapper.emitted("saved")).toBeUndefined();
  });

  test("reopening the dialog resets a prior error state and the servings field", async () => {
    const createLot = vi.fn(() => Promise.resolve({
      data: null,
      error: { status: 500, code: null, message: "boom", kind: "server" as const, details: null },
    }));
    const wrapper = mountDialog({ createLot, modelValue: false });
    await wrapper.setProps({ modelValue: true });
    await wrapper.find("input[type=\"number\"]").setValue("2");
    await wrapper.find(".submit").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("boom");

    await wrapper.setProps({ modelValue: false });
    await wrapper.setProps({ modelValue: true });

    expect(wrapper.text()).not.toContain("boom");
    expect((wrapper.find("input[type=\"number\"]").element as HTMLInputElement).value).toEqual("");
  });
});
