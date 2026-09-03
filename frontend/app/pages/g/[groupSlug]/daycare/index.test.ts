import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { reactive } from "vue";
import DaycarePage from "./index.vue";
import { vuetifyStubs } from "~/tests/stub-vuetify";

const refresh = vi.fn();
const setSelectedWeek = vi.fn();
const regenerateWeek = vi.fn();
const publishShopping = vi.fn();

function daycareStateFixture() {
  return {
    isAdmin: { value: false },
    canView: { value: true },
    isOffline: { value: false },
    selectedWeek: { value: "2026-01-05" },
    setSelectedWeek,
    status: { data: { value: null }, loading: { value: false }, error: { value: null }, empty: { value: false } },
    settings: { data: { value: null }, loading: { value: false }, error: { value: null }, empty: { value: false } },
    week: { data: { value: null }, loading: { value: false }, error: { value: null }, empty: { value: false } },
    prep: { data: { value: null }, loading: { value: false }, error: { value: null }, empty: { value: false } },
    shopping: { data: { value: null }, loading: { value: false }, error: { value: null }, empty: { value: false } },
    inventory: { data: { value: null }, loading: { value: false }, error: { value: null }, empty: { value: false } },
    reservations: { data: { value: null }, loading: { value: false }, error: { value: null }, empty: { value: false } },
    processing: { data: { value: null }, loading: { value: false }, error: { value: null }, empty: { value: false } },
    refresh,
    mutating: { value: false },
    regenerateWeek,
    publishWeek: vi.fn(),
    publishShopping,
    completeWeek: vi.fn(),
    undoCompleteWeek: vi.fn(),
    updateSettings: vi.fn(),
    updateRecipeDaycare: vi.fn(),
    updateSimpleFood: vi.fn(),
    pollProcessing: vi.fn(),
  };
}

let daycareState = daycareStateFixture();

vi.mock("~/composables/daycare/use-daycare", async () => {
  const actual = await vi.importActual<typeof import("~/composables/daycare/use-daycare")>("~/composables/daycare/use-daycare");
  return { ...actual, useDaycare: () => daycareState };
});

vi.stubGlobal("useRoute", () => reactive({ params: { groupSlug: "family" } }));
vi.stubGlobal("useSeoMeta", () => {});
vi.stubGlobal("definePageMeta", () => {});

function stub(name: string) {
  return {
    name,
    props: ["week", "weekEmpty", "loading", "error", "mutating", "offline", "shopping", "inventory", "status", "processing", "productionRows", "blockers", "groupSlug", "modelValue", "disabled"],
    emits: ["regenerate", "preview", "publish", "update:modelValue"],
    template: "<div><slot /></div>",
  };
}

function mountPage() {
  return mount(DaycarePage, {
    global: {
      mocks: { $globals: { icons: {} } },
      stubs: {
        ...vuetifyStubs,
        BasePageTitle: { template: "<div><slot name=\"title\" /></div>" },
        DaycarePlanCard: stub("PlanCardStub"),
        DaycarePrepCard: stub("PrepCardStub"),
        DaycareShoppingCard: stub("ShoppingCardStub"),
        DaycareInventoryCard: stub("InventoryCardStub"),
        DaycareStatusCard: stub("StatusCardStub"),
        DaycareWeekPicker: stub("WeekPickerStub"),
      },
    },
  });
}

describe("Daycare dashboard page", () => {
  beforeEach(() => {
    daycareState = daycareStateFixture();
  });

  test("refreshes all resources on mount", () => {
    mountPage();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test("shows an offline banner when offline", () => {
    daycareState.isOffline.value = true;
    const wrapper = mountPage();
    expect(wrapper.text()).toContain("You're offline.");
  });

  test("does not show an offline banner while online", () => {
    const wrapper = mountPage();
    expect(wrapper.text()).not.toContain("You're offline.");
  });

  test("changing the week picker calls setSelectedWeek", async () => {
    const wrapper = mountPage();
    await wrapper.findComponent({ name: "WeekPickerStub" }).vm.$emit("update:modelValue", "2026-01-12");
    expect(setSelectedWeek).toHaveBeenCalledWith("2026-01-12");
  });

  test("confirming regenerate on the plan card calls regenerateWeek", async () => {
    regenerateWeek.mockResolvedValue({ data: { week_start: "2026-01-05" }, error: null });
    const wrapper = mountPage();
    await wrapper.findComponent({ name: "PlanCardStub" }).vm.$emit("regenerate");
    expect(regenerateWeek).toHaveBeenCalledTimes(1);
  });

  test("shopping preview and publish call publishShopping with the right dry_run flag", async () => {
    publishShopping.mockResolvedValue({ data: { counts: { created: 1, updated: 0, deleted: 0 } }, error: null });
    const wrapper = mountPage();

    await wrapper.findComponent({ name: "ShoppingCardStub" }).vm.$emit("preview");
    expect(publishShopping).toHaveBeenCalledWith({ dry_run: true });

    await wrapper.findComponent({ name: "ShoppingCardStub" }).vm.$emit("publish");
    expect(publishShopping).toHaveBeenCalledWith({ dry_run: false });
  });
});
