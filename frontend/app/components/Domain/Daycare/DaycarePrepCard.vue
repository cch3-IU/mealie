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
            <v-list-item-title>
              <v-btn
                variant="text"
                class="px-0 text-none daycare-recipe-title-link"
                :to="`/g/${groupSlug}/r/${row.recipe_slug}`"
              >
                {{ row.recipe_name }}
              </v-btn>
            </v-list-item-title>
            <v-list-item-subtitle>{{ $t("daycare.prep.batches", row.batches_to_make ?? 0) }}</v-list-item-subtitle>
          </v-list-item>
        </v-list>

        <template v-if="week?.committed">
          <p class="mt-3 mb-1">
            {{ $t("daycare.prep.completed-on", { date: completedOnText }) }}
          </p>
          <v-btn variant="text" class="px-0" :disabled="offline || mutating" @click="completionDialogOpen = true">
            {{ $t("daycare.prep.view-receipt") }}
          </v-btn>
          <DaycarePrepUndoControl
            :key="week?.week_start ?? 'none'"
            :disabled="offline || mutating"
            :undo-complete-week="undoCompleteWeek"
            @undone="$emit('undone')"
          />
        </template>
        <v-btn
          v-else
          class="mt-3"
          :disabled="offline || mutating || blockers.length > 0"
          :loading="mutating"
          @click="completionDialogOpen = true"
        >
          {{ $t("daycare.prep.mark-complete") }}
        </v-btn>
      </template>
    </v-card-text>

    <DaycarePrepCompletionDialog
      :key="week?.week_start ?? 'none'"
      v-model="completionDialogOpen"
      :committed="week?.committed ?? false"
      :committed-at="week?.committed_at ?? null"
      :get-completion-preview="getCompletionPreview"
      :complete-week="completeWeek"
      :get-commit-receipt="getCommitReceipt"
      @completed="$emit('completed', $event)"
    />
  </v-card>
</template>

<script setup lang="ts">
import DaycareErrorState from "./DaycareErrorState.vue";
import DaycarePrepCompletionDialog from "./DaycarePrepCompletionDialog.vue";
import DaycarePrepUndoControl from "./DaycarePrepUndoControl.vue";
import type { DaycareUiError } from "~/composables/daycare/use-daycare";
import type { CommitReceipt, CompleteRequest, CompletionPreview, ProductionRow, UndoResult, WeekResponse } from "~/lib/api/types/daycare";

interface Props {
  productionRows: ProductionRow[];
  blockers: string[];
  loading: boolean;
  error: DaycareUiError | null;
  weekEmpty: boolean;
  groupSlug: string;
  week: WeekResponse | null;
  mutating: boolean;
  offline: boolean;
  getCompletionPreview: () => Promise<{ data: CompletionPreview | null; error: DaycareUiError | null }>;
  completeWeek: (payload: CompleteRequest, idempotencyKey: string) => Promise<{ data: CommitReceipt | null; error: DaycareUiError | null }>;
  getCommitReceipt: () => Promise<{ data: CommitReceipt | null; error: DaycareUiError | null }>;
  undoCompleteWeek: () => Promise<{ data: UndoResult | null; error: DaycareUiError | null }>;
}
const props = defineProps<Props>();

defineEmits<{
  completed: [CommitReceipt];
  undone: [];
}>();

const completionDialogOpen = ref(false);

const completedOnText = computed(() => (props.week?.committed_at ? new Date(props.week.committed_at).toLocaleString() : ""));
</script>

<style scoped>
/* Makes the v-btn read as an ordinary title with a link, not a boxed button — the recipe title
   itself is the link (see DaycareInventoryCard.vue for the same treatment). */
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
