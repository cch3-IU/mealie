import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, test, vi } from "vitest";
import RecipeCardSection from "./RecipeCardSection.vue";
import { resetRecipeOnHandCache } from "~/composables/daycare/use-recipe-on-hand";
import { vuetifyStubs } from "~/tests/stub-vuetify";
import type { Recipe } from "~/lib/api/types/recipe";

// OVERLAY(daycare) tests for the servings-on-hand sort wiring in this upstream component.

const getAll = vi.fn();
const getInventory = vi.fn();
let ownGroup = true;

vi.mock("~/composables/api", () => ({ useUserApi: () => ({ recipes: { getAll }, daycare: { getInventory } }) }));
vi.mock("~/composables/api/api-client", () => ({ usePublicExploreApi: () => ({ explore: { recipes: { getAll } } }) }));
vi.mock("~/composables/use-logged-in-state", () => ({
  useLoggedInState: () => ({ isOwnGroup: computed(() => ownGroup) }), // a real ref, so the template unwraps it
}));

const PREFS_KEY = "recipe-section-preferences";
const SENTINEL = "servings_on_hand";
const intersect: { handler: (() => Promise<void>) | null } = { handler: null };

// 90 recipes, r0 newest. Mimics the two filters the sort emits.
const catalog = Array.from({ length: 90 }, (_, i) => ({ id: `id-${i}`, slug: `r${i}`, name: `Recipe ${i}`, createdAt: 1000 - i }));

function fakeGetAll(page: number, perPage: number, params: Record<string, string>) {
  const list = (keyword: string) => {
    const match = (params.queryFilter ?? "").match(new RegExp(`slug ${keyword} \\[([^\\]]*)\\]`));
    return match ? match[1].split(",").map(s => s.trim().replace(/"/g, "")) : null;
  };
  let rows = [...catalog];
  if (list("IN")) rows = rows.filter(r => list("IN")!.includes(r.slug));
  if (list("NOT IN")) rows = rows.filter(r => !list("NOT IN")!.includes(r.slug));
  rows.sort((a, b) => b.createdAt - a.createdAt);
  return Promise.resolve({ data: { items: rows.slice((page - 1) * perPage, page * perPage) }, error: null });
}

function inventory(counts: Record<string, number>) {
  const totals = Object.fromEntries(Object.entries(counts).map(([slug, physical]) => [slug, { physical, reserved: 0, free: physical }]));
  return Promise.resolve({ data: { lots: [], totals, summary: {} }, error: null });
}

async function mountSection(props: Record<string, unknown> = {}) {
  const wrapper = mount(RecipeCardSection, {
    props: { recipes: [], ...props, onReplaceRecipes: (r: Recipe[]) => wrapper.setProps({ recipes: r }), onAppendRecipes: (r: Recipe[]) => wrapper.setProps({ recipes: [...wrapper.props("recipes"), ...r] }) },
    global: {
      mocks: { $globals: { icons: {} }, $vuetify: { display: { xs: false } } },
      directives: { intersect: { mounted: (_el: unknown, binding: { value: () => Promise<void> }) => { intersect.handler = binding.value; } } },
      stubs: {
        ...vuetifyStubs,
        RecipeCard: { props: ["slug"], template: "<div class=\"recipe-card\" :data-slug=\"slug\" />" },
        RecipeCardMobile: { props: ["slug"], template: "<div class=\"recipe-card\" :data-slug=\"slug\" />" },
        VFadeTransition: { template: "<div><slot /></div>" },
        ContextMenu: true,
        AppLoader: true,
        AppScrollToTop: true,
      },
    },
  });
  await flushPromises();
  return wrapper;
}

const shown = (wrapper: Awaited<ReturnType<typeof mountSection>>) => wrapper.findAll(".recipe-card").map(c => c.attributes("data-slug"));
const menuLabels = (wrapper: Awaited<ReturnType<typeof mountSection>>) => wrapper.findAll(".v-list-item").map(i => i.text());

describe("RecipeCardSection — servings on hand sort (overlay)", () => {
  beforeEach(() => {
    ownGroup = true;
    resetRecipeOnHandCache();
    getAll.mockReset();
    getAll.mockImplementation(fakeGetAll);
    getInventory.mockReset();
    getInventory.mockReturnValue(inventory({ r40: 2, r70: 5, r3: 2 }));
    intersect.handler = null;
    localStorage.clear();
    localStorage.setItem(PREFS_KEY, JSON.stringify({ orderBy: SENTINEL, orderDirection: "desc", filterNull: false, sortIcon: "x", useMobileCards: false }));
    vi.stubGlobal("useNuxtApp", () => ({ $globals: { icons: {} } }));
    vi.stubGlobal("useMealieAuth", () => ({ user: ref({ groupSlug: "home" }) }));
    vi.stubGlobal("useRoute", () => ({ path: "/g/home", params: { groupSlug: "home" }, query: {} }));
    vi.stubGlobal("useRouter", () => ({ push: vi.fn() }));
    vi.stubGlobal("useDisplay", () => ({ smAndDown: ref(false) }));
    vi.stubGlobal("useScrollPosition", () => ({ savePosition: vi.fn(), getSavedPage: () => undefined, restorePosition: vi.fn() }));
  });

  test("a remembered servings-on-hand sort lists in-stock recipes first, then the default order, and never sends the sort key to Mealie", async () => {
    const wrapper = await mountSection();

    // r70 (5), then r3 and r40 tie at 2 → by name ("Recipe 3" < "Recipe 40"), then newest-first tail
    expect(shown(wrapper).slice(0, 6)).toEqual(["r70", "r3", "r40", "r0", "r1", "r2"]);
    expect(getAll.mock.calls.map(call => call[2].orderBy)).not.toContain(SENTINEL);
    expect(getAll.mock.calls.every(call => call[2].orderBy === "created_at")).toBe(true);
  });

  test("infinite scroll continues the tail without repeating the in-stock head", async () => {
    const wrapper = await mountSection();
    const firstLoad = shown(wrapper).length; // 3 in-stock + the first two tail pages (64)
    expect(firstLoad).toBe(67);

    await intersect.handler!();
    await flushPromises();

    const all = shown(wrapper);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(90);
    expect(getInventory).toHaveBeenCalledTimes(1);
  });

  test("sidecar offline: default order with a notice, no broken page", async () => {
    getInventory.mockReturnValue(Promise.resolve({ data: null, error: { response: { status: 503, data: {} } } }));
    const wrapper = await mountSection();

    expect(shown(wrapper).slice(0, 3)).toEqual(["r0", "r1", "r2"]);
    expect(wrapper.find("[data-testid='on-hand-sort-notice']").exists()).toBe(true);
    expect(getAll.mock.calls.every(call => call[2].orderBy === "created_at")).toBe(true);
  });

  test("no notice when the sidecar is fine", async () => {
    const wrapper = await mountSection();
    expect(wrapper.find("[data-testid='on-hand-sort-notice']").exists()).toBe(false);
  });

  test("the menu offers the sort, and picking it remembers the choice like other sorts", async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ orderBy: "name", orderDirection: "asc", filterNull: false, sortIcon: "x", useMobileCards: false }));
    const wrapper = await mountSection();
    expect(menuLabels(wrapper)).toContain("Servings on hand");
    expect(getAll.mock.calls[0][2].orderBy).toBe("name");

    const item = wrapper.findAll(".v-list-item").find(i => i.text() === "Servings on hand")!;
    await item.trigger("click");
    await flushPromises();

    expect(JSON.parse(localStorage.getItem(PREFS_KEY)!).orderBy).toBe(SENTINEL);
    expect(shown(wrapper).slice(0, 3)).toEqual(["r70", "r3", "r40"]);
  });

  test("outside the user's own group: no menu entry, and a remembered sentinel falls back to the default order silently", async () => {
    ownGroup = false;
    const wrapper = await mountSection();

    expect(menuLabels(wrapper)).not.toContain("Servings on hand");
    expect(shown(wrapper).slice(0, 3)).toEqual(["r0", "r1", "r2"]);
    expect(getInventory).not.toHaveBeenCalled();
    expect(wrapper.find("[data-testid='on-hand-sort-notice']").exists()).toBe(false);
    expect(getAll.mock.calls.map(call => call[2].orderBy)).not.toContain(SENTINEL);
  });

  test("an explorer-supplied query.orderBy carrying the sort is honored with the caller's filter kept", async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ orderBy: "name", orderDirection: "asc", filterNull: false, sortIcon: "x", useMobileCards: false }));
    await mountSection({ query: { orderBy: SENTINEL, orderDirection: "desc", queryFilter: "tags.slug = \"soup\"" } });

    const filters = getAll.mock.calls.map(call => call[2].queryFilter);
    expect(filters.some((f: string) => f.startsWith("(tags.slug = \"soup\") AND slug IN "))).toBe(true);
    expect(filters.some((f: string) => f.startsWith("(tags.slug = \"soup\") AND slug NOT IN "))).toBe(true);
    expect(getAll.mock.calls.map(call => call[2].orderBy)).not.toContain(SENTINEL);
  });
});
