import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, test, vi } from "vitest";
import RecipeLastMade from "./RecipeLastMade.vue";
import RecipePageDaycarePanel from "./RecipePage/RecipePageParts/RecipePageDaycarePanel.vue";
import { DaycareAPI } from "~/lib/api/user/daycare";
import { toastAlert } from "~/composables/use-toast";
import { vuetifyStubs } from "~/tests/stub-vuetify";
import type { ApiRequestInstance } from "~/lib/api/types/non-generated";
import type { InventoryResponse, Lot } from "~/lib/api/types/daycare";

let requests: ApiRequestInstance;
const createTimelineEvent = vi.fn();
const updateLastMade = vi.fn();

vi.mock("~/composables/api", () => ({
  useUserApi: () => ({
    daycare: new DaycareAPI(requests),
    recipes: {
      createTimelineEvent: (...args: unknown[]) => createTimelineEvent(...args),
      updateLastMade: (...args: unknown[]) => updateLastMade(...args),
      updateTimelineEventImage: vi.fn(),
    },
    households: { getCurrentUserHouseholdRecipe: () => Promise.resolve({ data: { lastMade: null } }) },
  }),
}));
vi.mock("~/composables/use-households", () => ({
  useHouseholdSelf: () => ({ household: ref({ preferences: { firstDayOfWeek: 0 } }) }),
}));

const lot: Lot = {
  id: 42,
  recipe_slug: "chicken-barley-soup",
  portions_remaining: 6,
  made_date: "2026-01-05",
  use_by: null,
  storage: "freezer",
  notes: null,
  created_at: "2026-01-05T00:00:00Z",
  updated_at: "2026-01-05T00:00:00Z",
};

function inventory(physical: number): InventoryResponse {
  return {
    lots: [],
    totals: { "chicken-barley-soup": { physical, reserved: 0, free: physical } },
    summary: { lot_count: 1, physical, reserved: 0, free: physical },
  };
}

let physical: number;
let sidecarDown: boolean;
let lotCreateFails: boolean;

function makeRequests(): ApiRequestInstance {
  const sidecar = <T>(ok: () => T) => (sidecarDown
    ? Promise.resolve({ data: null, error: { response: { status: 503, data: {} } } })
    : Promise.resolve({ data: ok(), error: null }));
  return {
    get: vi.fn((url: string) => {
      if (url.endsWith("/inventory")) return sidecar(() => inventory(physical));
      // the panel's other reads: no record for this recipe is fine, the panel still renders
      return Promise.resolve({ data: null, error: { response: { status: 404, data: { error: { code: "recipe_not_found", message: "nope" } } } } });
    }),
    post: vi.fn((url: string) => {
      if (!url.endsWith("/inventory/lots")) return Promise.resolve({ data: null, error: null });
      if (lotCreateFails) return Promise.resolve({ data: null, error: { response: { status: 500, data: { error: { code: "internal_error", message: "sidecar exploded" } } } } });
      physical += 6;
      return Promise.resolve({ data: lot, error: null });
    }),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  } as unknown as ApiRequestInstance;
}

const BaseDialogStub = {
  props: ["modelValue", "title", "submitDisabled"],
  emits: ["submit", "update:modelValue"],
  template: "<div v-if=\"modelValue\" class=\"dialog\"><div class=\"title\">{{ title }}</div><slot /><button class=\"submit\" :disabled=\"submitDisabled\" @click=\"$emit('submit')\">submit</button></div>",
};

const global = {
  mocks: { $globals: { icons: {} } },
  stubs: {
    ...vuetifyStubs,
    VForm: { methods: { reset() {} }, template: "<form><slot /></form>" },
    VTooltip: { template: "<div><slot name=\"activator\" :props=\"{}\" /></div>" },
    BaseDialog: BaseDialogStub,
    AppButtonUpload: true,
    ImageCropper: true,
  },
};

const recipe = { id: "r1", slug: "chicken-barley-soup", name: "Chicken Barley Soup", recipeIngredient: [], lastMade: null };

async function openDialog(wrapper: ReturnType<typeof mountLastMade>) {
  await flushPromises();
  await wrapper.find("button").trigger("click"); // the native "Last made" / "I Made This" button
  await flushPromises();
}

function mountLastMade() {
  return mount(RecipeLastMade, { props: { recipe: recipe as never }, global });
}

describe("RecipeLastMade (native 'I Made This' dialog) inventory section", () => {
  beforeEach(() => {
    physical = 4;
    sidecarDown = false;
    lotCreateFails = false;
    requests = makeRequests();
    toastAlert.open = false;
    createTimelineEvent.mockReset().mockResolvedValue({ data: { id: "evt1" } });
    updateLastMade.mockReset().mockResolvedValue({});
    vi.stubGlobal("useMealieAuth", () => ({ user: ref({ fullName: "Sam", householdSlug: "home" }) }));
  });

  test("servings > 0 creates a lot after the timeline event, using the dialog's own (picked) date", async () => {
    const wrapper = mountLastMade();
    await openDialog(wrapper);

    await wrapper.find("input[type=\"number\"]").setValue("6");
    // Two date pickers render: the inventory section's use-by (first), then upstream's made date (second).
    const dateInputs = wrapper.findAll("input[type=\"date\"]");
    expect(dateInputs).toHaveLength(2);
    await dateInputs[0].setValue("2026-03-01");
    await dateInputs[1].setValue("2026-01-05");
    await wrapper.find(".submit").trigger("click");
    await flushPromises();

    expect(createTimelineEvent).toHaveBeenCalledTimes(1);
    expect(requests.post).toHaveBeenCalledWith(
      "/api/daycare/v1/inventory/lots",
      { recipe_slug: "chicken-barley-soup", portions: 6, made_date: "2026-01-05", use_by: "2026-03-01", storage: "freezer" },
      expect.objectContaining({ headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }) }),
    );
    expect(createTimelineEvent.mock.invocationCallOrder[0]).toBeLessThan((requests.post as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]);
    // upstream's toast survives; the overlay adds no success toast of its own
    expect(toastAlert.text).toEqual("Added to timeline");
  });

  test("blank servings makes no inventory call at all", async () => {
    const wrapper = mountLastMade();
    await openDialog(wrapper);

    await wrapper.find(".submit").trigger("click");
    await flushPromises();

    expect(createTimelineEvent).toHaveBeenCalledTimes(1);
    expect(requests.post).not.toHaveBeenCalled();
  });

  test("a sidecar failure keeps the timeline event and shows an inventory-not-added error", async () => {
    lotCreateFails = true;
    const wrapper = mountLastMade();
    await openDialog(wrapper);

    await wrapper.find("input[type=\"number\"]").setValue("6");
    await wrapper.find(".submit").trigger("click");
    await flushPromises();

    expect(createTimelineEvent).toHaveBeenCalledTimes(1);
    expect(toastAlert.color).toEqual("error");
    expect(toastAlert.text).toContain("inventory was not added");
    expect(toastAlert.text).toContain("Daycare panel");
  });

  test("an unreachable sidecar hides the inventory section and leaves the timeline flow untouched", async () => {
    sidecarDown = true;
    const wrapper = mountLastMade();
    await openDialog(wrapper);

    expect(wrapper.find("input[type=\"number\"]").exists()).toBe(false);
    await wrapper.find(".submit").trigger("click");
    await flushPromises();

    expect(createTimelineEvent).toHaveBeenCalledTimes(1);
    expect(requests.post).not.toHaveBeenCalled();
  });

  test("an invalid servings amount (0) blocks submit instead of silently skipping inventory", async () => {
    const wrapper = mountLastMade();
    await openDialog(wrapper);

    await wrapper.find("input[type=\"number\"]").setValue("0");
    expect(wrapper.find(".submit").attributes("disabled")).toBeDefined();
  });

  test("the Daycare panel's on-hand count updates without a reload after a lot is added here", async () => {
    const panel = mount(RecipePageDaycarePanel, { props: { slug: "chicken-barley-soup", groupSlug: "home" }, global });
    const wrapper = mountLastMade();
    await flushPromises();
    expect(panel.text()).toContain("4 on hand");

    await openDialog(wrapper);
    await wrapper.find("input[type=\"number\"]").setValue("6");
    await wrapper.find(".submit").trigger("click");
    await flushPromises();

    expect(panel.text()).toContain("10 on hand");
  });
});
