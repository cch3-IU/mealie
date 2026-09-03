<template>
  <v-card>
    <v-card-title>{{ $t("daycare.status.title") }}</v-card-title>
    <v-card-text>
      <DaycareErrorState v-if="error" :error="error" />
      <v-skeleton-loader v-else-if="loading" type="list-item-three-line" />
      <template v-else>
        <p v-if="processing" class="mb-1">
          {{ $t("daycare.status.recipes-tracked", processing.recipe_count) }}
          <template v-if="needsReview > 0">
            — {{ $t("daycare.status.needs-review", needsReview) }}
          </template>
        </p>

        <p v-if="changedSincePlan > 0" class="mb-1">
          {{ $t("daycare.status.changed-since-plan", changedSincePlan) }}
          {{ $t("daycare.status.regenerate-prompt") }}
        </p>

        <p class="mb-1">
          {{ $t("daycare.status.scheduler-last-run") }}: {{ formatRun(status?.scheduler.last_run, "daycare.status.scheduler-not-run-yet") }}
        </p>
        <p class="mb-2">
          {{ $t("daycare.status.scheduler-next-run") }}: {{ formatRun(status?.scheduler.next_run, "daycare.status.scheduler-not-scheduled") }}
        </p>

        <template v-if="warnings.length">
          <v-alert type="warning" variant="tonal" density="comfortable">
            <div class="font-weight-medium">
              {{ $t("daycare.status.warnings-heading") }}
            </div>
            <ul>
              <li v-for="(warning, index) in warnings" :key="index">
                {{ warning }}
              </li>
            </ul>
          </v-alert>
        </template>
      </template>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import DaycareErrorState from "./DaycareErrorState.vue";
import { changedSincePlanCount, recipesNeedingReviewCount } from "~/composables/daycare/daycare-summary";
import type { DaycareUiError } from "~/composables/daycare/use-daycare";
import type { ProcessingStatus, StatusResponse, WeekResponse } from "~/lib/api/types/daycare";

interface Props {
  status: StatusResponse | null;
  processing: ProcessingStatus | null;
  week: WeekResponse | null;
  loading: boolean;
  error: DaycareUiError | null;
}
const props = defineProps<Props>();

const i18n = useI18n();

const needsReview = computed(() => recipesNeedingReviewCount(props.processing));
const changedSincePlan = computed(() => changedSincePlanCount(props.processing));

const warnings = computed(() => {
  const list = [...(props.week?.warnings ?? [])];
  const deadLettered = props.processing?.processing.counts.dead_lettered ?? 0;
  if (deadLettered > 0) {
    list.push(i18n.t("daycare.status.processing-failures", deadLettered));
  }
  return list;
});

function formatRun(value: string | null | undefined, fallbackKey: string) {
  if (!value) {
    return i18n.t(fallbackKey);
  }
  return new Date(value).toLocaleString();
}
</script>
