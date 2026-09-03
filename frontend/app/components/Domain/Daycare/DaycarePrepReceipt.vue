<template>
  <div>
    <p v-if="committedAt" class="mb-2">
      {{ $t("daycare.prep.receipt-completed-on", { date: formattedDate }) }}
    </p>
    <p class="mb-1">
      {{ $t("daycare.prep.receipt-used-existing", existingAllocated) }}
    </p>
    <p class="mb-2">
      {{ $t("daycare.prep.receipt-saved-new", leftoverAdded) }}
      <template v-if="leftoverAdded > 0">
        ({{ $t("daycare.prep.receipt-containers", leftoverLots) }})
      </template>
    </p>

    <template v-if="recipes && recipes.length">
      <v-btn variant="text" size="small" class="px-0" @click="showBreakdown = !showBreakdown">
        {{ showBreakdown ? $t("daycare.prep.receipt-hide-breakdown") : $t("daycare.prep.receipt-by-recipe") }}
      </v-btn>
      <v-expand-transition>
        <v-table v-if="showBreakdown" density="compact" class="mt-1">
          <thead>
            <tr>
              <th>{{ $t("daycare.prep.receipt-col-recipe") }}</th>
              <th>{{ $t("daycare.prep.receipt-col-used-existing") }}</th>
              <th>{{ $t("daycare.prep.receipt-col-made") }}</th>
              <th>{{ $t("daycare.prep.receipt-col-used-this-week") }}</th>
              <th>{{ $t("daycare.prep.receipt-col-saved") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in recipes" :key="row.recipe_slug">
              <td>{{ row.recipe_name }}</td>
              <td>{{ row.existing_inventory_allocated }}</td>
              <td>{{ row.new_production_daycare_portions }}</td>
              <td>{{ row.new_production_allocated_to_week }}</td>
              <td>{{ row.leftover_portions_to_inventory }}</td>
            </tr>
          </tbody>
        </v-table>
      </v-expand-transition>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { CommitReceiptSummary, CompletionPreviewRecipe } from "~/lib/api/types/daycare";

interface Props {
  /** ISO timestamp the week was marked complete, or null when unknown (e.g. a bare CommitReference). */
  committedAt: string | null;
  summary: CommitReceiptSummary | null;
  /** Full per-recipe breakdown, when available (present on a fresh 200 receipt; absent on a replayed CommitReference). */
  recipes?: CompletionPreviewRecipe[] | null;
}
const props = defineProps<Props>();

const showBreakdown = ref(false);

const existingAllocated = computed(() => Math.round((props.summary?.existing_inventory_allocated ?? 0) * 100) / 100);
const leftoverAdded = computed(() => Math.round((props.summary?.leftover_portions_added ?? 0) * 100) / 100);
const leftoverLots = computed(() => props.summary?.leftover_lots_added ?? 0);

const formattedDate = computed(() => (props.committedAt ? new Date(props.committedAt).toLocaleString() : ""));
</script>
