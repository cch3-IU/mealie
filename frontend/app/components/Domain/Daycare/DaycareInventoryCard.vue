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

        <p v-if="!inventory.lots.length">
          {{ $t("daycare.inventory.no-inventory") }}
        </p>
        <template v-else>
          <v-btn variant="text" @click="showLots = !showLots">
            {{ showLots ? $t("daycare.inventory.hide-inventory") : $t("daycare.inventory.view-inventory") }}
          </v-btn>

          <v-expand-transition>
            <v-table v-if="showLots" density="compact" class="mt-2">
              <thead>
                <tr>
                  <th>{{ $t("daycare.inventory.lot-recipe") }}</th>
                  <th>{{ $t("daycare.inventory.lot-portions") }}</th>
                  <th>{{ $t("daycare.inventory.lot-storage") }}</th>
                  <th>{{ $t("daycare.inventory.lot-use-by") }}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                <tr v-for="lot in inventory.lots" :key="lot.id">
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
                  <td>{{ lot.storage }}</td>
                  <td>{{ lot.use_by ?? "—" }}</td>
                  <td>
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
                  </td>
                </tr>
              </tbody>
            </v-table>
          </v-expand-transition>
        </template>
      </template>
    </v-card-text>

    <DaycareLotEditDialog
      :key="editingLot?.id ?? 'none'"
      v-model="editDialogOpen"
      :lot="editingLot"
      :update-lot="updateLot"
    />
  </v-card>
</template>

<script setup lang="ts">
import DaycareErrorState from "./DaycareErrorState.vue";
import DaycareLotEditDialog from "./DaycareLotEditDialog.vue";
import type { DaycareUiError } from "~/composables/daycare/use-daycare";
import type { InventoryResponse, Lot, LotPatch, PlanSlot, RecipeSummary, WeekResponse } from "~/lib/api/types/daycare";

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
}
const props = defineProps<Props>();

const showLots = ref(false);

const editDialogOpen = ref(false);
const editingLot = ref<Lot | null>(null);

function openEditor(lot: Lot) {
  editingLot.value = lot;
  editDialogOpen.value = true;
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
</script>

<style scoped>
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
}
</style>
