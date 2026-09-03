<template>
  <BaseDialog
    :model-value="modelValue"
    :title="dialogTitle"
    :loading="phase === 'loading' || phase === 'submitting'"
    :can-submit="phase === 'preview'"
    :submit-text="$t('daycare.prep.confirm-complete')"
    :cancel-text="phase === 'preview' ? undefined : $t('general.close')"
    keep-open
    @update:model-value="$emit('update:modelValue', $event)"
    @submit="attemptComplete"
  >
    <v-skeleton-loader v-if="phase === 'loading' || phase === 'submitting'" type="list-item-three-line" />

    <template v-else-if="phase === 'preview' && preview">
      <p class="mb-2">
        {{ $t("daycare.prep.completion-preview-intro") }}
      </p>
      <v-table density="compact">
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
          <tr v-for="row in preview.recipes" :key="row.recipe_slug">
            <td>{{ row.recipe_name }}</td>
            <td>{{ row.existing_inventory_allocated }}</td>
            <td>{{ row.new_production_daycare_portions }}</td>
            <td>{{ row.new_production_allocated_to_week }}</td>
            <td>{{ row.leftover_portions_to_inventory }}</td>
          </tr>
        </tbody>
      </v-table>
      <p class="mt-2 mb-0 text-medium-emphasis">
        {{ $t("daycare.prep.completion-preview-leftover-note", preview.summary.leftover_portions_to_inventory) }}
      </p>
    </template>

    <template v-else-if="phase === 'blocked'">
      <v-alert type="warning" variant="tonal" density="comfortable">
        <div class="font-weight-medium">
          {{ $t("daycare.prep.blockers-heading") }}
        </div>
        <ul>
          <li v-for="(blocker, index) in blockers" :key="index">
            {{ blocker }}
          </li>
        </ul>
      </v-alert>
    </template>

    <p v-else-if="phase === 'not-planned'">
      {{ $t("daycare.prep.completion-not-planned") }}
    </p>

    <DaycarePrepReceipt
      v-else-if="phase === 'receipt' && receipt"
      :committed-at="receipt.committedAt"
      :summary="receipt.summary"
      :recipes="receipt.recipes"
    />

    <DaycareErrorState v-else-if="phase === 'error'" :error="errorState" />
  </BaseDialog>
</template>

<script setup lang="ts">
import DaycareErrorState from "./DaycareErrorState.vue";
import DaycarePrepReceipt from "./DaycarePrepReceipt.vue";
import { newIdempotencyKey } from "~/lib/api/user/daycare";
import type { DaycareUiError } from "~/composables/daycare/use-daycare";
import type { CommitReceipt, CommitReference, CompleteRequest, CompletionPreview, CompletionPreviewRecipe, CommitReceiptSummary } from "~/lib/api/types/daycare";

interface Props {
  modelValue: boolean;
  /** True when the week is already committed — skips the preview step and fetches the persisted receipt instead. */
  committed: boolean;
  committedAt: string | null;
  getCompletionPreview: () => Promise<{ data: CompletionPreview | null; error: DaycareUiError | null }>;
  completeWeek: (payload: CompleteRequest, idempotencyKey: string) => Promise<{ data: CommitReceipt | null; error: DaycareUiError | null }>;
}
const props = defineProps<Props>();

const emit = defineEmits<{
  "update:modelValue": [boolean];
  "completed": [CommitReceipt];
}>();

const i18n = useI18n();

type Phase = "loading" | "preview" | "blocked" | "not-planned" | "submitting" | "receipt" | "error";
const phase = ref<Phase>("loading");
const preview = ref<CompletionPreview | null>(null);
const blockers = ref<string[]>([]);
const receipt = ref<{ committedAt: string | null; summary: CommitReceiptSummary | null; recipes: CompletionPreviewRecipe[] | null } | null>(null);
const errorState = ref<DaycareUiError>({ status: null, code: null, message: null, kind: "unknown", details: null });

let idempotencyKey = newIdempotencyKey();

const dialogTitle = computed(() => {
  if (phase.value === "receipt") return i18n.t("daycare.prep.receipt-title");
  return i18n.t("daycare.prep.completion-dialog-title");
});

function handleFailure(error: DaycareUiError) {
  if (error.code === "prep_blocked") {
    blockers.value = (error.details?.blockers as string[] | undefined) ?? [];
    phase.value = "blocked";
    return;
  }
  if (error.status === 404) {
    phase.value = "not-planned";
    return;
  }
  errorState.value = error;
  phase.value = "error";
}

async function attemptComplete() {
  phase.value = "submitting";
  const result = await props.completeWeek({}, idempotencyKey);
  if (result.data) {
    receipt.value = {
      committedAt: result.data.committed_at,
      summary: result.data.summary,
      recipes: result.data.completion_preview?.recipes ?? null,
    };
    phase.value = "receipt";
    emit("completed", result.data);
    return;
  }
  if (result.error?.code === "week_committed") {
    const commitReference = result.error.details as unknown as CommitReference | null;
    receipt.value = {
      committedAt: commitReference?.committed_at ?? props.committedAt,
      summary: commitReference?.summary ?? null,
      recipes: null,
    };
    phase.value = "receipt";
    return;
  }
  if (result.error) {
    handleFailure(result.error);
  }
}

async function loadPreview() {
  phase.value = "loading";
  const result = await props.getCompletionPreview();
  if (result.data) {
    preview.value = result.data;
    phase.value = "preview";
    return;
  }
  if (result.error) {
    handleFailure(result.error);
  }
}

async function arm() {
  idempotencyKey = newIdempotencyKey();
  preview.value = null;
  receipt.value = null;
  blockers.value = [];
  if (props.committed) {
    await attemptComplete();
  }
  else {
    await loadPreview();
  }
}

watch(() => props.modelValue, (open) => {
  if (open) arm();
}, { immediate: true });
</script>
