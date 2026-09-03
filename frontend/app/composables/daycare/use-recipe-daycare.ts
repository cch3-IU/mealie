import { useUserApi } from "~/composables/api";
import { mapDaycareError, type DaycareUiError } from "./use-daycare";
import type {
  InventoryResponse,
  PlanDay,
  ProcessingState,
  ProcessingStatus,
  RecipeDaycare,
  RecipeDaycareUpdate,
  Role,
  Slot,
  Weekday,
  WeekResponse,
} from "~/lib/api/types/daycare";

const WEEKDAY_ORDER: Weekday[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const JS_DAY_TO_WEEKDAY: Weekday[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_SLOTS = ["breakfast", "lunch", "snack_am", "snack_pm"] as const;

function todayString(from: Date = new Date()): string {
  const today = new Date(from);
  today.setHours(0, 0, 0, 0);
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * The most recent occurrence of `weekStartWeekday` on or before `from` (today counts), as
 * YYYY-MM-DD. Mirrors `nextWeekStart` in `use-daycare.ts` but for the currently active week
 * rather than the upcoming one — kept separate rather than derived from it (e.g. "next minus 7
 * days") to avoid re-parsing an ISO date string, which JS treats as UTC and can land on the
 * wrong local day.
 */
export function currentWeekStart(weekStartWeekday: Weekday = "monday", from: Date = new Date()): string {
  const today = new Date(from);
  today.setHours(0, 0, 0, 0);

  const todayIdx = WEEKDAY_ORDER.indexOf(JS_DAY_TO_WEEKDAY[today.getDay()]);
  const targetIdx = WEEKDAY_ORDER.indexOf(weekStartWeekday);

  const diff = (todayIdx - targetIdx + 7) % 7;

  const start = new Date(today);
  start.setDate(today.getDate() - diff);

  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, "0");
  const d = String(start.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export interface NextPlannedUse {
  date: string;
  day: string;
  slot: typeof DAY_SLOTS[number];
  role: string;
}

/** The earliest day (today or later) and slot in `plan` where `slug` is planned. */
export function findNextPlannedUse(plan: { days: PlanDay[] } | null | undefined, slug: string, today: string = todayString()): NextPlannedUse | null {
  if (!plan) return null;
  for (const day of plan.days) {
    if (day.date < today) continue;
    for (const slotKey of DAY_SLOTS) {
      const recipe = day[slotKey]?.recipe;
      if (recipe?.slug === slug) {
        return { date: day.date, day: day.day, slot: slotKey, role: recipe.role };
      }
    }
  }
  return null;
}

export interface ProcessingNote {
  /** The most recent processing run's outcome for this recipe, if the sidecar has one on record. */
  state: ProcessingState | null;
  lastError: string | null;
  /** True when this recipe is batchable and enabled but has no daycare portions per batch set, so it can't actually be produced. */
  lackingYield: boolean;
}

/** Derives this recipe's processing/classification status from the sidecar's household-wide processing report. */
export function deriveProcessingNote(processing: ProcessingStatus | null | undefined, slug: string): ProcessingNote | null {
  if (!processing) return null;
  const item = processing.processing.recent.find(i => i.slug === slug);
  const lackingYield = processing.recipes_lacking_daycare_yield.includes(slug);
  if (!item && !lackingYield) return null;
  return {
    state: item?.state ?? null,
    lastError: item?.last_error ?? null,
    lackingYield,
  };
}

/** Per-slot roles this recipe is used with, as edited in the panel's form. */
export type SlotRoles = Partial<Record<Slot, Role[]>>;

/** Converts the effective `classification.uses` array into a per-slot roles map for a form. */
export function usesToSlotRoles(uses: { slot: Slot; roles: Role[] }[] | undefined): SlotRoles {
  const result: SlotRoles = {};
  for (const use of uses ?? []) {
    result[use.slot] = use.roles;
  }
  return result;
}

/** Converts a form's per-slot roles map back into the update payload's slot -> roles-or-null shape. */
export function slotRolesToUsesPatch(slotRoles: SlotRoles): Partial<Record<Slot, Role[] | null>> {
  const slots: Slot[] = ["breakfast", "lunch", "snack"];
  const patch: Partial<Record<Slot, Role[] | null>> = {};
  for (const slot of slots) {
    const roles = slotRoles[slot];
    patch[slot] = roles && roles.length > 0 ? roles : null;
  }
  return patch;
}

interface Resource<T> {
  data: Ref<T | null>;
  loading: Ref<boolean>;
  error: Ref<DaycareUiError | null>;
  empty: Ref<boolean>;
}

function emptyResource<T>(): Resource<T> {
  return {
    data: ref(null) as Ref<T | null>,
    loading: ref(false),
    error: ref(null),
    empty: ref(false),
  };
}

async function fill<T>(resource: Resource<T>, fetcher: () => Promise<{ data: T | null; error: unknown }>, emptyOnStatus: number[] = []) {
  resource.loading.value = true;
  resource.empty.value = false;
  const result = await fetcher();
  if (result.data) {
    resource.data.value = result.data;
    resource.error.value = null;
  }
  else {
    resource.data.value = null;
    const mapped = mapDaycareError(result.error);
    if (mapped.status != null && emptyOnStatus.includes(mapped.status)) {
      resource.empty.value = true;
      resource.error.value = null;
    }
    else {
      resource.error.value = mapped;
    }
  }
  resource.loading.value = false;
}

/**
 * Compact, recipe-scoped daycare data for the recipe page panel. Deliberately does not reuse
 * `useDaycare()` (the dashboard composable) — that loads the whole household's status, settings,
 * week, prep, shopping, inventory, reservations, and processing on every recipe page view. This
 * only fetches what the panel shows: the recipe's own daycare record, current prepared inventory
 * for it, and (best-effort, skipped on failure) the current week's plan for "next planned use".
 */
export function useRecipeDaycare(slug: Ref<string> | string) {
  const api = useUserApi();
  const slugValue = () => (typeof slug === "string" ? slug : slug.value);

  const recipeDaycare = emptyResource<RecipeDaycare>();
  const inventory = emptyResource<InventoryResponse>();
  const week = emptyResource<WeekResponse>();
  const processing = emptyResource<ProcessingStatus>();

  /** True once the sidecar has told us this user is not in the daycare household — the panel must render nothing. */
  const forbidden = ref(false);
  const mutating = ref(false);

  const preparedPortions = computed(() => inventory.data.value?.totals[slugValue()] ?? null);
  const nextPlannedUse = computed(() => findNextPlannedUse(week.data.value?.plan, slugValue()));
  const processingNote = computed(() => deriveProcessingNote(processing.data.value, slugValue()));

  async function load() {
    forbidden.value = false;
    await fill(recipeDaycare, () => api.daycare.getRecipeDaycare(slugValue()), [404]);

    const kind = recipeDaycare.error.value?.kind;
    if (kind === "forbidden" || kind === "unauthorized") {
      forbidden.value = true;
      return;
    }
    if (kind) {
      // Unreachable/offline/server/unknown — surfaced via recipeDaycare.error; skip the rest.
      return;
    }

    const settingsResult = await api.daycare.getSettings();
    await Promise.all([
      fill(inventory, () => api.daycare.getInventory()),
      fill(processing, () => api.daycare.getProcessingStatus()),
      settingsResult.data
        ? fill(week, () => api.daycare.getWeek(currentWeekStart(settingsResult.data!.week_start_weekday)), [404])
        : Promise.resolve(),
    ]);
  }

  async function updateRecipeDaycare(payload: RecipeDaycareUpdate) {
    mutating.value = true;
    try {
      const result = await api.daycare.updateRecipeDaycare(slugValue(), payload);
      if (result.data) {
        recipeDaycare.data.value = result.data;
        recipeDaycare.error.value = null;
        return { data: result.data, error: null as DaycareUiError | null };
      }
      const mapped = mapDaycareError(result.error);
      return { data: null, error: mapped };
    }
    finally {
      mutating.value = false;
    }
  }

  return {
    recipeDaycare,
    inventory,
    week,
    processing,
    forbidden,
    mutating,
    preparedPortions,
    nextPlannedUse,
    processingNote,
    load,
    updateRecipeDaycare,
  };
}
