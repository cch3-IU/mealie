import { useRecipeDaycare } from "./use-recipe-daycare";
import { newIdempotencyKey } from "~/lib/api/user/daycare";
import { alert } from "~/composables/use-toast";
import type { StorageLocation } from "~/lib/api/types/daycare";

export const STORAGE_LOCATIONS: StorageLocation[] = ["freezer", "refrigerator", "shelf_stable", "other"];

/** A servings amount is valid when it is a finite number greater than 0 — shared by both "make this" dialogs. */
export function isValidServings(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** Blank (empty field, `null`, or `""`) means "not entered", distinct from an invalid entry like 0 or -1. */
export function isBlankServings(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

/**
 * The inventory section of Mealie's native "I Made This" dialog (see `RecipeLastMade.vue`, overlay
 * hook). Blank servings = do not add to inventory. The made date is the dialog's own, passed to
 * `submit`. The section is only `available` once the sidecar has answered an inventory read, so an
 * offline/unreachable/forbidden sidecar hides it instead of breaking the upstream dialog.
 */
export function useMadeThisInventory(slug: Ref<string>, dialogOpen: Ref<boolean>) {
  const i18n = useI18n();
  const daycare = useRecipeDaycare(slug);

  const available = ref(false);
  const servings = ref<number | null>(null);
  const storage = ref<StorageLocation>("freezer");
  const useBy = ref<string | null>(null);
  /** Minted per dialog open and reused across submit attempts so a retry can't double-create a lot. */
  let idempotencyKey = newIdempotencyKey();

  const servingsInvalid = computed(() => available.value && !isBlankServings(servings.value) && !isValidServings(servings.value));

  function reset() {
    servings.value = null;
    storage.value = "freezer";
    useBy.value = null;
    idempotencyKey = newIdempotencyKey();
  }

  watch(dialogOpen, async (open) => {
    if (!open) return;
    reset();
    available.value = false;
    await daycare.retryInventory();
    available.value = !!daycare.inventory.data.value && !daycare.inventory.error.value;
  });

  /**
   * Creates the lot when servings > 0. Never throws and never blocks the timeline event that
   * precedes it: a failure shows a clear "inventory was not added" error and leaves retry to the
   * Daycare panel.
   */
  async function submit(madeDate: string) {
    if (!available.value || !isValidServings(servings.value)) return;

    const result = await daycare.createLot(
      { portions: servings.value, made_date: madeDate, use_by: useBy.value, storage: storage.value },
      idempotencyKey,
    );
    // No success toast: upstream's own "added to timeline" (or image-failure) toast must stay visible.
    if (!result.data) {
      alert.error(i18n.t("daycare.inventory.made-this-not-added") + (result.error?.message ? ` (${result.error.message})` : ""));
    }
  }

  return { available, servings, storage, useBy, servingsInvalid, reset, submit };
}
