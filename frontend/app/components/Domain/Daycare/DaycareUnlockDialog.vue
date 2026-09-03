<template>
  <BaseDialog
    :model-value="modelValue"
    :title="dialogTitle"
    :loading="phase === 'loading' || phase === 'submitting'"
    :can-submit="phase === 'preview'"
    :submit-disabled="!canConfirm"
    :submit-text="$t('daycare.plan.unlock-confirm')"
    :cancel-text="phase === 'preview' ? undefined : $t('general.close')"
    keep-open
    @update:model-value="$emit('update:modelValue', $event)"
    @submit="attemptUnlock"
  >
    <v-skeleton-loader v-if="phase === 'loading' || phase === 'submitting'" type="list-item-three-line" />

    <template v-else-if="phase === 'preview' && preview">
      <p class="mb-2">
        {{ $t("daycare.plan.unlock-preview-intro") }}
      </p>
      <ul class="mb-2">
        <li>{{ lotsRemovedText(preview.created_lots) }}</li>
        <li v-if="preview.consumed_lots_restored.length">
          {{ lotsRestoredText(preview.consumed_lots_restored) }}
        </li>
      </ul>

      <template v-if="preview.reservations_released.length">
        <div class="font-weight-medium mb-1">
          {{ $t("daycare.plan.unlock-preview-reservations-heading") }}
        </div>
        <ul class="mb-2">
          <li v-for="(release, index) in preview.reservations_released" :key="index">
            {{ $t("daycare.plan.unlock-preview-reservation-line", { week: release.week, recipe: release.recipe, portions: release.portions }) }}
          </li>
        </ul>
      </template>

      <v-alert v-if="preview.downstream_weeks_marked_stale.length" type="warning" variant="tonal" density="comfortable" class="mb-2">
        {{ $t("daycare.plan.unlock-preview-downstream-warning", { weeks: downstreamWeeksText(preview.downstream_weeks_marked_stale) }) }}
      </v-alert>

      <template v-if="!preview.safe">
        <v-alert type="warning" variant="tonal" density="comfortable" class="mb-2">
          <div class="font-weight-medium">
            {{ $t("daycare.plan.unlock-unsafe-heading") }}
          </div>
          <ul>
            <li v-for="(unsafeReason, index) in preview.reasons" :key="index">
              {{ unsafeReason }}
            </li>
          </ul>
        </v-alert>
        <v-textarea
          v-model="reason"
          :label="$t('daycare.plan.unlock-reason-label')"
          rows="2"
          auto-grow
        />
        <v-checkbox
          v-model="acknowledged"
          :label="$t('daycare.plan.unlock-acknowledge-label')"
        />
      </template>
    </template>

    <p v-else-if="phase === 'not-available'">
      {{ $t("daycare.plan.unlock-not-available") }}
    </p>

    <template v-else-if="phase === 'receipt' && receipt">
      <v-alert type="success" variant="tonal" density="comfortable" class="mb-2">
        {{ $t("daycare.plan.unlock-success", { date: formattedUnlockedAt }) }}
      </v-alert>
      <template v-if="receipt.created_lots || receipt.consumed_lots_restored">
        <ul class="mb-2">
          <li>{{ lotsRemovedText(receipt.created_lots ?? []) }}</li>
          <li v-if="receipt.consumed_lots_restored?.length">
            {{ lotsRestoredText(receipt.consumed_lots_restored) }}
          </li>
        </ul>
      </template>
      <p v-else class="mb-2 text-medium-emphasis">
        {{ $t("daycare.plan.unlock-receipt-detail-unavailable") }}
      </p>
      <v-alert v-if="downstreamWeeks.length" type="info" variant="tonal" density="comfortable">
        {{ $t("daycare.plan.unlock-regenerate-prompt", { weeks: downstreamWeeksText(downstreamWeeks) }) }}
      </v-alert>
    </template>

    <DaycareErrorState v-else-if="phase === 'error'" :error="errorState" />
  </BaseDialog>
</template>

<script setup lang="ts">
import DaycareErrorState from "./DaycareErrorState.vue";
import { newIdempotencyKey } from "~/lib/api/user/daycare";
import { unlockPlanFromError } from "~/composables/daycare/use-daycare";
import type { DaycareUiError } from "~/composables/daycare/use-daycare";
import type { UnlockPreview, UnlockReceipt, UnlockRequest } from "~/lib/api/types/daycare";

interface Props {
  modelValue: boolean;
  getUnlockPreview: () => Promise<{ data: UnlockPreview | null; error: DaycareUiError | null }>;
  unlockWeek: (payload: UnlockRequest, idempotencyKey: string) => Promise<{ data: UnlockReceipt | null; error: DaycareUiError | null }>;
}
const props = defineProps<Props>();

const emit = defineEmits<{
  "update:modelValue": [boolean];
  "unlocked": [UnlockReceipt];
}>();

const i18n = useI18n();

type Phase = "loading" | "preview" | "not-available" | "submitting" | "receipt" | "error";
const phase = ref<Phase>("loading");
const preview = ref<UnlockPreview | null>(null);
const receipt = ref<UnlockReceipt | null>(null);
const reason = ref("");
const acknowledged = ref(false);
const errorState = ref<DaycareUiError>({ status: null, code: null, message: null, kind: "unknown", details: null });

let idempotencyKey = newIdempotencyKey();

const dialogTitle = computed(() => {
  if (phase.value === "receipt") return i18n.t("daycare.plan.unlock-receipt-title");
  return i18n.t("daycare.plan.unlock-dialog-title");
});

const canConfirm = computed(() => {
  if (!preview.value) return false;
  if (preview.value.safe) return true;
  return reason.value.trim().length > 0 && acknowledged.value;
});

const downstreamWeeks = computed(() => receipt.value?.downstream_weeks_marked_stale ?? preview.value?.downstream_weeks_marked_stale ?? []);

const formattedUnlockedAt = computed(() => (receipt.value?.unlocked_at ? new Date(receipt.value.unlocked_at).toLocaleString() : ""));

function downstreamWeeksText(weeks: string[]) {
  return weeks.join(", ");
}

/**
 * Sums a `portions` field across lot entries when every entry carries one — the contract only
 * pins down `reservations_released`'s shape, so a lot entry might be a bare id with no portions
 * figure. Falls back to null (render a bare count) rather than a misleadingly partial total.
 */
function totalPortions(lots: Record<string, unknown>[]): number | null {
  if (!lots.length) return 0;
  let total = 0;
  for (const lot of lots) {
    const value = lot.portions;
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    total += value;
  }
  return total;
}

function lotsRemovedText(lots: Record<string, unknown>[]) {
  const portions = totalPortions(lots);
  return portions != null
    ? i18n.t("daycare.plan.unlock-preview-lots-removed-portions", { count: lots.length, portions })
    : i18n.t("daycare.plan.unlock-preview-lots-removed", lots.length);
}

function lotsRestoredText(lots: Record<string, unknown>[]) {
  const portions = totalPortions(lots);
  return portions != null
    ? i18n.t("daycare.plan.unlock-preview-lots-restored-portions", { count: lots.length, portions })
    : i18n.t("daycare.plan.unlock-preview-lots-restored", lots.length);
}

function handleFailure(error: DaycareUiError) {
  if (error.status === 404 || error.status === 405) {
    phase.value = "not-available";
    return;
  }
  errorState.value = error;
  phase.value = "error";
}

async function loadPreview() {
  phase.value = "loading";
  const result = await props.getUnlockPreview();
  if (result.data) {
    preview.value = result.data;
    phase.value = "preview";
    return;
  }
  if (result.error) {
    handleFailure(result.error);
  }
}

async function attemptUnlock() {
  if (!canConfirm.value) return;
  const forced = !!preview.value && !preview.value.safe;
  phase.value = "submitting";
  const result = await props.unlockWeek(
    { reason: forced ? reason.value.trim() : null, force: forced },
    idempotencyKey,
  );
  if (result.data) {
    receipt.value = result.data;
    phase.value = "receipt";
    emit("unlocked", result.data);
    return;
  }
  if (result.error?.code === "unlock_unsafe") {
    // The sidecar refused an unforced unlock and sent the latest plan back in `details` —
    // adopt it so reasons/downstream-weeks reflect current state, and keep asking for a
    // reason + acknowledgement before retrying with force:true. A retry here sends a
    // materially different payload (reason text, force:false -> true) than the attempt that
    // just failed, so it's a distinct logical mutation, not a replay — mint a fresh key
    // (mirrors updateLot's "a corrected resubmission is a distinct mutation" precedent).
    idempotencyKey = newIdempotencyKey();
    const fresh = unlockPlanFromError(result.error);
    if (fresh) preview.value = fresh;
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
  reason.value = "";
  acknowledged.value = false;
  await loadPreview();
}

watch(() => props.modelValue, (open) => {
  if (open) arm();
}, { immediate: true });
</script>
