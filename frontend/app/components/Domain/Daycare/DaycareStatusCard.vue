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

        <v-alert v-if="actionableItems.length" type="warning" variant="tonal" density="comfortable" class="mb-2">
          <div class="font-weight-medium">
            {{ $t("daycare.status.warnings-heading") }}
          </div>
          <ul>
            <li v-for="item in actionableItems" :key="item.key" class="mb-1">
              {{ item.message }}
              <template v-if="item.hint">
                {{ item.hint }}
              </template>
              <template v-if="item.links">
                <v-btn size="small" variant="text" class="px-0" @click="toggleExpanded(item.key)">
                  {{ expanded[item.key] ? $t("daycare.status.hide-details") : $t("daycare.status.show-details") }}
                </v-btn>
                <v-expand-transition>
                  <ul v-if="expanded[item.key]">
                    <li v-for="link in item.links" :key="link.slug">
                      <v-btn variant="text" class="px-0" :to="`/g/${groupSlug}/r/${link.slug}`">
                        {{ link.name }}
                      </v-btn>
                    </li>
                  </ul>
                </v-expand-transition>
              </template>
            </li>
          </ul>
        </v-alert>

        <v-alert v-if="relaxedSpacing" type="info" variant="tonal" density="comfortable" class="mb-2">
          {{ $t("daycare.status.relaxed-spacing-group", relaxedSpacing.count) }}
          <v-btn size="small" variant="text" class="px-0" @click="showRelaxedDetails = !showRelaxedDetails">
            {{ showRelaxedDetails ? $t("daycare.status.hide-details") : $t("daycare.status.show-details") }}
          </v-btn>
          <v-expand-transition>
            <ul v-if="showRelaxedDetails">
              <li v-for="(warning, index) in relaxedSpacing.details" :key="index">
                {{ warning }}
              </li>
            </ul>
          </v-expand-transition>
        </v-alert>
      </template>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import DaycareErrorState from "./DaycareErrorState.vue";
import {
  changedSincePlanCount,
  groupRelaxedSpacingWarnings,
  recipeLinksForSlugs,
  recipesNeedingReviewCount,
} from "~/composables/daycare/daycare-summary";
import type { RecipeLink } from "~/composables/daycare/daycare-summary";
import type { DaycareUiError } from "~/composables/daycare/use-daycare";
import type { ProcessingStatus, StatusResponse, WeekResponse } from "~/lib/api/types/daycare";

interface Props {
  status: StatusResponse | null;
  processing: ProcessingStatus | null;
  week: WeekResponse | null;
  groupSlug: string;
  loading: boolean;
  error: DaycareUiError | null;
}
const props = defineProps<Props>();

const i18n = useI18n();

const needsReview = computed(() => recipesNeedingReviewCount(props.processing));
const changedSincePlan = computed(() => changedSincePlanCount(props.processing));

interface ActionableItem {
  key: string;
  message: string;
  hint?: string;
  links?: RecipeLink[];
}

const expanded = reactive<Record<string, boolean>>({});
function toggleExpanded(key: string) {
  expanded[key] = !expanded[key];
}

const showRelaxedDetails = ref(false);

const warningGroups = computed(() => groupRelaxedSpacingWarnings(props.week?.warnings ?? []));
const relaxedSpacing = computed(() => warningGroups.value.relaxedSpacing);

const actionableItems = computed<ActionableItem[]>(() => {
  const items: ActionableItem[] = [];

  const lackingYield = props.processing?.recipes_lacking_daycare_yield ?? [];
  if (lackingYield.length) {
    items.push({
      key: "lacking-yield",
      message: i18n.t("daycare.status.lacking-yield", lackingYield.length),
      hint: i18n.t("daycare.status.lacking-yield-hint"),
      links: recipeLinksForSlugs(lackingYield, props.week?.plan),
    });
  }

  if (props.week?.stale) {
    items.push({
      key: "stale-plan",
      message: i18n.t("daycare.status.stale-plan", { reason: props.week.stale_reason ?? "" }),
      hint: i18n.t("daycare.status.stale-plan-hint"),
    });
  }

  if (props.week?.publication.drift) {
    items.push({
      key: "publication-drift",
      message: props.week.publication.drift_reason
        ? i18n.t("daycare.status.publication-drift", { reason: props.week.publication.drift_reason })
        : i18n.t("daycare.status.publication-drift-unknown-reason"),
      hint: i18n.t("daycare.status.publication-drift-hint"),
    });
  }

  const deadLettered = props.processing?.processing.counts.dead_lettered ?? 0;
  if (deadLettered > 0) {
    items.push({ key: "processing-failures", message: i18n.t("daycare.status.processing-failures", deadLettered) });
  }

  for (const [index, warning] of warningGroups.value.rest.entries()) {
    items.push({ key: `warning-${index}`, message: warning });
  }

  return items;
});

function formatRun(value: string | null | undefined, fallbackKey: string) {
  if (!value) {
    return i18n.t(fallbackKey);
  }
  return new Date(value).toLocaleString();
}
</script>
