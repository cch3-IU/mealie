import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import DaycareErrorState from "./DaycareErrorState.vue";
import { vuetifyStubs } from "~/tests/stub-vuetify";
import type { DaycareUiError } from "~/composables/daycare/use-daycare";

function mountError(error: DaycareUiError) {
  return mount(DaycareErrorState, {
    props: { error },
    global: { stubs: vuetifyStubs },
  });
}

describe("DaycareErrorState", () => {
  test("renders the server's own message when present", () => {
    const wrapper = mountError({ status: 409, code: "week_committed", message: "That week is already committed.", kind: "conflict" });
    expect(wrapper.text()).toContain("That week is already committed.");
  });

  test("falls back to a translated message per error kind when the server sent none", () => {
    const wrapper = mountError({ status: null, code: null, message: null, kind: "offline" });
    expect(wrapper.text()).not.toEqual("");
    expect(wrapper.text()).not.toContain("daycare.errors.offline");
  });

  test.each([
    ["offline", "warning"],
    ["unreachable", "warning"],
    ["forbidden", "info"],
    ["unauthorized", "info"],
    ["conflict", "error"],
    ["server", "error"],
  ] as const)("maps error kind %s to alert type %s", (kind, type) => {
    const wrapper = mountError({ status: null, code: null, message: null, kind, details: null });
    expect(wrapper.find(".v-alert").attributes("data-type")).toEqual(type);
  });
});
