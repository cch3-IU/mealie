<template>
  <v-card>
    <v-card-title>{{ $t("daycare.plan.title") }}</v-card-title>
    <v-card-text>
      <DaycareErrorState v-if="error" :error="error" />
      <v-skeleton-loader v-else-if="loading && !week" type="list-item-three-line" />
      <p v-else-if="weekEmpty">
        {{ $t("daycare.plan.no-plan-yet") }}
      </p>
      <template v-else-if="week">
        <v-alert v-if="week.committed" type="info" variant="tonal" density="comfortable" class="mb-2">
          {{ $t("daycare.plan.committed-notice") }}
        </v-alert>
        <v-alert v-if="week.stale" type="warning" variant="tonal" density="comfortable" class="mb-2">
          {{ $t("daycare.plan.stale-notice", { reason: week.stale_reason }) }}
        </v-alert>

        <p class="mb-2">
          {{ summary.plannedSlots }} {{ $t("daycare.plan.meals-planned") }}
          — {{ summary.fromFreezer }} {{ $t("daycare.plan.from-freezer") }},
          {{ summary.newProduction }} {{ $t("daycare.plan.new-production") }}
        </p>

        <v-btn variant="text" @click="showWeek = !showWeek">
          {{ showWeek ? $t("daycare.plan.hide-week") : $t("daycare.plan.view-week") }}
        </v-btn>

        <v-expand-transition>
          <div v-if="showWeek" class="mt-2">
            <div v-for="day in week.plan.days" :key="day.date" class="mb-3">
              <div class="font-weight-medium">
                {{ day.date }}
              </div>
              <div>{{ $t("daycare.plan.breakfast") }}: {{ day.breakfast.recipe.name }}</div>
              <div>{{ $t("daycare.plan.lunch") }}: {{ day.lunch.recipe.name }}</div>
              <div>{{ $t("daycare.plan.snack-am") }}: {{ day.snack_am.recipe.name }}</div>
              <div>{{ $t("daycare.plan.snack-pm") }}: {{ day.snack_pm.recipe.name }}</div>
            </div>
          </div>
        </v-expand-transition>
      </template>
    </v-card-text>
    <v-card-actions>
      <v-btn
        :disabled="offline || mutating"
        :loading="mutating"
        @click="confirmOpen = true"
      >
        <template #prepend>
          <v-icon>{{ $globals.icons.refresh }}</v-icon>
        </template>
        {{ $t("daycare.plan.regenerate") }}
      </v-btn>
    </v-card-actions>

    <BaseDialog
      v-model="confirmOpen"
      :title="$t('daycare.plan.regenerate-confirm-title')"
      can-confirm
      @confirm="$emit('regenerate')"
    >
      <p>{{ $t("daycare.plan.regenerate-confirm-body") }}</p>
      <v-alert v-if="week?.committed" type="warning" variant="tonal" density="comfortable" class="mt-2">
        {{ $t("daycare.plan.regenerate-confirm-committed-warning") }}
      </v-alert>
      <v-alert v-if="week?.stale" type="warning" variant="tonal" density="comfortable" class="mt-2">
        {{ $t("daycare.plan.regenerate-confirm-stale-warning", { reason: week.stale_reason }) }}
      </v-alert>
    </BaseDialog>
  </v-card>
</template>

<script setup lang="ts">
import DaycareErrorState from "./DaycareErrorState.vue";
import { summarizePlanWeek } from "~/composables/daycare/daycare-summary";
import type { DaycareUiError } from "~/composables/daycare/use-daycare";
import type { WeekResponse } from "~/lib/api/types/daycare";

interface Props {
  week: WeekResponse | null;
  weekEmpty: boolean;
  loading: boolean;
  error: DaycareUiError | null;
  mutating: boolean;
  offline: boolean;
}
const props = defineProps<Props>();

defineEmits<{
  regenerate: [];
}>();

const showWeek = ref(false);
const confirmOpen = ref(false);

const summary = computed(() => summarizePlanWeek(props.week?.plan));
</script>
