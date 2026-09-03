<template>
  <v-card>
    <v-card-title>{{ $t("daycare.prep.title") }}</v-card-title>
    <v-card-text>
      <DaycareErrorState v-if="error" :error="error" />
      <v-skeleton-loader v-else-if="loading" type="list-item-three-line" />
      <p v-else-if="weekEmpty">
        {{ $t("daycare.plan.no-plan-yet") }}
      </p>
      <template v-else>
        <v-alert v-if="blockers.length" type="warning" variant="tonal" density="comfortable" class="mb-2">
          <div class="font-weight-medium">
            {{ $t("daycare.prep.blockers-heading") }}
          </div>
          <ul>
            <li v-for="(blocker, index) in blockers" :key="index">
              {{ blocker }}
            </li>
          </ul>
        </v-alert>

        <p v-if="!productionRows.length">
          {{ $t("daycare.prep.nothing-to-prep") }}
        </p>
        <v-list v-else>
          <v-list-item v-for="row in productionRows" :key="row.recipe_slug">
            <v-list-item-title>{{ row.recipe_name }}</v-list-item-title>
            <v-list-item-subtitle>{{ $t("daycare.prep.batches", row.batches_to_make ?? 0) }}</v-list-item-subtitle>
            <template #append>
              <v-btn variant="text" :to="`/g/${groupSlug}/r/${row.recipe_slug}`">
                {{ $t("daycare.prep.open-recipe") }}
              </v-btn>
            </template>
          </v-list-item>
        </v-list>
      </template>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import DaycareErrorState from "./DaycareErrorState.vue";
import type { DaycareUiError } from "~/composables/daycare/use-daycare";
import type { ProductionRow } from "~/lib/api/types/daycare";

interface Props {
  productionRows: ProductionRow[];
  blockers: string[];
  loading: boolean;
  error: DaycareUiError | null;
  weekEmpty: boolean;
  groupSlug: string;
}
defineProps<Props>();
</script>
