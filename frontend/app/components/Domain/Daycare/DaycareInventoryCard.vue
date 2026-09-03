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
                </tr>
              </thead>
              <tbody>
                <tr v-for="lot in inventory.lots" :key="lot.id">
                  <td>{{ lot.recipe_slug }}</td>
                  <td>{{ lot.portions_remaining }}</td>
                  <td>{{ lot.storage }}</td>
                  <td>{{ lot.use_by ?? "—" }}</td>
                </tr>
              </tbody>
            </v-table>
          </v-expand-transition>
        </template>
      </template>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import DaycareErrorState from "./DaycareErrorState.vue";
import type { DaycareUiError } from "~/composables/daycare/use-daycare";
import type { InventoryResponse } from "~/lib/api/types/daycare";

interface Props {
  inventory: InventoryResponse | null;
  loading: boolean;
  error: DaycareUiError | null;
}
defineProps<Props>();

const showLots = ref(false);
</script>
