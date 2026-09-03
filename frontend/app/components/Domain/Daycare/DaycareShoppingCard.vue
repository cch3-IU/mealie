<template>
  <v-card>
    <v-card-title>{{ $t("daycare.shopping.title") }}</v-card-title>
    <v-card-text>
      <DaycareErrorState v-if="error" :error="error" />
      <v-skeleton-loader v-else-if="loading" type="list-item-three-line" />
      <p v-else-if="weekEmpty">
        {{ $t("daycare.plan.no-plan-yet") }}
      </p>
      <template v-else-if="shopping">
        <p class="mb-1">
          {{ $t("daycare.shopping.items-published", shopping.publication.item_count) }}
        </p>
        <p v-if="shopping.review_items.length" class="mb-1">
          {{ $t("daycare.shopping.items-need-review", shopping.review_items.length) }}
        </p>
        <p class="mb-2 text-medium-emphasis">
          {{ $t(`daycare.shopping.publication-${publicationKey}`) }}
        </p>

        <v-btn
          v-if="shopping.publication.list_id"
          variant="text"
          :to="`/shopping-lists/${shopping.publication.list_id}`"
        >
          {{ $t("daycare.shopping.open-shopping-list") }}
        </v-btn>
      </template>
    </v-card-text>
    <v-card-actions>
      <v-btn
        :disabled="offline || mutating || weekEmpty"
        :loading="mutating"
        variant="text"
        @click="$emit('preview')"
      >
        {{ $t("daycare.shopping.preview") }}
      </v-btn>
      <v-btn
        :disabled="offline || mutating || weekEmpty"
        :loading="mutating"
        @click="$emit('publish')"
      >
        {{ $t("daycare.shopping.publish") }}
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import DaycareErrorState from "./DaycareErrorState.vue";
import type { DaycareUiError } from "~/composables/daycare/use-daycare";
import type { ShoppingPlan } from "~/lib/api/types/daycare";

interface Props {
  shopping: ShoppingPlan | null;
  weekEmpty: boolean;
  loading: boolean;
  error: DaycareUiError | null;
  mutating: boolean;
  offline: boolean;
}
const props = defineProps<Props>();

defineEmits<{
  preview: [];
  publish: [];
}>();

const publicationKey = computed(() => (props.shopping?.publication.status ?? "never").replace("_", "-"));
</script>
