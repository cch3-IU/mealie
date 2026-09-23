<template>
  <v-card>
    <v-card-title>{{ $t("daycare.inventory.title") }}</v-card-title>
    <v-card-text>
      <DaycareErrorState v-if="error" :error="error" />
      <v-skeleton-loader v-else-if="loading" type="list-item-three-line" />
      <template v-else-if="inventory">
        <p class="mb-2">
          {{ inventory.summary.physical }} {{ $t("daycare.inventory.physical") }},
          {{ inventory.summary.reserved }} {{ $t("daycare.inventory.reserved") }},
          {{ inventory.summary.free }} {{ $t("daycare.inventory.free") }}
        </p>

        <p v-if="!sortedLots.length">
          {{ $t("daycare.inventory.no-inventory") }}
        </p>
        <v-table v-else density="compact" class="mt-2 daycare-inventory-table">
          <thead>
            <tr>
              <th>{{ $t("daycare.inventory.lot-recipe") }}</th>
              <th>{{ $t("daycare.inventory.lot-portions") }}</th>
              <th>{{ $t("daycare.inventory.lot-storage") }}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="lot in sortedLots" :key="lot.id">
              <td>
                <v-btn
                  variant="text"
                  class="px-0 text-none daycare-recipe-title-link"
                  :to="`/g/${groupSlug}/r/${lot.recipe_slug}`"
                >
                  {{ recipeNameFor(lot.recipe_slug) }}
                </v-btn>
              </td>
              <td>{{ lot.portions_remaining }}</td>
              <td class="text-caption">
                <div>{{ storageLabel(lot.storage) }}</div>
                <div v-if="lot.use_by" class="text-medium-emphasis">
                  {{ lot.use_by }}
                </div>
              </td>
              <td>
                <div class="d-flex align-center ga-1 flex-nowrap">
                  <v-btn
                    icon
                    variant="text"
                    size="small"
                    :disabled="offline || mutating || lot.portions_remaining <= 0"
                    :aria-label="$t('daycare.inventory.lot-consume', { recipe: recipeNameFor(lot.recipe_slug) })"
                    @click="onConsumeClick(lot)"
                  >
                    <v-icon>{{ $globals.icons.minus }}</v-icon>
                  </v-btn>
                  <v-btn
                    icon
                    variant="text"
                    size="small"
                    :disabled="offline || mutating"
                    :aria-label="$t('daycare.inventory.lot-add-one', { recipe: recipeNameFor(lot.recipe_slug) })"
                    @click="onAddOne(lot)"
                  >
                    <v-icon>{{ $globals.icons.createAlt }}</v-icon>
                  </v-btn>
                  <v-btn
                    icon
                    variant="text"
                    size="small"
                    :disabled="offline || mutating"
                    :aria-label="$t('daycare.inventory.lot-edit')"
                    @click="openEditor(lot)"
                  >
                    <v-icon>{{ $globals.icons.edit }}</v-icon>
                  </v-btn>
                </div>
              </td>
            </tr>
          </tbody>
        </v-table>
      </template>
    </v-card-text>

    <DaycareLotEditDialog
      :key="editingLot?.id ?? 'none'"
      v-model="editDialogOpen"
      :lot="editingLot"
      :update-lot="updateLot"
      :delete-lot="deleteLot"
      @deleted="onDeleted"
    />

    <BaseDialog
      v-model="lastServingDialogOpen"
      :title="$t('daycare.inventory.lot-consume-last-title')"
      color="warning"
      can-confirm
      @confirm="onConfirmLastServing"
      @cancel="pendingConsumeLot = null"
    >
      <v-card-text>
        {{ $t("daycare.inventory.lot-consume-last-body", { recipe: pendingConsumeLot ? recipeNameFor(pendingConsumeLot.recipe_slug) : '' }) }}
      </v-card-text>
    </BaseDialog>
  </v-card>
</template>

<script setup lang="ts">
import DaycareErrorState from "./DaycareErrorState.vue";
import DaycareLotEditDialog from "./DaycareLotEditDialog.vue";
import { alert } from "~/composables/use-toast";
import type { DaycareUiError } from "~/composables/daycare/use-daycare";
import type { InventoryResponse, Lot, LotConsumeRequest, LotConsumeResponse, LotPatch, PlanSlot, RecipeSummary, StorageLocation, WeekResponse } from "~/lib/api/types/daycare";

interface Props {
  inventory: InventoryResponse | null;
  loading: boolean;
  error: DaycareUiError | null;
  groupSlug: string;
  /** The current week's plan — one of the two sources used to resolve a lot's recipe display name. */
  week: WeekResponse | null;
  /** The sidecar's `GET /recipes` summaries — the other name source, covering recipes not on this week's plan. */
  recipes: RecipeSummary[];
  mutating: boolean;
  offline: boolean;
  updateLot: (lotId: number, payload: LotPatch) => Promise<{ data: Lot | null; error: DaycareUiError | null }>;
  consumeLot: (lotId: number, payload: LotConsumeRequest) => Promise<{ data: LotConsumeResponse | null; error: DaycareUiError | null }>;
  deleteLot: (lotId: number) => Promise<{ data: Lot | null; error: DaycareUiError | null }>;
}
const props = defineProps<Props>();

const i18n = useI18n();

const editDialogOpen = ref(false);
const editingLot = ref<Lot | null>(null);

function openEditor(lot: Lot) {
  editingLot.value = lot;
  editDialogOpen.value = true;
}

const lastServingDialogOpen = ref(false);
const pendingConsumeLot = ref<Lot | null>(null);

/** A plain `-1` never skips this confirmation for the last portion in a lot — a mis-tap on the
 * final serving would otherwise silently empty it out of the inventory list on the next refresh. */
function onConsumeClick(lot: Lot) {
  if (lot.portions_remaining === 1) {
    pendingConsumeLot.value = lot;
    lastServingDialogOpen.value = true;
    return;
  }
  void consumeOne(lot);
}

async function onConfirmLastServing() {
  const lot = pendingConsumeLot.value;
  pendingConsumeLot.value = null;
  if (lot) await consumeOne(lot);
}

async function consumeOne(lot: Lot) {
  const result = await props.consumeLot(lot.id, { portions: 1, release_reservations: true });
  if (result.error) {
    alert.error(result.error.message ?? i18n.t(`daycare.errors.${result.error.kind}`));
  }
}

async function onAddOne(lot: Lot) {
  const result = await props.updateLot(lot.id, { portions_remaining: lot.portions_remaining + 1 });
  if (result.error) {
    alert.error(result.error.message ?? i18n.t(`daycare.errors.${result.error.kind}`));
  }
}

function onDeleted() {
  alert.success(i18n.t("daycare.inventory.lot-deleted"));
}

const SLOT_KEYS = ["breakfast", "lunch", "snack_am", "snack_pm"] as const;

/** `<slug>-<slug>` → `Slug Slug`, used only when a lot's recipe has no known name from either source below. */
function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const recipeNameBySlug = computed(() => {
  const map = new Map<string, string>();
  for (const recipe of props.recipes) {
    if (recipe.slug) map.set(recipe.slug, recipe.name);
  }
  for (const day of props.week?.plan.days ?? []) {
    for (const key of SLOT_KEYS) {
      const slot = day[key] as PlanSlot | undefined;
      const recipe = slot?.recipe;
      if (recipe?.slug && !map.has(recipe.slug)) map.set(recipe.slug, recipe.name);
    }
  }
  return map;
});

function recipeNameFor(slug: string): string {
  return recipeNameBySlug.value.get(slug) ?? humanizeSlug(slug);
}

const KNOWN_STORAGE_LOCATIONS: StorageLocation[] = ["freezer", "refrigerator", "shelf_stable", "other"];

// Lot.storage is a plain string on the wire (not a narrowed union), so fall back to the raw value
// for anything the sidecar sends that isn't one of the four known storage locations.
function storageLabel(storage: string): string {
  if ((KNOWN_STORAGE_LOCATIONS as string[]).includes(storage)) return i18n.t(`daycare.inventory.storage-${storage}`);
  return storage;
}

// A sentinel that sorts after any real "YYYY-MM-DD" date string, so lots with no use-by/made
// date sort last within a recipe rather than first.
const NO_DATE_SENTINEL = String.fromCharCode(0xFFFF);

/** Sorted by recipe name so the "at a glance" list reads the same every time; ties broken by
 * soonest use-by (nulls last), then made date, then id, so rows don't jump around after a tap. */
const sortedLots = computed(() => {
  const lots = props.inventory?.lots ?? [];
  return [...lots].sort((a, b) => {
    const nameCmp = recipeNameFor(a.recipe_slug).localeCompare(recipeNameFor(b.recipe_slug));
    if (nameCmp !== 0) return nameCmp;
    const useByCmp = (a.use_by ?? NO_DATE_SENTINEL).localeCompare(b.use_by ?? NO_DATE_SENTINEL);
    if (useByCmp !== 0) return useByCmp;
    const madeCmp = (a.made_date ?? NO_DATE_SENTINEL).localeCompare(b.made_date ?? NO_DATE_SENTINEL);
    if (madeCmp !== 0) return madeCmp;
    return a.id - b.id;
  });
});
</script>

<style scoped>
/* Vuetify's default td/th padding (16px a side) plus auto column sizing comfortably fits 4
   columns on desktop but overflows a phone-width card; a fixed layout with explicit column
   percentages, tightened padding, and wrapping text keeps the row (recipe, portions, a merged
   storage/use-by column, and the -1/+1/edit actions — which need to stay full-size, not shrunk,
   as real tap targets) fitting without horizontal scrolling down to a 375px viewport. */
.daycare-inventory-table :deep(table) {
  table-layout: fixed;
  width: 100%;
}
.daycare-inventory-table :deep(td),
.daycare-inventory-table :deep(th) {
  padding: 0 4px;
  overflow-wrap: break-word;
}
.daycare-inventory-table :deep(td:first-child),
.daycare-inventory-table :deep(th:first-child) {
  padding-left: 0;
}
.daycare-inventory-table :deep(td:nth-child(1)),
.daycare-inventory-table :deep(th:nth-child(1)) {
  width: 26%;
}
.daycare-inventory-table :deep(td:nth-child(2)),
.daycare-inventory-table :deep(th:nth-child(2)) {
  width: 10%;
}
.daycare-inventory-table :deep(td:nth-child(3)),
.daycare-inventory-table :deep(th:nth-child(3)) {
  width: 22%;
}
/* The actions column needs to stay wide enough for three real 40px tap targets (-1/+1/edit) plus
   their gaps — it does not shrink evenly with the others. */
.daycare-inventory-table :deep(td:nth-child(4)),
.daycare-inventory-table :deep(th:nth-child(4)) {
  width: 42%;
}

/* Makes the v-btn read as an ordinary title with a link, not a boxed button — see the same
   treatment on DaycarePrepCard.vue's production rows. */
.daycare-recipe-title-link {
  height: auto;
  min-width: 0;
  padding: 0;
  font-size: inherit;
  font-weight: 500;
  text-decoration: underline;
  justify-content: flex-start;
  white-space: normal;
  text-align: left;
}
.daycare-recipe-title-link :deep(.v-btn__content) {
  white-space: normal;
  overflow-wrap: break-word;
}
</style>
