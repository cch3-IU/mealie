import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, test, vi } from "vitest";
import DaycareRecipeInventoryCounter from "./DaycareRecipeInventoryCounter.vue";
import { DaycareAPI } from "~/lib/api/user/daycare";
import { pickLotToAdd, pickLotToConsume } from "~/composables/daycare/use-recipe-daycare";
import { toastAlert } from "~/composables/use-toast";
import { vuetifyStubs } from "~/tests/stub-vuetify";
import type { ApiRequestInstance } from "~/lib/api/types/non-generated";
import type { InventoryResponse, Lot } from "~/lib/api/types/daycare";

let requests: ApiRequestInstance;
vi.mock("~/composables/api", () => ({ useUserApi: () => ({ daycare: new DaycareAPI(requests) }) }));

const SLUG = "chicken-barley-soup";

function lot(id: number, overrides: Partial<Lot> = {}): Lot {
  return {
    id, recipe_slug: SLUG, portions_remaining: 2, made_date: "2026-01-01", use_by: null, storage: "freezer",
    notes: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", ...overrides,
  };
}

function inventoryOf(lots: Lot[]): InventoryResponse {
  const physical = lots.reduce((n, l) => n + l.portions_remaining, 0);
  return { lots, totals: physical ? { [SLUG]: { physical, reserved: 0, free: physical } } : {}, summary: { lot_count: lots.length, physical, reserved: 0, free: physical } };
}

let lots: Lot[];
let offline: boolean;

function makeRequests(): ApiRequestInstance {
  return {
    get: vi.fn(() => Promise.resolve(offline ? { data: null, error: { response: { status: 503, data: {} } } } : { data: inventoryOf(lots), error: null })),
    post: vi.fn((url: string) => {
      const target = lots.find(l => url.includes(`/lots/${l.id}/consume`))!;
      target.portions_remaining -= 1;
      return Promise.resolve({ data: { lot_id: target.id, recipe_slug: SLUG, portions: 1, portions_remaining: target.portions_remaining, lot: target }, error: null });
    }),
    patch: vi.fn((url: string, body: { portions_remaining: number }) => {
      const target = lots.find(l => url.endsWith(`/lots/${l.id}`))!;
      target.portions_remaining = body.portions_remaining;
      return Promise.resolve({ data: target, error: null });
    }),
    put: vi.fn(),
    delete: vi.fn(),
  } as unknown as ApiRequestInstance;
}

const BaseDialogStub = {
  props: ["modelValue"],
  emits: ["confirm", "update:modelValue"],
  template: "<div v-if=\"modelValue\" class=\"dialog\"><slot /><button class=\"confirm\" @click=\"$emit('confirm')\">confirm</button></div>",
};

function mountCounter() {
  return mount(DaycareRecipeInventoryCounter, {
    props: { slug: SLUG },
    global: { mocks: { $globals: { icons: {} } }, stubs: { ...vuetifyStubs, BaseDialog: BaseDialogStub } },
  });
}

const button = (w: ReturnType<typeof mountCounter>, label: string) => w.findAll("button").find(b => b.attributes("aria-label") === label)!;

describe("lot selection", () => {
  test("consume prefers the soonest use-by, then the oldest made date; skips empty lots and other recipes", () => {
    const picked = pickLotToConsume([
      lot(1, { use_by: null, made_date: "2026-01-01" }),
      lot(2, { use_by: "2026-03-01" }),
      lot(3, { use_by: "2026-02-01", portions_remaining: 0 }),
      lot(4, { use_by: "2026-02-15", made_date: "2026-01-09" }),
      lot(5, { use_by: "2026-02-15", made_date: "2026-01-02" }),
      lot(6, { recipe_slug: "other", use_by: "2025-01-01" }),
    ], SLUG);
    expect(picked?.id).toEqual(5);
  });

  test("add goes to the most recently made lot", () => {
    expect(pickLotToAdd([lot(1, { made_date: "2026-01-01" }), lot(2, { made_date: "2026-01-09" }), lot(3, { made_date: "2026-01-05" })], SLUG)?.id).toEqual(2);
  });
});

describe("DaycareRecipeInventoryCounter", () => {
  beforeEach(() => {
    offline = false;
    lots = [lot(1, { use_by: "2026-03-01", portions_remaining: 3 }), lot(2, { use_by: "2026-02-01", portions_remaining: 2, made_date: "2026-01-05" })];
    requests = makeRequests();
    toastAlert.open = false;
  });

  test("shows the recipe's total across all lots", async () => {
    const wrapper = mountCounter();
    await flushPromises();
    expect(wrapper.find(".daycare-inventory-counter__count").text()).toEqual("5");
  });

  test("is hidden when nothing is on hand", async () => {
    lots = [];
    const wrapper = mountCounter();
    await flushPromises();
    expect(wrapper.find(".daycare-inventory-counter").exists()).toBe(false);
  });

  test("is hidden when the sidecar is offline", async () => {
    offline = true;
    const wrapper = mountCounter();
    await flushPromises();
    expect(wrapper.find(".daycare-inventory-counter").exists()).toBe(false);
  });

  test("- consumes one from the soonest use-by lot with release_reservations and updates in place", async () => {
    const wrapper = mountCounter();
    await flushPromises();
    await button(wrapper, "Remove one serving").trigger("click");
    await flushPromises();

    expect(requests.post).toHaveBeenCalledWith("/api/daycare/v1/inventory/lots/2/consume", { portions: 1, release_reservations: true }, expect.anything());
    expect(wrapper.find(".daycare-inventory-counter__count").text()).toEqual("4");
  });

  test("+ adds one to the most recently made lot and updates in place", async () => {
    const wrapper = mountCounter();
    await flushPromises();
    await button(wrapper, "Add one serving").trigger("click");
    await flushPromises();

    expect(requests.patch).toHaveBeenCalledWith("/api/daycare/v1/inventory/lots/2", { portions_remaining: 3 }, expect.anything());
    expect(wrapper.find(".daycare-inventory-counter__count").text()).toEqual("6");
  });

  test("- on the recipe's last serving asks for confirmation before consuming", async () => {
    lots = [lot(1, { portions_remaining: 1 })];
    const wrapper = mountCounter();
    await flushPromises();
    await button(wrapper, "Remove one serving").trigger("click");
    await flushPromises();

    expect(requests.post).not.toHaveBeenCalled();
    await wrapper.find(".confirm").trigger("click");
    await flushPromises();
    expect(requests.post).toHaveBeenCalledTimes(1);
    expect(wrapper.find(".daycare-inventory-counter").exists()).toBe(false);
  });

  test("a failed take-off shows the sidecar's error and leaves the count alone", async () => {
    const wrapper = mountCounter();
    await flushPromises();
    (requests.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: null, error: { response: { status: 409, data: { error: { code: "lot_reserved", message: "Reserved for planned weeks" } } } } });
    await button(wrapper, "Remove one serving").trigger("click");
    await flushPromises();

    expect(toastAlert.text).toEqual("Reserved for planned weeks");
    expect(wrapper.find(".daycare-inventory-counter__count").text()).toEqual("5");
  });
});
