import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, test, vi } from "vitest";
import DaycarePrepUndoControl from "./DaycarePrepUndoControl.vue";
import { vuetifyStubs } from "~/tests/stub-vuetify";
import type { UndoResult } from "~/lib/api/types/daycare";

const BaseDialogStub = {
  props: ["modelValue", "title"],
  emits: ["confirm", "update:modelValue"],
  template: "<div v-if=\"modelValue\"><slot /><button class=\"confirm\" @click=\"$emit('confirm'); $emit('update:modelValue', false)\">confirm</button></div>",
};

function ok(data: UndoResult) {
  return Promise.resolve({ data, error: null });
}

function undoUnsafe() {
  return Promise.resolve({
    data: null,
    error: { status: 409, code: "undo_unsafe", message: "Cannot undo: some leftover portions were already used.", kind: "conflict" as const, details: null },
  });
}

function mountControl(props: Partial<InstanceType<typeof DaycarePrepUndoControl>["$props"]> = {}) {
  return mount(DaycarePrepUndoControl, {
    props: {
      disabled: false,
      undoCompleteWeek: vi.fn(() => ok({ schema_version: 1, week_start: "2026-01-05", undone_at: "2026-01-06T00:00:00Z", deleted_leftover_lot_ids: [1], restored_source_lots: [] })),
      ...props,
    },
    global: { stubs: { ...vuetifyStubs, BaseDialog: BaseDialogStub } },
  });
}

describe("DaycarePrepUndoControl", () => {
  test("requires confirmation before calling undoCompleteWeek", async () => {
    const undoCompleteWeek = vi.fn(() => ok({ schema_version: 1, week_start: "2026-01-05", undone_at: "x", deleted_leftover_lot_ids: [], restored_source_lots: [] }));
    const wrapper = mountControl({ undoCompleteWeek });

    await wrapper.find("button").trigger("click");
    expect(undoCompleteWeek).not.toHaveBeenCalled();

    await wrapper.find(".confirm").trigger("click");
    await flushPromises();

    expect(undoCompleteWeek).toHaveBeenCalledTimes(1);
  });

  test("emits undone and clears state on success", async () => {
    const wrapper = mountControl();
    await wrapper.find("button").trigger("click");
    await wrapper.find(".confirm").trigger("click");
    await flushPromises();

    expect(wrapper.emitted("undone")).toHaveLength(1);
  });

  test("shows a clear refusal message and hides the button when the sidecar declines with undo_unsafe", async () => {
    const wrapper = mountControl({ undoCompleteWeek: vi.fn(undoUnsafe) });

    await wrapper.find("button").trigger("click");
    await wrapper.find(".confirm").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("can't be undone right now");
    expect(wrapper.find("button").exists()).toBe(false);
  });

  test("a non-undo_unsafe failure keeps the Undo button available to retry", async () => {
    const undoCompleteWeek = vi.fn(() => Promise.resolve({
      data: null,
      error: { status: 503, code: null, message: "The daycare service is temporarily unavailable.", kind: "unreachable" as const, details: null },
    }));
    const wrapper = mountControl({ undoCompleteWeek });

    await wrapper.find("button").trigger("click");
    await wrapper.find(".confirm").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("temporarily unavailable");
    expect(wrapper.find("button").exists()).toBe(true);
  });

  test("disables the Undo button while offline or mutating", () => {
    const wrapper = mountControl({ disabled: true });
    expect(wrapper.find("button").attributes("disabled")).toBeDefined();
  });
});
