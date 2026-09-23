import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  HEAD_BATCH_SIZE,
  MAX_HEAD_RECIPES,
  rankOnHandSlugs,
  sortByServingsOnHand,
  useServingsOnHandSort,
} from "../use-servings-on-hand-sort";
import { resetRecipeOnHandCache } from "../use-recipe-on-hand";
import type { Recipe } from "~/lib/api/types/recipe";

const getInventory = vi.fn();
let ownGroup = true;

vi.mock("~/composables/api", () => ({ useUserApi: () => ({ daycare: { getInventory: () => getInventory() } }) }));
vi.mock("~/composables/use-logged-in-state", () => ({
  useLoggedInState: () => ({ isOwnGroup: { get value() { return ownGroup; } } }),
}));

function inventory(counts: Record<string, number>) {
  const totals = Object.fromEntries(Object.entries(counts).map(([slug, physical]) => [slug, { physical, reserved: 0, free: physical }]));
  return Promise.resolve({ data: { lots: [], totals, summary: {} }, error: null });
}

const OFFLINE = { data: null, error: { response: { status: 503, data: {} } } };

function recipe(slug: string, name = slug, createdAt = 0): Recipe & { createdAt: number } {
  return { id: slug, slug, name, createdAt } as Recipe & { createdAt: number };
}

/** A tiny stand-in for Mealie's recipe endpoint: understands only the filters this sort emits. */
function fakeMealie(all: ReturnType<typeof recipe>[]) {
  const listOf = (filter: string, keyword: string) => {
    const match = filter.match(new RegExp(`slug ${keyword} \\[([^\\]]*)\\]`));
    return match ? match[1].split(",").map(s => s.trim().replace(/"/g, "")) : null;
  };
  return vi.fn(async (page: number, perPage: number, orderBy: string | null, orderDirection: string, _nulls: unknown, _query: unknown, queryFilter: string | null) => {
    let rows = [...all];
    const filter = queryFilter ?? "";
    const only = listOf(filter, "IN");
    const not = listOf(filter, "NOT IN");
    if (only) rows = rows.filter(r => only.includes(r.slug!));
    if (not) rows = rows.filter(r => !not.includes(r.slug!));
    expect(orderBy).toEqual("created_at");
    rows.sort((a, b) => (orderDirection === "desc" ? b.createdAt - a.createdAt : a.createdAt - b.createdAt));
    return rows.slice((page - 1) * perPage, page * perPage);
  });
}

const slugs = (recipes: Recipe[]) => recipes.map(r => r.slug);

describe("pure helpers", () => {
  test("rankOnHandSlugs: most servings first, zero/negative dropped, unsafe slugs dropped, capped", () => {
    expect(rankOnHandSlugs({ "a": 2, "b": 5, "c": 0, "d": 5, "bad slug": 9, "e\"x": 9 })).toEqual(["b", "d", "a"]);
    const many = Object.fromEntries(Array.from({ length: MAX_HEAD_RECIPES + 20 }, (_, i) => [`r${i}`, 1000 - i]));
    const ranked = rankOnHandSlugs(many);
    expect(ranked).toHaveLength(MAX_HEAD_RECIPES);
    expect(ranked[0]).toEqual("r0");
  });

  test("sortByServingsOnHand: count desc, then name asc (case-insensitive)", () => {
    const sorted = sortByServingsOnHand(
      [recipe("z", "Zucchini"), recipe("b", "banana"), recipe("a", "Apple"), recipe("m", "Mango")],
      { z: 3, b: 3, a: 3, m: 8 },
    );
    expect(sorted.map(r => r.name)).toEqual(["Mango", "Apple", "banana", "Zucchini"]);
  });
});

describe("useServingsOnHandSort", () => {
  const request = (page: number, perPage = 4) => ({ page, perPage, query: null, queryFilter: null });
  // created_at descending: r0 is newest
  const catalog = Array.from({ length: 12 }, (_, i) => recipe(`r${i}`, `Recipe ${String.fromCharCode(65 + i)}`, 100 - i));

  beforeEach(() => {
    resetRecipeOnHandCache();
    getInventory.mockReset();
    ownGroup = true;
  });

  test("in-stock recipes first (most servings, ties by name), then the rest in default order", async () => {
    getInventory.mockReturnValue(inventory({ r7: 3, r2: 9, r5: 3, r9: 0 }));
    const fetchMore = fakeMealie(catalog);
    const sort = useServingsOnHandSort();

    const first = await sort.fetchPage(fetchMore, request(1));

    // r2 (9) first; r5 and r7 tie at 3, so by name (Recipe F before Recipe H); then default (newest-first) order
    expect(slugs(first.recipes)).toEqual(["r2", "r5", "r7", "r0", "r1", "r3", "r4"]);
    expect(first.headCount).toBe(3);
    expect(sort.unavailable.value).toBe(false);
  });

  test("no recipe repeats across the head/tail boundary, including through later pages", async () => {
    getInventory.mockReturnValue(inventory({ r0: 1, r1: 4, r6: 2 }));
    const fetchMore = fakeMealie(catalog);
    const sort = useServingsOnHandSort();

    const pages = [
      await sort.fetchPage(fetchMore, request(1)),
      await sort.fetchPage(fetchMore, request(2)),
      await sort.fetchPage(fetchMore, request(3)),
    ];
    const all = pages.flatMap(p => slugs(p.recipes));

    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(catalog.length);
    expect(all.slice(0, 3)).toEqual(["r1", "r6", "r0"]);
    expect(pages.map(p => p.headCount)).toEqual([3, 0, 0]);
    // the tail never asks for a page beyond the ordinary page size
    expect(pages[0].recipes.length - pages[0].headCount).toBe(4);
  });

  test("the exclusion list is fixed when page 1 loads, even if inventory changes while scrolling", async () => {
    getInventory.mockReturnValue(inventory({ r1: 4 }));
    const fetchMore = fakeMealie(catalog);
    const sort = useServingsOnHandSort();

    const first = await sort.fetchPage(fetchMore, request(1));
    // a new lot appears mid-scroll
    getInventory.mockReturnValue(inventory({ r1: 4, r3: 2 }));
    const second = await sort.fetchPage(fetchMore, request(2));

    expect(getInventory).toHaveBeenCalledTimes(1);
    const all = [...first.recipes, ...second.recipes].map(r => r.slug);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toContain("r3"); // r3 was not excluded, so it is still reachable in the tail
  });

  test("active search/filters and the caller's queryFilter apply to both halves", async () => {
    getInventory.mockReturnValue(inventory({ r1: 4 }));
    const fetchMore = fakeMealie(catalog);
    const sort = useServingsOnHandSort();
    const query = { search: "soup" };

    await sort.fetchPage(fetchMore, { page: 1, perPage: 4, query, queryFilter: "tags.name = \"x\"" });

    const filters = fetchMore.mock.calls.map(call => call[6]);
    expect(filters).toContain("(tags.name = \"x\") AND slug IN [\"r1\"]");
    expect(filters).toContain("(tags.name = \"x\") AND slug NOT IN [\"r1\"]");
    expect(fetchMore.mock.calls.every(call => call[5] === query)).toBe(true);
  });

  test("a many-recipe head is fetched in batches, not one request per recipe", async () => {
    const count = HEAD_BATCH_SIZE + 5;
    const big = Array.from({ length: count }, (_, i) => recipe(`s${i}`, `S${String(i).padStart(3, "0")}`, i));
    getInventory.mockReturnValue(inventory(Object.fromEntries(big.map(r => [r.slug, 2]))));
    const fetchMore = fakeMealie(big);
    const sort = useServingsOnHandSort();

    const result = await sort.fetchPage(fetchMore, request(1));

    // 2 head batches + 1 tail request
    expect(fetchMore).toHaveBeenCalledTimes(3);
    expect(result.headCount).toBe(count);
    expect(slugs(result.recipes)).toEqual(big.map(r => r.slug)); // all tied → by name
  });

  test("in-stock slug with no matching recipe (deleted / filtered out) is skipped without breaking the list", async () => {
    getInventory.mockReturnValue(inventory({ ghost: 5, r4: 1 }));
    const sort = useServingsOnHandSort();

    const result = await sort.fetchPage(fakeMealie(catalog), request(1));

    expect(slugs(result.recipes).slice(0, 2)).toEqual(["r4", "r0"]);
    expect(result.headCount).toBe(1);
  });

  test("nothing on hand: plain default order, no notice, no exclusion filter", async () => {
    getInventory.mockReturnValue(inventory({}));
    const fetchMore = fakeMealie(catalog);
    const sort = useServingsOnHandSort();

    const result = await sort.fetchPage(fetchMore, request(1));

    expect(slugs(result.recipes)).toEqual(["r0", "r1", "r2", "r3"]);
    expect(result.headCount).toBe(0);
    expect(sort.unavailable.value).toBe(false);
    expect(fetchMore).toHaveBeenCalledTimes(1);
    expect(fetchMore.mock.calls[0][6]).toBeNull();
  });

  test("sidecar offline: default order, flagged unavailable, and it recovers on the next load", async () => {
    getInventory.mockReturnValue(Promise.resolve(OFFLINE));
    const fetchMore = fakeMealie(catalog);
    const sort = useServingsOnHandSort();

    const offline = await sort.fetchPage(fetchMore, request(1));
    expect(slugs(offline.recipes)).toEqual(["r0", "r1", "r2", "r3"]);
    expect(offline.headCount).toBe(0);
    expect(sort.unavailable.value).toBe(true);

    getInventory.mockReturnValue(inventory({ r5: 2 }));
    const back = await sort.fetchPage(fetchMore, request(1));
    expect(slugs(back.recipes)[0]).toBe("r5");
    expect(sort.unavailable.value).toBe(false);
  });

  test("sidecar request throwing is treated like offline", async () => {
    getInventory.mockReturnValue(Promise.reject(new Error("network down")));
    const sort = useServingsOnHandSort();

    const result = await sort.fetchPage(fakeMealie(catalog), request(1));

    expect(slugs(result.recipes)).toEqual(["r0", "r1", "r2", "r3"]);
    expect(sort.unavailable.value).toBe(true);
  });

  test("outside the user's own group the inventory is never read and the default order is used", async () => {
    ownGroup = false;
    const sort = useServingsOnHandSort();

    const result = await sort.fetchPage(fakeMealie(catalog), request(1));

    expect(getInventory).not.toHaveBeenCalled();
    expect(slugs(result.recipes)).toEqual(["r0", "r1", "r2", "r3"]);
    expect(sort.unavailable.value).toBe(false);
  });

  test("the sentinel sort key is never sent to Mealie as orderBy", async () => {
    getInventory.mockReturnValue(inventory({ r1: 4 }));
    const fetchMore = fakeMealie(catalog); // asserts orderBy === "created_at" on every call
    const sort = useServingsOnHandSort();

    await sort.fetchPage(fetchMore, request(1));
    await sort.fetchPage(fetchMore, request(2));

    expect(fetchMore.mock.calls.map(call => call[2])).not.toContain("servings_on_hand");
  });
});
