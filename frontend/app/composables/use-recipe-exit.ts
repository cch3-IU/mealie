import { computed, ref, type ComputedRef, type Ref } from "vue";
import type { RouteLocationNormalized, Router } from "vue-router";

// Matches a group's recipe list route (e.g. "/g/home"), the page whose URL carries the
// list's own search/filter state. Anything under it (e.g. "/g/home/r/some-recipe") is not a list.
const LIST_ROUTE_PATTERN = /^\/g\/[^/]+\/?$/;

function pathOf(fullPath: string): string {
  return fullPath.split("?")[0].split("#")[0];
}

function isRecipeListRoute(fullPath: string): boolean {
  return LIST_ROUTE_PATTERN.test(pathOf(fullPath));
}

// Module-scoped so the marker survives across recipe-to-recipe navigation within the same
// SPA session, not just the immediately preceding route.
const lastListRoute = ref<string | null>(null);
let trackingRegistered = false;

/**
 * Seeds the marker from the browser's own history state, which vue-router populates with the
 * previous entry's URL ("back") as soon as it pushes the current one - this covers the very
 * first recipe visited in a session, before our afterEach hook below has had a chance to run.
 */
function seedFromBrowserHistory() {
  if (typeof window === "undefined") {
    return;
  }
  const state = window.history.state as { back?: string | null } | null;
  const back = state?.back;
  if (back && isRecipeListRoute(back)) {
    lastListRoute.value = back;
  }
}

function ensureHistoryTracking(router: Router) {
  if (trackingRegistered) {
    return;
  }
  trackingRegistered = true;

  seedFromBrowserHistory();
  router.afterEach((to: RouteLocationNormalized) => {
    if (isRecipeListRoute(to.fullPath)) {
      lastListRoute.value = to.fullPath;
    }
  });
}

export interface UseRecipeExit {
  /** The last recipe-list route (with its query/filter state) visited this session, if any. */
  lastListRoute: Ref<string | null>;
  /** Where the recipe page's exit control should navigate to. */
  exitPath: ComputedRef<string>;
}

/**
 * Tracks the last recipe-list route visited during this session so a recipe page can offer a
 * one-tap way back to it, falling back to the group's Recipes page when there's no such entry
 * (e.g. a direct deep link). Deliberately avoids `document.referrer`, which is unset or wrong
 * for in-app client-side navigation.
 */
export function useRecipeExit(router: Router, groupSlug: Ref<string> | ComputedRef<string>): UseRecipeExit {
  ensureHistoryTracking(router);

  const exitPath = computed(() => lastListRoute.value ?? `/g/${groupSlug.value}`);

  return { lastListRoute, exitPath };
}
