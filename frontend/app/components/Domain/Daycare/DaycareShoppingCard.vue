<template>
  <v-card>
    <v-card-title>{{ $t("daycare.shopping.title") }}</v-card-title>
    <v-card-text>
      <DaycareErrorState v-if="error && !weekLocked && !blocked" :error="error" />
      <v-skeleton-loader v-else-if="loading" type="list-item-three-line" />
      <p v-else-if="weekEmpty">
        {{ $t("daycare.plan.no-plan-yet") }}
      </p>
      <template v-else-if="weekLocked">
        <v-alert type="info" variant="tonal" density="comfortable">
          {{ $t("daycare.shopping.week-locked") }}
          <template v-if="committedAtText">
            {{ $t("daycare.shopping.week-locked-on", { date: committedAtText }) }}
          </template>
        </v-alert>
      </template>
      <template v-else-if="blocked">
        <v-alert type="info" variant="tonal" density="comfortable">
          <div class="font-weight-medium">
            {{ $t("daycare.shopping.blocked-heading") }}
          </div>
          <ul>
            <li v-for="(blocker, index) in parsedBlockers" :key="index">
              <v-btn v-if="blocker.recipeSlug" variant="text" class="px-0" :to="`/g/${groupSlug}/r/${blocker.recipeSlug}`">
                {{ blocker.recipeName }}
              </v-btn>
              <span v-else>{{ blocker.recipeName ?? blocker.text }}</span>
              <template v-if="blocker.detail">
                : {{ blocker.detail }}
              </template>
            </li>
          </ul>
          <p class="mt-2 mb-0 text-medium-emphasis">
            {{ $t("daycare.shopping.blocked-hint") }}
          </p>
        </v-alert>
      </template>
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
    <v-card-actions v-if="!weekLocked">
      <v-btn
        :disabled="offline || mutating || weekEmpty || blocked"
        :loading="mutating"
        variant="text"
        @click="$emit('preview')"
      >
        {{ $t("daycare.shopping.preview") }}
      </v-btn>
      <v-btn
        :disabled="offline || mutating || weekEmpty || blocked"
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
import { parseShoppingBlockers } from "~/composables/daycare/daycare-summary";
import { committedAtFromError, shoppingBlockers } from "~/composables/daycare/use-daycare";
import type { DaycareUiError } from "~/composables/daycare/use-daycare";
import type { ShoppingPlan, WeekResponse } from "~/lib/api/types/daycare";

interface Props {
  shopping: ShoppingPlan | null;
  week: WeekResponse | null;
  weekEmpty: boolean;
  loading: boolean;
  error: DaycareUiError | null;
  mutating: boolean;
  offline: boolean;
  groupSlug: string;
}
const props = defineProps<Props>();

defineEmits<{
  preview: [];
  publish: [];
}>();

const publicationKey = computed(() => (props.shopping?.publication.status ?? "never").replace("_", "-"));

const weekLocked = computed(() => (props.week?.committed ?? false) || props.error?.code === "week_committed");
const committedAtText = computed(() => {
  const committedAt = props.week?.committed_at ?? committedAtFromError(props.error);
  return committedAt ? new Date(committedAt).toLocaleString() : "";
});

const blocked = computed(() => !weekLocked.value && props.error?.code === "shopping_blocked");
const parsedBlockers = computed(() => parseShoppingBlockers(shoppingBlockers(props.error), props.week?.plan));
</script>
