<template>
  <BaseDialog
    :model-value="modelValue"
    :title="dialogTitle"
    :loading="phase === 'loading' || phase === 'submitting'"
    :can-submit="phase === 'preview' && !permanentlyRefused"
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
        <li v-if="preview.consumed_source_lots.length">
          {{ lotsRestoredText(preview.consumed_source_lots) }}
        </li>
      </ul>

      <template v-if="preview.affected_reservations.length">
        <div class="font-weight-medium mb-1">
          {{ $t("daycare.plan.unlock-preview-reservations-heading") }}
        </div>
        <ul class="mb-2">
          <li v-for="(release, index) in preview.affected_reservations" :key="index">
            {{ $t("daycare.plan.unlock-preview-reservation-line", { week: release.week_start, recipe: recipeDisplayName(release.recipe_slug), portions: release.portions }) }}
          </li>
        </ul>
      </template>

      <v-alert v-if="preview.affected_weeks.length" type="warning" variant="tonal" density="comfortable" class="mb-2">
        {{ $t("daycare.plan.unlock-preview-downstream-warning", { weeks: weekListText(preview.affected_weeks) }) }}
      </v-alert>

      <template v-if="permanentlyRefused">
        <v-alert type="error" variant="tonal" density="comfortable" class="mb-2">
          <div class="font-weight-medium">
            {{ $t("daycare.plan.unlock-refused-heading") }}
          </div>
          <ul>
            <li v-for="(reasonLine, index) in preview.reasons" :key="index">
              {{ reasonLine }}
            </li>
          </ul>
        </v-alert>
      </template>
      <template v-else>
        <v-alert v-if="!preview.safe" type="warning" variant="tonal" density="comfortable" class="mb-2">
          <div class="font-weight-medium">
            {{ $t("daycare.plan.unlock-unsafe-heading") }}
          </div>
          <ul>
            <li v-for="(reasonLine, index) in preview.reasons" :key="index">
              {{ reasonLine }}
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
          v-if="!preview.safe"
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
      <ul class="mb-2">
        <li>{{ $t("daycare.plan.unlock-receipt-lots-removed", receipt.deleted_leftover_lot_ids.length) }}</li>
        <li v-if="receipt.restored_source_lots.length">
          {{ lotsRestoredText(receipt.restored_source_lots) }}
        </li>
      </ul>
      <v-alert v-if="downstreamWeeks.length" type="info" variant="tonal" density="comfortable">
        {{ $t("daycare.plan.unlock-regenerate-prompt", { weeks: weekListText(downstreamWeeks) }) }}
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
import type { UnlockCreatedLot, UnlockPreview, UnlockReceipt, UnlockRequest, UnlockSourceLot } from "~/lib/api/types/daycare";

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

/**
 * A consumed source lot no longer exists: the sidecar refuses this unconditionally, even with
 * force (dropping those portions would violate "prepared-food inventory is exact and
 * persistent"), so the dialog must not offer a way to submit at all.
 */
const permanentlyRefused = computed(() => !!preview.value?.missing_source_lot);

const canConfirm = computed(() => {
  if (!preview.value || permanentlyRefused.value) return false;
  if (!reason.value.trim()) return false;
  if (preview.value.safe) return true;
  return acknowledged.value;
});

const downstreamWeeks = computed(() => receipt.value?.downstream_weeks_marked_stale ?? preview.value?.affected_weeks ?? []);

const formattedUnlockedAt = computed(() => (receipt.value?.unlocked_at ? new Date(receipt.value.unlocked_at).toLocaleString() : ""));

function weekListText(weeks: string[]) {
  return weeks.join(", ");
}

/** `<slug>-<slug>` → `Slug Slug` — the sidecar's `affected_reservations` carries only a bare recipe slug, no display name. */
function recipeDisplayName(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function sumPortions(lots: { portions: number }[]) {
  return lots.reduce((total, lot) => total + lot.portions, 0);
}

function lotsRemovedText(lots: UnlockCreatedLot[]) {
  return i18n.t("daycare.plan.unlock-preview-lots-removed", { count: lots.length, portions: sumPortions(lots) });
}

function lotsRestoredText(lots: UnlockSourceLot[] | { lot_id: number; portions: number }[]) {
  return i18n.t("daycare.plan.unlock-preview-lots-restored", { count: lots.length, portions: sumPortions(lots) });
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
    { reason: reason.value.trim(), force: forced },
    idempotencyKey,
  );
  if (result.data) {
    receipt.value = result.data;
    phase.value = "receipt";
    emit("unlocked", result.data);
    return;
  }
  if (result.error?.code === "unlock_unsafe") {
    // The sidecar refused an unforced unlock and sent the latest plan back in `details.plan` —
    // adopt it so reasons/downstream-weeks reflect current state, and keep asking for
    // acknowledgement before retrying with force:true. A retry here sends a materially
    // different payload (force:false -> true) than the attempt that just failed, so it's a
    // distinct logical mutation, not a replay — mint a fresh key (mirrors updateLot's "a
    // corrected resubmission is a distinct mutation" precedent). The sidecar itself never
    // caches error responses for replay either way, so this is a defensive choice, not a
    // required one.
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
