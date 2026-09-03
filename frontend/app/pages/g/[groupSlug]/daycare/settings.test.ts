import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, test, vi } from "vitest";
import SettingsPage from "./settings.vue";
import { vuetifyStubs } from "~/tests/stub-vuetify";
import type { PlannerSettings } from "~/lib/api/types/daycare";

const load = vi.fn();
const updateSettings = vi.fn();

function settingsFixture(): PlannerSettings {
  return {
    planning: {
      max_recipe_uses_per_week: 2,
      max_inventory_recipe_uses_per_week: 3,
      min_recipe_gap_days: 1,
      min_same_slot_recipe_gap_days: 1,
      max_rotation_group_uses_per_week: 2,
      min_rotation_gap_days: 1,
      max_new_production_recipes_per_week: 1,
      max_new_production_recipes_by_slot: { breakfast: null, lunch: null, snack: null },
      history_weeks: 4,
    },
    production: { prefer_prepared_inventory: true, avoid_new_production: true },
    automation: {
      weekly_planning_enabled: false,
      planning_weekday: "monday",
      planning_time: "06:00",
      timezone: "America/Indiana/Indianapolis",
      auto_publish_meal_plan: false,
      auto_publish_shopping_list: false,
    },
    config_version: 1,
    week_start_weekday: "monday",
    weekdays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
  };
}

function daycareStateFixture(overrides: Record<string, unknown> = {}) {
  return {
    isAdmin: { value: false },
    isOffline: { value: false },
    mutating: { value: false },
    settings: { data: { value: settingsFixture() }, loading: { value: false }, error: { value: null }, load },
    updateSettings,
    ...overrides,
  };
}

let daycareState = daycareStateFixture();

vi.mock("~/composables/daycare/use-daycare", async () => {
  const actual = await vi.importActual<typeof import("~/composables/daycare/use-daycare")>("~/composables/daycare/use-daycare");
  return { ...actual, useDaycare: () => daycareState };
});

vi.stubGlobal("useSeoMeta", () => {});
vi.stubGlobal("definePageMeta", () => {});

function mountPage() {
  return mount(SettingsPage, {
    global: {
      stubs: {
        ...vuetifyStubs,
        BasePageTitle: { template: "<div><slot name=\"title\" /></div>" },
      },
    },
  });
}

describe("Daycare settings page", () => {
  beforeEach(() => {
    load.mockClear();
    updateSettings.mockReset();
    daycareState = daycareStateFixture();
  });

  test("loads settings on mount", () => {
    mountPage();
    expect(load).toHaveBeenCalledTimes(1);
  });

  test("shows a loading skeleton before settings arrive", () => {
    daycareState = daycareStateFixture({ settings: { data: { value: null }, loading: { value: true }, error: { value: null }, load } });
    const wrapper = mountPage();
    expect(wrapper.find(".v-skeleton-loader").exists()).toBe(true);
  });

  test("shows an error state when settings fail to load", () => {
    daycareState = daycareStateFixture({ settings: { data: { value: null }, loading: { value: false }, error: { value: { status: 403, code: "admin_required", message: null, kind: "forbidden", details: null } }, load } });
    const wrapper = mountPage();
    expect(wrapper.text()).toContain("don't have permission");
  });

  test("non-admin sees a read-only notice, disabled fields, and no Save button", () => {
    const wrapper = mountPage();
    expect(wrapper.text()).toContain("Only a Mealie admin can change these settings.");
    expect(wrapper.find("input").attributes("disabled")).toBeDefined();
    expect(wrapper.findAll("button").find(b => b.text() === "Save Settings")).toBeUndefined();
  });

  test("admin can edit fields and save", async () => {
    daycareState = daycareStateFixture({ isAdmin: { value: true } });
    updateSettings.mockResolvedValue({ data: settingsFixture(), error: null });
    const wrapper = mountPage();

    expect(wrapper.text()).not.toContain("Only a Mealie admin can change these settings.");
    expect(wrapper.find("input").attributes("disabled")).toBeUndefined();

    await wrapper.find("form").trigger("submit");

    expect(updateSettings).toHaveBeenCalledTimes(1);
    const payload = updateSettings.mock.calls[0][0];
    expect(payload.planning.max_recipe_uses_per_week).toEqual(2);
    expect(payload.automation.planning_weekday).toEqual("monday");
  });

  test("surfaces the server's validation message on a failed save", async () => {
    daycareState = daycareStateFixture({ isAdmin: { value: true } });
    updateSettings.mockResolvedValue({
      data: null,
      error: { status: 422, code: "validation_error", message: "Request validation failed.", kind: "validation", details: { errors: [{ loc: ["planning", "history_weeks"], msg: "must be >= 0" }] } },
    });
    const wrapper = mountPage();

    await wrapper.find("form").trigger("submit");

    expect(wrapper.text()).toContain("Request validation failed.");
    expect(wrapper.text()).toContain("planning.history_weeks: must be >= 0");
  });
});
