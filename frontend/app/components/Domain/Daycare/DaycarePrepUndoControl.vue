<template>
  <div>
    <v-btn
      v-if="!refused"
      :disabled="disabled || submitting"
      :loading="submitting"
      variant="text"
      @click="confirmOpen = true"
    >
      {{ $t("daycare.prep.undo") }}
    </v-btn>
    <v-alert v-if="refused" type="info" variant="tonal" density="comfortable" class="mt-2">
      {{ $t("daycare.prep.undo-refused") }}
    </v-alert>
    <v-alert v-else-if="transientError" type="error" variant="tonal" density="comfortable" class="mt-2">
      {{ transientError }}
    </v-alert>

    <BaseDialog
      v-model="confirmOpen"
      :title="$t('daycare.prep.undo-confirm-title')"
      can-confirm
      @confirm="onConfirm"
    >
      <p>{{ $t("daycare.prep.undo-confirm-body") }}</p>
    </BaseDialog>
  </div>
</template>

<script setup lang="ts">
import type { DaycareUiError } from "~/composables/daycare/use-daycare";
import type { UndoResult } from "~/lib/api/types/daycare";

interface Props {
  disabled: boolean;
  undoCompleteWeek: () => Promise<{ data: UndoResult | null; error: DaycareUiError | null }>;
}
const props = defineProps<Props>();

const emit = defineEmits<{
  undone: [UndoResult];
  refused: [];
}>();

const i18n = useI18n();

const confirmOpen = ref(false);
const submitting = ref(false);
const refused = ref(false);
const transientError = ref<string | null>(null);

async function onConfirm() {
  submitting.value = true;
  transientError.value = null;
  const result = await props.undoCompleteWeek();
  submitting.value = false;
  if (result.data) {
    emit("undone", result.data);
    return;
  }
  if (result.error?.code === "undo_unsafe") {
    refused.value = true;
    emit("refused");
    return;
  }
  if (result.error) {
    transientError.value = result.error.message ?? i18n.t(`daycare.errors.${result.error.kind}`);
  }
}
</script>
