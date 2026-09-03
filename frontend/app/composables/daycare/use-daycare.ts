import { useUserApi } from "~/composables/api";
import { useMealieAuth } from "~/composables/use-mealie-auth";
import type {
  CompleteRequest,
  PlannerSettingsUpdate,
  PollRequest,
  PublishRequest,
  RecipeDaycareUpdate,
  SimpleFoodUpdate,
  Weekday,
} from "~/lib/api/types/daycare";

export type DaycareErrorKind
  = | "unauthorized"
    | "forbidden"
    | "not-found"
    | "conflict"
    | "validation"
    | "unreachable"
    | "offline"
    | "server"
    | "unknown";

export interface DaycareUiError {
  status: number | null;
  code: string | null;
  /** The sidecar's own message, when it sent one. Null for network failures and 401s the axios interceptor will handle. */
  message: string | null;
  kind: DaycareErrorKind;
  /** The sidecar error envelope's `details` object — e.g. per-field validation issues on a 422. */
  details: Record<string, unknown> | null;
}

/**
 * Maps the sidecar's {error:{code,message,details}} envelope (or a network failure) to a UI-friendly
 * shape. Never returns display copy directly — components render `error.message` when present, else a
 * translated fallback keyed by `error.kind` (see `daycare.errors.*` in en-US.json), so all user-facing
 * text stays in one place.
 */
export function mapDaycareError(error: unknown): DaycareUiError {
  const axiosError = error as { response?: { status: number; data?: { error?: { code: string; message: string; details?: Record<string, unknown> } } } } | null | undefined;

  if (!axiosError || !axiosError.response) {
    return { status: null, code: null, message: null, kind: "offline", details: null };
  }

  const status = axiosError.response.status;
  const detail = axiosError.response.data?.error;

  const kind: DaycareErrorKind
    = status === 401
      ? "unauthorized"
      : status === 403
        ? "forbidden"
        : status === 404
          ? "not-found"
          : status === 409
            ? "conflict"
            : status === 422
              ? "validation"
              : status === 502 || status === 503
                ? "unreachable"
                : status >= 500
                  ? "server"
                  : "unknown";

  return { status, code: detail?.code ?? null, message: detail?.message ?? null, kind, details: detail?.details ?? null };
}

const WEEKDAY_ORDER: Weekday[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const JS_DAY_TO_WEEKDAY: Weekday[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** The next upcoming week that starts on `weekStartWeekday`, as YYYY-MM-DD (never today). */
export function nextWeekStart(weekStartWeekday: Weekday = "monday", from: Date = new Date()): string {
  const today = new Date(from);
  today.setHours(0, 0, 0, 0);

  const todayIdx = WEEKDAY_ORDER.indexOf(JS_DAY_TO_WEEKDAY[today.getDay()]);
  const targetIdx = WEEKDAY_ORDER.indexOf(weekStartWeekday);

  let diff = (targetIdx - todayIdx + 7) % 7;
  if (diff === 0) diff = 7;

  const next = new Date(today);
  next.setDate(today.getDate() + diff);

  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, "0");
  const d = String(next.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

interface ResourceOptions {
  /** HTTP statuses that mean "nothing here yet" rather than a failure — e.g. a week with no stored plan. */
  emptyOnStatus?: number[];
}

interface Resource<T> {
  data: Ref<T | null>;
  loading: Ref<boolean>;
  error: Ref<DaycareUiError | null>;
  /** True when the sidecar affirmatively reported "nothing here yet" (e.g. 404 on an unplanned week). */
  empty: Ref<boolean>;
  load: () => Promise<void>;
}

function useResource<T>(fetcher: () => Promise<{ data: T | null; error: unknown }>, options: ResourceOptions = {}): Resource<T> {
  const data = ref<T | null>(null) as Ref<T | null>;
  const loading = ref(false);
  const error = ref<DaycareUiError | null>(null);
  const empty = ref(false);

  async function load() {
    loading.value = true;
    empty.value = false;
    const result = await fetcher();
    if (result.data) {
      data.value = result.data;
      error.value = null;
    }
    else {
      data.value = null;
      const mapped = mapDaycareError(result.error);
      if (mapped.status != null && options.emptyOnStatus?.includes(mapped.status)) {
        empty.value = true;
        error.value = null;
      }
      else {
        error.value = mapped;
      }
    }
    loading.value = false;
  }

  return { data, loading, error, empty, load };
}

export interface UseDaycareOptions {
  /** Initial week (YYYY-MM-DD). Defaults to the next daycare week starting Monday, refined once settings load. */
  week?: string;
}

/**
 * Central Daycare data/actions composable. Every resource is request-then-refetch:
 * mutations never optimistically update local state, they re-fetch from the sidecar afterwards.
 * Fetching is entirely explicit (via `refresh()`/`setSelectedWeek()`) — nothing auto-loads on
 * creation or via watchers, so callers control exactly when network requests happen.
 */
export function useDaycare(options: UseDaycareOptions = {}) {
  const api = useUserApi();
  const auth = useMealieAuth();

  const isAdmin = computed(() => !!auth.user.value?.admin);
  const canView = computed(() => !!auth.user.value);

  const isOffline = ref(typeof navigator !== "undefined" ? !navigator.onLine : false);
  function handleOnline() { isOffline.value = false; }
  function handleOffline() { isOffline.value = true; }
  if (typeof window !== "undefined") {
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    if (getCurrentInstance()) {
      onUnmounted(() => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      });
    }
  }

  let weekAutoSelected = !options.week;
  const selectedWeek = ref(options.week ?? nextWeekStart());

  const status = useResource(() => api.daycare.getStatus());
  const settings = useResource(() => api.daycare.getSettings());
  const week = useResource(() => api.daycare.getWeek(selectedWeek.value), { emptyOnStatus: [404] });
  const prep = useResource(() => api.daycare.getPrep(selectedWeek.value), { emptyOnStatus: [404] });
  const shopping = useResource(() => api.daycare.getShopping(selectedWeek.value), { emptyOnStatus: [404] });
  const inventory = useResource(() => api.daycare.getInventory());
  const reservations = useResource(() => api.daycare.getReservations());
  const processing = useResource(() => api.daycare.getProcessingStatus());

  async function refreshWeekScoped() {
    await Promise.all([week.load(), prep.load(), shopping.load()]);
  }

  /** Changes the viewed week and immediately refetches its scoped resources. */
  async function setSelectedWeek(newWeek: string) {
    weekAutoSelected = false;
    if (selectedWeek.value === newWeek) return;
    selectedWeek.value = newWeek;
    mutating.value = true;
    try {
      await refreshWeekScoped();
    }
    finally {
      mutating.value = false;
    }
  }

  /**
   * Loads settings first so the auto-selected week can be derived from `week_start_weekday`
   * before the week-scoped resources fetch — avoids fetching once for the guessed Monday
   * default and again for the real configured week-start day.
   */
  async function refresh() {
    await settings.load();
    if (weekAutoSelected && settings.data.value) {
      selectedWeek.value = nextWeekStart(settings.data.value.week_start_weekday);
    }
    await Promise.all([
      status.load(),
      week.load(),
      prep.load(),
      shopping.load(),
      inventory.load(),
      reservations.load(),
      processing.load(),
    ]);
  }

  const mutating = ref(false);

  async function runMutation<T>(action: () => Promise<{ data: T | null; error: unknown }>, refetch: () => Promise<void>) {
    mutating.value = true;
    try {
      const result = await action();
      await refetch();
      return result.data
        ? { data: result.data, error: null as DaycareUiError | null }
        : { data: null, error: mapDaycareError(result.error) };
    }
    finally {
      mutating.value = false;
    }
  }

  async function regenerateWeek() {
    return await runMutation(
      () => api.daycare.regenerateWeek(selectedWeek.value),
      async () => {
        await refreshWeekScoped();
        await status.load();
      },
    );
  }

  async function publishWeek(payload?: PublishRequest) {
    return await runMutation(
      () => api.daycare.publishWeek(selectedWeek.value, payload),
      refreshWeekScoped,
    );
  }

  async function publishShopping(payload?: PublishRequest) {
    return await runMutation(
      () => api.daycare.publishShopping(selectedWeek.value, payload),
      () => shopping.load(),
    );
  }

  async function completeWeek(payload?: CompleteRequest) {
    return await runMutation(
      () => api.daycare.completeWeek(selectedWeek.value, payload),
      refreshWeekScoped,
    );
  }

  async function undoCompleteWeek() {
    return await runMutation(
      () => api.daycare.undoCompleteWeek(selectedWeek.value),
      refreshWeekScoped,
    );
  }

  async function updateSettings(payload: PlannerSettingsUpdate) {
    return await runMutation(
      () => api.daycare.updateSettings(payload),
      () => settings.load(),
    );
  }

  async function updateRecipeDaycare(slug: string, payload: RecipeDaycareUpdate) {
    return await runMutation(
      () => api.daycare.updateRecipeDaycare(slug, payload),
      () => Promise.resolve(),
    );
  }

  async function updateSimpleFood(foodId: string, payload: SimpleFoodUpdate) {
    return await runMutation(
      () => api.daycare.updateSimpleFood(foodId, payload),
      () => Promise.resolve(),
    );
  }

  async function pollProcessing(payload?: PollRequest) {
    return await runMutation(
      () => api.daycare.pollProcessing(payload),
      () => processing.load(),
    );
  }

  return {
    // permissions
    isAdmin,
    canView,
    isOffline,

    // week selection
    selectedWeek,
    setSelectedWeek,

    // resources
    status,
    settings,
    week,
    prep,
    shopping,
    inventory,
    reservations,
    processing,

    // lifecycle
    refresh,
    mutating,

    // mutations
    regenerateWeek,
    publishWeek,
    publishShopping,
    completeWeek,
    undoCompleteWeek,
    updateSettings,
    updateRecipeDaycare,
    updateSimpleFood,
    pollProcessing,
  };
}
