<template>
  <BaseDialog
    :model-value="modelValue"
    :title="dialogTitle"
    :loading="phase === 'loading'"
    :can-submit="phase === 'preview'"
    :submit-text="$t('daycare.recipe.writeback-apply')"
    :submit-disabled="phase !== 'preview' || !preview?.can_apply || applying"
    :cancel-text="phase === 'preview' ? undefined : $t('general.close')"
    keep-open
    @update:model-value="$emit('update:modelValue', $event)"
    @submit="onApply"
  >
    <v-skeleton-loader v-if="phase === 'loading'" type="list-item-three-line" />

    <DaycareErrorState v-else-if="phase === 'error'" :error="errorState" />

    <template v-else-if="phase === 'preview' && preview">
      <v-alert v-if="!preview.fingerprint_ok" type="warning" variant="tonal" density="comfortable" class="mb-3">
        {{ preview.fingerprint_reason ?? $t("daycare.recipe.writeback-fingerprint-stale") }}
      </v-alert>

      <v-alert v-if="applyErrorMessage" type="error" variant="tonal" density="comfortable" class="mb-3">
        {{ applyErrorMessage }}
      </v-alert>

      <p v-if="!preview.rows.length" class="mb-3">
        {{ $t("daycare.recipe.writeback-no-rows") }}
      </p>
      <v-table v-else density="compact" class="mb-3">
        <thead>
          <tr>
            <th>{{ $t("daycare.recipe.writeback-col-before") }}</th>
            <th>{{ $t("daycare.recipe.writeback-col-after") }}</th>
            <th>{{ $t("daycare.recipe.writeback-col-status") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in preview.rows" :key="row.index">
            <td>{{ formatIngredient(row.before) }}</td>
            <td>{{ formatIngredient(row.after) }}</td>
            <td>
              <v-chip size="small" :color="statusColor(row.status)">
                {{ $t(`daycare.recipe.writeback-status-${row.status}`) }}
              </v-chip>
            </td>
          </tr>
        </tbody>
      </v-table>

      <template v-if="preview.creations.length">
        <p class="font-weight-medium mb-1">
          {{ $t("daycare.recipe.writeback-creations-heading") }}
        </p>
        <ul class="mb-3">
          <li v-for="(creation, index) in preview.creations" :key="index">
            {{ $t(`daycare.recipe.writeback-creation-${creation.kind}`, { name: creation.name }) }}
          </li>
        </ul>
      </template>

      <v-alert v-if="preview.ambiguities.length" type="warning" variant="tonal" density="comfortable" class="mb-3">
        <div class="font-weight-medium">
          {{ $t("daycare.recipe.writeback-ambiguities-heading") }}
        </div>
        <ul>
          <li v-for="(ambiguity, index) in preview.ambiguities" :key="index">
            {{ $t(`daycare.recipe.writeback-ambiguity-${ambiguity.kind}`, { name: ambiguity.name, candidates: ambiguity.candidates.join(", ") }) }}
          </li>
        </ul>
      </v-alert>

      <template v-if="preview.skipped.length">
        <p class="font-weight-medium mb-1">
          {{ $t("daycare.recipe.writeback-skipped-heading") }}
        </p>
        <ul class="mb-3">
          <li v-for="skip in preview.skipped" :key="skip.index">
            {{ skip.reason }}
          </li>
        </ul>
      </template>

      <v-alert v-if="!preview.can_apply" type="info" variant="tonal" density="comfortable">
        {{ blockedReason }}
      </v-alert>
    </template>

    <template v-else-if="phase === 'receipt' && receipt">
      <v-alert type="success" variant="tonal" density="comfortable" class="mb-3">
        {{ $t("daycare.recipe.writeback-applied", { count: receipt.rows_written }) }}
      </v-alert>
      <p class="mb-1">
        <span class="font-weight-medium">{{ $t("daycare.recipe.writeback-receipt-plain") }}:</span>
        {{ receipt.rows_plain }}
      </p>
      <p v-if="receipt.foods_created.length" class="mb-1">
        <span class="font-weight-medium">{{ $t("daycare.recipe.writeback-receipt-foods-created") }}:</span>
        {{ receipt.foods_created.join(", ") }}
      </p>
      <p v-if="receipt.units_created.length" class="mb-1">
        <span class="font-weight-medium">{{ $t("daycare.recipe.writeback-receipt-units-created") }}:</span>
        {{ receipt.units_created.join(", ") }}
      </p>
      <p class="mb-3">
        <span class="font-weight-medium">{{ $t("daycare.recipe.writeback-receipt-verified") }}:</span>
        {{ receipt.verified ? $t("general.yes") : $t("general.no") }}
      </p>

      <v-alert v-if="undoErrorMessage" type="error" variant="tonal" density="comfortable" class="mb-3">
        {{ undoErrorMessage }}
      </v-alert>

      <v-btn
        variant="text"
        :disabled="undoing"
        :loading="undoing"
        @click="confirmUndoOpen = true"
      >
        {{ $t("daycare.recipe.writeback-undo") }}
      </v-btn>

      <BaseDialog
        v-model="confirmUndoOpen"
        :title="$t('daycare.recipe.writeback-undo-confirm-title')"
        can-confirm
        @confirm="onUndo"
      >
        <p>{{ $t("daycare.recipe.writeback-undo-confirm-body") }}</p>
      </BaseDialog>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import DaycareErrorState from "./DaycareErrorState.vue";
import { newIdempotencyKey } from "~/lib/api/user/daycare";
import type { DaycareUiError } from "~/composables/daycare/use-daycare";
import type {
  IngredientWritebackIngredient,
  IngredientWritebackPreview,
  IngredientWritebackReceipt,
  IngredientWritebackRowStatus,
  IngredientWritebackUndoResult,
} from "~/lib/api/types/daycare";

interface Props {
  modelValue: boolean;
  getPreview: () => Promise<{ data: IngredientWritebackPreview | null; error: DaycareUiError | null }>;
  applyWriteback: (idempotencyKey: string) => Promise<{ data: IngredientWritebackReceipt | null; error: DaycareUiError | null }>;
  undoWriteback: (idempotencyKey: string) => Promise<{ data: IngredientWritebackUndoResult | null; error: DaycareUiError | null }>;
}
const props = defineProps<Props>();

const emit = defineEmits<{
  "update:modelValue": [boolean];
  "applied": [IngredientWritebackReceipt];
  "undone": [IngredientWritebackUndoResult];
}>();

const i18n = useI18n();

type Phase = "loading" | "preview" | "receipt" | "error";
const phase = ref<Phase>("loading");
const preview = ref<IngredientWritebackPreview | null>(null);
const receipt = ref<IngredientWritebackReceipt | null>(null);
const errorState = ref<DaycareUiError>({ status: null, code: null, message: null, kind: "unknown", details: null });
const applying = ref(false);
const applyErrorMessage = ref<string | null>(null);
const undoing = ref(false);
const undoErrorMessage = ref<string | null>(null);
const confirmUndoOpen = ref(false);

let applyKey = newIdempotencyKey();
let undoKey = newIdempotencyKey();

const dialogTitle = computed(() => {
  if (phase.value === "receipt") return i18n.t("daycare.recipe.writeback-receipt-title");
  return i18n.t("daycare.recipe.writeback-dialog-title");
});

/** "quantity unit food — note", falling back to the original text, then the note alone, then "(empty)". */
function formatIngredient(ingredient: IngredientWritebackIngredient): string {
  const parts = [ingredient.quantity, ingredient.unit, ingredient.food].filter((p): p is string | number => p != null && p !== "");
  const structured = parts.join(" ");
  if (structured) {
    return ingredient.note ? `${structured} (${ingredient.note})` : structured;
  }
  return ingredient.original_text || ingredient.note || i18n.t("daycare.recipe.writeback-empty-ingredient");
}

function statusColor(status: IngredientWritebackRowStatus): string | undefined {
  if (status === "ambiguous") return "warning";
  if (status === "structured") return "success";
  return undefined;
}

/** Explains, in priority order, why Apply is disabled — mirrors the gates the sidecar folds into `can_apply`. */
const blockedReason = computed(() => {
  const p = preview.value;
  if (!p) return null;
  if (!p.write_enabled) return i18n.t("daycare.recipe.writeback-blocked-write-disabled");
  if (!p.enabled_global) return i18n.t("daycare.recipe.writeback-blocked-global-disabled");
  if (!p.enabled_recipe) return i18n.t("daycare.recipe.writeback-blocked-recipe-disabled");
  if (!p.fingerprint_ok) return i18n.t("daycare.recipe.writeback-blocked-fingerprint");
  if (p.ambiguities.length) return i18n.t("daycare.recipe.writeback-blocked-ambiguous");
  return i18n.t("daycare.recipe.writeback-blocked-unknown");
});

function errorMessage(error: DaycareUiError): string {
  return error.message ?? i18n.t(`daycare.errors.${error.kind}`);
}

async function loadPreview() {
  phase.value = "loading";
  applyErrorMessage.value = null;
  applyKey = newIdempotencyKey();
  undoKey = newIdempotencyKey();
  const result = await props.getPreview();
  if (result.data) {
    preview.value = result.data;
    if (result.data.receipt) {
      receipt.value = result.data.receipt;
      phase.value = "receipt";
    }
    else {
      phase.value = "preview";
    }
    return;
  }
  if (result.error) {
    errorState.value = result.error;
    phase.value = "error";
  }
}

async function onApply() {
  if (!preview.value?.can_apply || applying.value) return;
  applying.value = true;
  applyErrorMessage.value = null;
  const result = await props.applyWriteback(applyKey);
  applying.value = false;
  if (result.data) {
    receipt.value = result.data;
    phase.value = "receipt";
    emit("applied", result.data);
    return;
  }
  if (result.error?.code === "recipe_edited") {
    // The recipe changed since the preview was generated — reload it rather than retrying blind.
    await loadPreview();
    return;
  }
  if (result.error) {
    applyErrorMessage.value = errorMessage(result.error);
  }
}

async function onUndo() {
  undoing.value = true;
  undoErrorMessage.value = null;
  const result = await props.undoWriteback(undoKey);
  undoing.value = false;
  if (result.data) {
    emit("undone", result.data);
    await loadPreview();
    return;
  }
  if (result.error) {
    undoErrorMessage.value = errorMessage(result.error);
  }
}

function arm() {
  preview.value = null;
  receipt.value = null;
  applyErrorMessage.value = null;
  undoErrorMessage.value = null;
  confirmUndoOpen.value = false;
  void loadPreview();
}

watch(() => props.modelValue, (open) => {
  if (open) arm();
}, { immediate: true });
</script>
