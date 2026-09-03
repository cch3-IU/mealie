import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import DaycareWeekPicker from "./DaycareWeekPicker.vue";
import { vuetifyStubs } from "~/tests/stub-vuetify";

function mountPicker(modelValue = "2026-01-05", disabled = false) {
  return mount(DaycareWeekPicker, {
    props: { modelValue, disabled },
    global: {
      mocks: { $globals: { icons: { arrowLeftBold: "left", arrowRightBold: "right" } } },
      stubs: vuetifyStubs,
    },
  });
}

describe("DaycareWeekPicker", () => {
  test("shows a human-readable label for the selected week", () => {
    const wrapper = mountPicker("2026-01-05");
    expect(wrapper.text()).toContain("January 5, 2026");
  });

  test("clicking next emits the week 7 days later", async () => {
    const wrapper = mountPicker("2026-01-05");
    const buttons = wrapper.findAll("button");
    await buttons[1].trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([["2026-01-12"]]);
  });

  test("clicking previous emits the week 7 days earlier", async () => {
    const wrapper = mountPicker("2026-01-05");
    const buttons = wrapper.findAll("button");
    await buttons[0].trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([["2025-12-29"]]);
  });

  test("both buttons are disabled while offline/mutating", () => {
    const wrapper = mountPicker("2026-01-05", true);
    wrapper.findAll("button").forEach((button) => {
      expect(button.attributes("disabled")).toBeDefined();
    });
  });
});
