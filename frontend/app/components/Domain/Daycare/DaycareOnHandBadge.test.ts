import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, test, vi } from "vitest";
import DaycareOnHandBadge from "./DaycareOnHandBadge.vue";
import { resetRecipeOnHandCache } from "~/composables/daycare/use-recipe-on-hand";
import { DaycareAPI } from "~/lib/api/user/daycare";
import type { ApiRequestInstance } from "~/lib/api/types/non-generated";

let requests: ApiRequestInstance;
let ownGroup = true;
vi.mock("~/composables/api", () => ({ useUserApi: () => ({ daycare: new DaycareAPI(requests) }) }));
vi.mock("~/composables/use-logged-in-state", () => ({ useLoggedInState: () => ({ isOwnGroup: { get value() { return ownGroup; } } }) }));

function totals(entries: Record<string, number>) {
  return Object.fromEntries(Object.entries(entries).map(([slug, physical]) => [slug, { physical, reserved: 0, free: physical }]));
}

function mountBadge(slug: string) {
  return mount(DaycareOnHandBadge, { props: { slug }, global: { mocks: {} } });
}

describe("DaycareOnHandBadge", () => {
  beforeEach(() => {
    resetRecipeOnHandCache();
    ownGroup = true;
    requests = {
      get: vi.fn(() => Promise.resolve({ data: { lots: [], totals: totals({ soup: 5, stew: 0 }), summary: {} }, error: null })),
    } as unknown as ApiRequestInstance;
  });

  test("shows the recipe's servings on hand, and nothing at 0 or for unknown recipes", async () => {
    const wrappers = [mountBadge("soup"), mountBadge("stew"), mountBadge("bread")];
    await flushPromises();
    expect(wrappers[0].find(".daycare-on-hand-badge").text()).toEqual("5");
    expect(wrappers[1].find(".daycare-on-hand-badge").exists()).toBe(false);
    expect(wrappers[2].find(".daycare-on-hand-badge").exists()).toBe(false);
  });

  test("many cards share a single inventory request", async () => {
    const wrappers = ["soup", "stew", "bread", "soup", "pie"].map(mountBadge);
    await flushPromises();
    expect(wrappers).toHaveLength(5);
    expect(requests.get).toHaveBeenCalledTimes(1);
  });

  test("no badges when the sidecar is offline", async () => {
    requests = { get: vi.fn(() => Promise.resolve({ data: null, error: { response: { status: 503, data: {} } } })) } as unknown as ApiRequestInstance;
    const wrapper = mountBadge("soup");
    await flushPromises();
    expect(wrapper.find(".daycare-on-hand-badge").exists()).toBe(false);
  });

  test("outside the user's own group nothing is fetched or shown", async () => {
    ownGroup = false;
    const wrapper = mountBadge("soup");
    await flushPromises();
    expect(requests.get).not.toHaveBeenCalled();
    expect(wrapper.find(".daycare-on-hand-badge").exists()).toBe(false);
  });
});
