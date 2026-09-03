import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { reactive } from "vue";
import DaycarePage from "./index.vue";
import { toastAlert } from "~/composables/use-toast";
import { vuetifyStubs } from "~/tests/stub-vuetify";

const refresh = vi.fn();
const setSelectedWeek = vi.fn();
const regenerateWeek = vi.fn();
const publishShopping = vi.fn();
const weekLoad = vi.fn();

function daycareStateFixture() {
  return {
    isAdmin: { value: false },
    canView: { value: true },
    isOffline: { value: false },
    selectedWeek: { value: "2026-01-05" },
    setSelectedWeek,
    status: { data: { value: null }, loading: { value: false }, error: { value: null }, empty: { value: false } },
    settings: { data: { value: null }, loading: { value: false }, error: { value: null }, empty: { value: false } },
    week: { data: { value: null }, loading: { value: false }, error: { value: null }, empty: { value: false }, load: weekLoad },
    prep: { data: { value: null }, loading: { value: false }, error: { value: null }, empty: { value: false } },
    shopping: { data: { value: null }, loading: { value: false }, error: { value: null }, empty: { value: false } },
    inventory: { data: { value: null }, loading: { value: false }, error: { value: null }, empty: { value: false } },
    recipes: { data: { value: null }, loading: { value: false }, error: { value: null }, empty: { value: false } },
    reservations: { data: { value: null }, loading: { value: false }, error: { value: null }, empty: { value: false } },
    processing: { data: { value: null }, loading: { value: false }, error: { value: null }, empty: { value: false } },
    refresh,
    mutating: { value: false },
    regenerateWeek,
    publishWeek: vi.fn(),
    publishShopping,
    completeWeek: vi.fn(),
    undoCompleteWeek: vi.fn(),
    getUnlockPreview: vi.fn(),
    unlockWeek: vi.fn(),
    updateSettings: vi.fn(),
    updateRecipeDaycare: vi.fn(),
    updateSimpleFood: vi.fn(),
    updateLot: vi.fn(),
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
    props: ["week", "weekEmpty", "loading", "error", "mutating", "offline", "shopping", "inventory", "status", "processing", "productionRows", "blockers", "groupSlug", "modelValue", "disabled", "isAdmin", "getUnlockPreview", "unlockWeek"],
    emits: ["regenerate", "unlocked", "preview", "publish", "update:modelValue"],
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

  test("an unlocked plan card event toasts success", async () => {
    toastAlert.open = false;
    const wrapper = mountPage();

    await wrapper.findComponent({ name: "PlanCardStub" }).vm.$emit("unlocked", { week_start: "2026-01-05", unlocked_at: "2026-01-07T00:00:00Z" });

    expect(toastAlert.open).toBe(true);
    expect(toastAlert.text).toEqual("Week unlocked.");
  });

  test("passes isAdmin and the unlock functions to the plan card", () => {
    daycareState.isAdmin.value = true;
    const wrapper = mountPage();

    const planCard = wrapper.findComponent({ name: "PlanCardStub" });
    expect(planCard.props("isAdmin")).toBe(true);
    expect(planCard.props("getUnlockPreview")).toBe(daycareState.getUnlockPreview);
    expect(planCard.props("unlockWeek")).toBe(daycareState.unlockWeek);
  });

  test("shopping preview and publish call publishShopping with the right dry_run flag", async () => {
    publishShopping.mockResolvedValue({ data: { counts: { created: 1, updated: 0, deleted: 0 } }, error: null });
    const wrapper = mountPage();

    await wrapper.findComponent({ name: "ShoppingCardStub" }).vm.$emit("preview");
    expect(publishShopping).toHaveBeenCalledWith({ dry_run: true });

    await wrapper.findComponent({ name: "ShoppingCardStub" }).vm.$emit("publish");
    expect(publishShopping).toHaveBeenCalledWith({ dry_run: false });
  });

  test("passes the current week and group slug to the shopping and status cards", () => {
    daycareState.week.data.value = { week_start: "2026-01-05" };
    const wrapper = mountPage();

    expect(wrapper.findComponent({ name: "ShoppingCardStub" }).props("week")).toEqual({ week_start: "2026-01-05" });
    expect(wrapper.findComponent({ name: "ShoppingCardStub" }).props("groupSlug")).toEqual("family");
    expect(wrapper.findComponent({ name: "StatusCardStub" }).props("groupSlug")).toEqual("family");
  });

  test("does not toast a shopping_blocked or week_committed publish error, since the shopping card shows it inline", async () => {
    toastAlert.open = false;
    publishShopping.mockResolvedValue({ data: null, error: { status: 409, code: "shopping_blocked", message: "blocked", kind: "conflict", details: null } });
    const wrapper = mountPage();

    await wrapper.findComponent({ name: "ShoppingCardStub" }).vm.$emit("publish");

    expect(toastAlert.open).toBe(false);
  });

  test("still toasts a publish error the shopping card doesn't handle inline", async () => {
    toastAlert.open = false;
    publishShopping.mockResolvedValue({ data: null, error: { status: 503, code: "mealie_unavailable", message: "Mealie is unavailable.", kind: "unreachable", details: null } });
    const wrapper = mountPage();

    await wrapper.findComponent({ name: "ShoppingCardStub" }).vm.$emit("publish");

    expect(toastAlert.open).toBe(true);
    expect(toastAlert.text).toEqual("Mealie is unavailable.");
  });

  test("the preview toast is unmistakably a preview, states nothing changed yet, and offers a Publish call to action", async () => {
    toastAlert.open = false;
    publishShopping.mockResolvedValue({ data: { counts: { created: 6, updated: 0, deleted: 0 } }, error: null });
    const wrapper = mountPage();

    await wrapper.findComponent({ name: "ShoppingCardStub" }).vm.$emit("preview");

    expect(toastAlert.color).toEqual("info");
    expect(toastAlert.text).toContain("Preview only");
    expect(toastAlert.text).toContain("add 6");
    expect(toastAlert.text).toContain("Nothing has been changed in Mealie yet.");
    expect(toastAlert.action?.message).toEqual("Publish");
    expect(typeof toastAlert.action?.onClick).toEqual("function");
  });

  test("a real publish refetches the week and shows the actual counts with a link to the list", async () => {
    toastAlert.open = false;
    publishShopping.mockResolvedValue({ data: { counts: { created: 6, updated: 1, deleted: 0 }, list_id: "list-42" }, error: null });
    const wrapper = mountPage();

    await wrapper.findComponent({ name: "ShoppingCardStub" }).vm.$emit("publish");
    await flushPromises();

    expect(weekLoad).toHaveBeenCalled();
    expect(toastAlert.color).toEqual("success");
    expect(toastAlert.text).toContain("6 added");
    expect(toastAlert.text).toContain("1 updated");
    expect(toastAlert.action?.message).toEqual("Open Shopping List");
  });
});
