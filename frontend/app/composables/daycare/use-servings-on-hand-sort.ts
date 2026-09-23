import { loadOnHandCounts } from "./use-recipe-on-hand";
import { useUserApi } from "~/composables/api";
import { useLoggedInState } from "~/composables/use-logged-in-state";
import type { OrderByNullPosition, Recipe } from "~/lib/api/types/recipe";
import type { RecipeSearchQuery } from "~/lib/api/user/recipes/recipe";

/**
 * "Servings on hand" sort for recipe lists. Inventory lives in the sidecar, not in Mealie's DB, so
 * upstream `orderBy` cannot express it. Instead, a sorted list is built from two ordinary Mealie queries:
 *
 *  1. HEAD (first page only): the recipes with servings on hand — slugs from the one shared
 *     `GET /inventory` — fetched in batches (`slug IN [...]`, honoring the active search/filters) and
 *     ordered by servings descending, then name.
 *  2. TAIL: the normal paginated default-order list (`created_at desc`), excluding every in-stock slug
 *     (`slug NOT IN [...]`), so nothing repeats across the head/tail boundary and infinite scroll just
 *     keeps paging the tail.
 *
 * The in-stock slug set is snapshotted when page 1 is (re)loaded and reused for later pages, so a lot change
 * mid-scroll can't shift the exclusion list and duplicate or drop recipes at the boundary.
 *
 * The sentinel `SERVINGS_ON_HAND_SORT` is a UI-only sort key (persisted like any other sort choice in
 * `recipe-section-preferences`); it is never sent to Mealie's API — the tail always asks for `created_at`.
 */
export const SERVINGS_ON_HAND_SORT = "servings_on_hand";

const DEFAULT_ORDER_BY = "created_at";
const DEFAULT_ORDER_DIRECTION = "desc";
const DEFAULT_NULL_POSITION: OrderByNullPosition = "last";

/** Slugs per `slug IN [...]` request — keeps the GET URL short. */
export const HEAD_BATCH_SIZE = 40;
/** In-stock recipes beyond this many (highest counts kept) fall into the normal order, keeping the exclusion filter's URL bounded. */
export const MAX_HEAD_RECIPES = 100;

type FetchMore = (
  page: number,
  perPage: number,
  orderBy: string | null,
  orderDirection: string,
  orderByNullPosition: OrderByNullPosition | null,
  query: RecipeSearchQuery | null,
  queryFilter: string | null,
) => Promise<Recipe[]>;

export interface ServingsOnHandPageRequest {
  page: number;
  perPage: number;
  query: RecipeSearchQuery | null;
  queryFilter: string | null;
}

export interface ServingsOnHandPage {
  recipes: Recipe[];
  /** How many leading `recipes` are the in-stock head (0 for every page after the first). */
  headCount: number;
}

/** In-stock slugs, most servings first (ties by slug — only decides which recipes survive the cap). */
export function rankOnHandSlugs(counts: Record<string, number>): string[] {
  return Object.entries(counts)
    .filter(([slug, servings]) => servings > 0 && /^[\w-]+$/.test(slug))
    .sort(([slugA, a], [slugB, b]) => b - a || slugA.localeCompare(slugB))
    .slice(0, MAX_HEAD_RECIPES)
    .map(([slug]) => slug);
}

/** Servings descending, then name ascending. */
export function sortByServingsOnHand(recipes: Recipe[], counts: Record<string, number>): Recipe[] {
  return [...recipes].sort((a, b) =>
    (counts[b.slug ?? ""] ?? 0) - (counts[a.slug ?? ""] ?? 0)
    || (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" }),
  );
}

function slugList(slugs: string[]) {
  return `[${slugs.map(slug => `"${slug}"`).join(", ")}]`;
}

function withFilter(queryFilter: string | null, extra: string) {
  return queryFilter ? `(${queryFilter}) AND ${extra}` : extra;
}

export function useServingsOnHandSort() {
  const api = useUserApi();
  const { isOwnGroup } = useLoggedInState();

  /** True while the last page-1 load could not read the sidecar (list fell back to the default order). */
  const unavailable = ref(false);

  let counts: Record<string, number> = {};
  let excluded: string[] = [];

  async function fetchHead(fetchMore: FetchMore, slugs: string[], request: ServingsOnHandPageRequest) {
    const batches: string[][] = [];
    for (let i = 0; i < slugs.length; i += HEAD_BATCH_SIZE) {
      batches.push(slugs.slice(i, i + HEAD_BATCH_SIZE));
    }
    const results = await Promise.all(batches.map(batch => fetchMore(
      1,
      batch.length,
      DEFAULT_ORDER_BY,
      DEFAULT_ORDER_DIRECTION,
      DEFAULT_NULL_POSITION,
      request.query,
      withFilter(request.queryFilter, `slug IN ${slugList(batch)}`),
    )));
    return sortByServingsOnHand(results.flat(), counts);
  }

  async function fetchPage(fetchMore: FetchMore, request: ServingsOnHandPageRequest): Promise<ServingsOnHandPage> {
    // Outside the user's own group there is no inventory to sort by — plain default order.
    const enabled = isOwnGroup.value;

    if (request.page === 1) {
      const loaded = enabled ? await loadOnHandCounts(() => api.daycare.getInventory(), true) : {};
      unavailable.value = loaded === null;
      counts = loaded ?? {};
      excluded = rankOnHandSlugs(counts);
    }

    const head = request.page === 1 && excluded.length ? await fetchHead(fetchMore, excluded, request) : [];

    const tail = await fetchMore(
      request.page,
      request.perPage,
      DEFAULT_ORDER_BY,
      DEFAULT_ORDER_DIRECTION,
      DEFAULT_NULL_POSITION,
      request.query,
      excluded.length ? withFilter(request.queryFilter, `slug NOT IN ${slugList(excluded)}`) : request.queryFilter,
    );

    // Backstop: the exclusion filter should already keep the two halves disjoint.
    const seen = new Set(head.map(recipe => recipe.slug));
    return { recipes: [...head, ...tail.filter(recipe => !seen.has(recipe.slug))], headCount: head.length };
  }

  return { unavailable, fetchPage };
}
