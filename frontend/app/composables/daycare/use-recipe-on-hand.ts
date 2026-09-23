import { inventoryChanged } from "./use-recipe-daycare";
import { useUserApi } from "~/composables/api";

/**
 * Per-recipe servings on hand for the recipe-card badges. One shared `GET /inventory` serves every
 * card on the page (grouped by recipe_slug from `totals`) — cards never issue their own request.
 * Concurrent card mounts share one in-flight fetch, and the result is reused for `STALE_MS`, so
 * paging through a recipe list doesn't refetch; a lot change elsewhere (`inventoryChanged`) or a
 * later visit does. Failures (offline, forbidden, ...) leave no counts, so no badges render.
 */
const STALE_MS = 15_000;

const onHand = ref<Record<string, number>>({});
let fetchedAt = 0;
let seenRevision = -1;
let inflight: Promise<void> | null = null;
/** Whether the last inventory read succeeded — lets the servings-on-hand sort tell "offline" from "nothing on hand". */
let lastOk = true;

type FetchInventory = () => Promise<{ data: { totals: Record<string, { physical: number }> } | null }>;

async function ensureLoaded(fetchInventory: FetchInventory, force = false) {
  const fresh = !force && Date.now() - fetchedAt < STALE_MS && seenRevision === inventoryChanged.value.n;
  if (fresh) return;
  if (inflight) return await inflight;

  inflight = (async () => {
    try {
      const { data } = await fetchInventory();
      lastOk = data !== null;
      const next: Record<string, number> = {};
      for (const [slug, totals] of Object.entries(data?.totals ?? {})) {
        next[slug] = totals.physical;
      }
      onHand.value = next;
    }
    catch {
      lastOk = false;
      onHand.value = {};
    }
    finally {
      fetchedAt = Date.now();
      seenRevision = inventoryChanged.value.n;
      inflight = null;
    }
  })();
  return await inflight;
}

/** Test seam: forget the cached inventory. */
export function resetRecipeOnHandCache() {
  onHand.value = {};
  fetchedAt = 0;
  seenRevision = -1;
  inflight = null;
  lastOk = true;
}

/**
 * Servings on hand per recipe slug (only slugs with more than 0), or `null` when the sidecar could not be
 * read. Shares the badges' single in-flight request and cache; `force` skips the freshness window (a sort
 * change wants current numbers).
 */
export async function loadOnHandCounts(fetchInventory: FetchInventory, force = false): Promise<Record<string, number> | null> {
  await ensureLoaded(fetchInventory, force);
  if (!lastOk) return null;
  return Object.fromEntries(Object.entries(onHand.value).filter(([, physical]) => physical > 0));
}

/** `enabled` gates the request itself (e.g. signed-out visitors of public recipe lists never hit the sidecar). */
export function useRecipeOnHand(slug: () => string | null | undefined, enabled: () => boolean = () => true) {
  const api = useUserApi();
  onMounted(() => {
    if (enabled()) return ensureLoaded(() => api.daycare.getInventory());
  });
  return computed(() => {
    const key = slug();
    return key ? (onHand.value[key] ?? 0) : 0;
  });
}
