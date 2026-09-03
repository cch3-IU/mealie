<template>
  <BaseDialog
    :model-value="modelValue"
    :title="$t('daycare.inventory.edit-lot-title')"
    :can-submit="true"
    :keep-open="true"
    :loading="saving"
    :submit-text="$t('general.save')"
    :cancel-text="$t('general.cancel')"
    :submit-disabled="!formValid"
    @update:model-value="$emit('update:modelValue', $event)"
    @submit="onSubmit"
  >
    <v-form>
      <v-text-field
        v-model.number="portions"
        type="number"
        min="0"
        density="compact"
        :label="$t('daycare.inventory.lot-portions')"
      />

      <v-menu v-model="dateMenu" :close-on-content-click="false">
        <template #activator="{ props: activatorProps }">
          <v-text-field
            :model-value="useBy ?? ''"
            :label="$t('daycare.inventory.lot-use-by')"
            readonly
            density="compact"
            class="mt-2"
            v-bind="activatorProps"
          />
        </template>
        <v-date-picker
          :model-value="pickerDate"
          hide-header
          @update:model-value="onPickDate"
        />
      </v-menu>
      <v-btn v-if="useBy" variant="text" size="small" class="px-0" @click="clearUseBy">
        {{ $t("general.clear") }}
      </v-btn>

      <p v-if="unavailable" class="text-medium-emphasis mt-2">
        {{ $t("daycare.inventory.edit-unavailable") }}
      </p>
      <DaycareErrorState v-else-if="errorState" class="mt-2" :error="errorState" />
    </v-form>
  </BaseDialog>
</template>

<script setup lang="ts">
import { formatISO } from "date-fns";
import DaycareErrorState from "./DaycareErrorState.vue";
import type { DaycareUiError } from "~/composables/daycare/use-daycare";
import type { Lot, LotPatch } from "~/lib/api/types/daycare";

interface Props {
  modelValue: boolean;
  lot: Lot | null;
  updateLot: (lotId: number, payload: LotPatch) => Promise<{ data: Lot | null; error: DaycareUiError | null }>;
}
const props = defineProps<Props>();

const emit = defineEmits<{
  "update:modelValue": [boolean];
  "saved": [Lot];
}>();

const i18n = useI18n();

const portions = ref<number | null>(null);
const useBy = ref<string | null>(null);
const dateMenu = ref(false);
const saving = ref(false);
const errorState = ref<DaycareUiError | null>(null);
const unavailable = ref(false);

const formValid = computed(() => typeof portions.value === "number" && Number.isFinite(portions.value) && portions.value >= 0);

const pickerDate = computed<Date | null>(() => (useBy.value ? new Date(`${useBy.value}T00:00:00`) : null));

function onPickDate(value: unknown) {
  const date = value instanceof Date ? value : new Date(value as string);
  if (Number.isNaN(date.getTime())) return;
  useBy.value = formatISO(date, { representation: "date" });
  dateMenu.value = false;
}

function clearUseBy() {
  useBy.value = null;
  dateMenu.value = false;
}

function reset() {
  portions.value = props.lot?.portions_remaining ?? null;
  useBy.value = props.lot?.use_by ?? null;
  saving.value = false;
  errorState.value = null;
  unavailable.value = false;
  dateMenu.value = false;
}

watch(() => props.modelValue, (open) => {
  if (open) reset();
}, { immediate: true });

async function onSubmit() {
  if (!props.lot) return;

  if (!formValid.value) {
    unavailable.value = false;
    errorState.value = {
      status: null,
      code: null,
      message: i18n.t("daycare.inventory.portions-invalid"),
      kind: "validation",
      details: null,
    };
    return;
  }

  saving.value = true;
  errorState.value = null;
  unavailable.value = false;

  const payload: LotPatch = {
    portions_remaining: portions.value!,
    use_by: useBy.value,
  };
  const result = await props.updateLot(props.lot.id, payload);
  saving.value = false;

  if (result.data) {
    emit("saved", result.data);
    emit("update:modelValue", false);
    return;
  }

  if (result.error?.status === 404 || result.error?.status === 405) {
    unavailable.value = true;
    return;
  }

  errorState.value = result.error;
}
</script>
