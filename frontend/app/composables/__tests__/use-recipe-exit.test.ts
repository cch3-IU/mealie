import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { computed, ref } from "vue";

let useRecipeExit: typeof import("../use-recipe-exit").useRecipeExit;

function makeRouter() {
  const afterEachCallbacks: Array<(to: { fullPath: string }) => void> = [];
  return {
    afterEach: vi.fn((cb: (to: { fullPath: string }) => void) => {
      afterEachCallbacks.push(cb);
    }),
    navigateTo(fullPath: string) {
      afterEachCallbacks.forEach(cb => cb({ fullPath }));
    },
  };
}

function setHistoryState(back: string | null) {
  vi.stubGlobal("window", { history: { state: { back } } });
}

beforeEach(async () => {
  vi.resetModules();
  ({ useRecipeExit } = await import("../use-recipe-exit"));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useRecipeExit", () => {
  test("falls back to the group recipes page when there is no internal history entry", () => {
    setHistoryState(null);
    const router = makeRouter();
    const groupSlug = ref("home");

    const { exitPath } = useRecipeExit(router as any, groupSlug);

    expect(exitPath.value).toBe("/g/home");
  });

  test("returns the last visited list route, query and all, when present in history", () => {
    setHistoryState("/g/home?search=chili&category=soups");
    const router = makeRouter();
    const groupSlug = ref("home");

    const { exitPath } = useRecipeExit(router as any, groupSlug);

    expect(exitPath.value).toBe("/g/home?search=chili&category=soups");
  });

  test("ignores a non-list back entry (e.g. another recipe) and falls back", () => {
    setHistoryState("/g/home/r/some-other-recipe");
    const router = makeRouter();
    const groupSlug = ref("home");

    const { exitPath } = useRecipeExit(router as any, groupSlug);

    expect(exitPath.value).toBe("/g/home");
  });

  test("updates the marker as the router visits new list routes during the session", () => {
    setHistoryState(null);
    const router = makeRouter();
    const groupSlug = ref("home");

    const { exitPath } = useRecipeExit(router as any, groupSlug);
    expect(exitPath.value).toBe("/g/home");

    router.navigateTo("/g/home?category=desserts");
    expect(exitPath.value).toBe("/g/home?category=desserts");

    // Navigating to a non-list route (e.g. a recipe) must not clobber the marker.
    router.navigateTo("/g/home/r/some-recipe");
    expect(exitPath.value).toBe("/g/home?category=desserts");
  });

  test("reacts to a changing groupSlug when there is no history entry to prefer", () => {
    setHistoryState(null);
    const router = makeRouter();
    const groupSlug = ref("home");

    const { exitPath } = useRecipeExit(router as any, groupSlug);
    expect(exitPath.value).toBe("/g/home");

    groupSlug.value = "other-household";
    expect(exitPath.value).toBe("/g/other-household");
  });

  test("registers the browser-history listener only once across multiple calls", () => {
    setHistoryState(null);
    const router = makeRouter();

    useRecipeExit(router as any, computed(() => "home"));
    useRecipeExit(router as any, computed(() => "home"));

    expect(router.afterEach).toHaveBeenCalledTimes(1);
  });
});
