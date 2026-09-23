<template>
  <BaseDialog
    :model-value="modelValue"
    :title="$t('daycare.inventory.make-this-title')"
    :can-submit="true"
    :keep-open="true"
    :loading="saving"
    :submit-text="$t('daycare.inventory.make-this-submit')"
    :cancel-text="$t('general.cancel')"
    :submit-disabled="!formValid"
    @update:model-value="$emit('update:modelValue', $event)"
    @submit="onSubmit"
  >
    <v-form>
      <v-text-field
        v-model.number="servings"
        type="number"
        min="0"
        step="1"
        density="compact"
        :label="$t('daycare.inventory.make-this-servings')"
        autofocus
      />

      <v-menu v-model="madeDateMenu" :close-on-content-click="false">
        <template #activator="{ props: activatorProps }">
          <v-text-field
            :model-value="madeDate"
            :label="$t('daycare.inventory.make-this-made-date')"
            readonly
            density="compact"
            class="mt-2"
            v-bind="activatorProps"
          />
        </template>
        <v-date-picker
          :model-value="madeDatePickerDate"
          hide-header
          @update:model-value="onPickMadeDate"
        />
      </v-menu>

      <v-select
        v-model="storage"
        :items="STORAGE_OPTIONS"
        item-title="title"
        item-value="value"
        density="compact"
        class="mt-2"
        :label="$t('daycare.inventory.make-this-storage')"
      />

      <v-menu v-model="useByMenu" :close-on-content-click="false">
        <template #activator="{ props: activatorProps }">
          <v-text-field
            :model-value="useBy ?? ''"
            :label="$t('daycare.inventory.make-this-use-by')"
            readonly
            density="compact"
            class="mt-2"
            v-bind="activatorProps"
          />
        </template>
        <v-date-picker
          :model-value="useByPickerDate"
          hide-header
          @update:model-value="onPickUseBy"
        />
      </v-menu>
      <v-btn v-if="useBy" variant="text" size="small" class="px-0" @click="clearUseBy">
        {{ $t("general.clear") }}
      </v-btn>

      <DaycareErrorState v-if="errorState" class="mt-2" :error="errorState" />
    </v-form>
  </BaseDialog>
</template>

<script setup lang="ts">
import { formatISO } from "date-fns";
import DaycareErrorState from "./DaycareErrorState.vue";
import { newIdempotencyKey } from "~/lib/api/user/daycare";
import type { DaycareUiError } from "~/composables/daycare/use-daycare";
import type { Lot, LotCreate, StorageLocation } from "~/lib/api/types/daycare";

interface Props {
  modelValue: boolean;
  createLot: (payload: Omit<LotCreate, "recipe_slug">, idempotencyKey?: string) => Promise<{ data: Lot | null; error: DaycareUiError | null }>;
}
const props = defineProps<Props>();

const emit = defineEmits<{
  "update:modelValue": [boolean];
  "saved": [Lot];
}>();

const i18n = useI18n();

const STORAGE_OPTIONS = (["freezer", "refrigerator", "shelf_stable", "other"] as StorageLocation[])
  .map(value => ({ value, title: i18n.t(`daycare.inventory.storage-${value}`) }));

function today(): string {
  return formatISO(new Date(), { representation: "date" });
}

const servings = ref<number | null>(null);
const madeDate = ref<string>(today());
const madeDateMenu = ref(false);
const storage = ref<StorageLocation>("freezer");
const useBy = ref<string | null>(null);
const useByMenu = ref(false);
const saving = ref(false);
const errorState = ref<DaycareUiError | null>(null);
/** Minted once per dialog open, reused on every retry within that open so a repeat tap after a failed
 * submit replays rather than creates a second lot. */
let idempotencyKey = newIdempotencyKey();

const formValid = computed(() => typeof servings.value === "number" && Number.isFinite(servings.value) && servings.value > 0);

const madeDatePickerDate = computed<Date>(() => new Date(`${madeDate.value}T00:00:00`));
const useByPickerDate = computed<Date | null>(() => (useBy.value ? new Date(`${useBy.value}T00:00:00`) : null));

function onPickMadeDate(value: unknown) {
  const date = value instanceof Date ? value : new Date(value as string);
  if (Number.isNaN(date.getTime())) return;
  madeDate.value = formatISO(date, { representation: "date" });
  madeDateMenu.value = false;
}

function onPickUseBy(value: unknown) {
  const date = value instanceof Date ? value : new Date(value as string);
  if (Number.isNaN(date.getTime())) return;
  useBy.value = formatISO(date, { representation: "date" });
  useByMenu.value = false;
}

function clearUseBy() {
  useBy.value = null;
  useByMenu.value = false;
}

function reset() {
  servings.value = null;
  madeDate.value = today();
  storage.value = "freezer";
  useBy.value = null;
  saving.value = false;
  errorState.value = null;
  madeDateMenu.value = false;
  useByMenu.value = false;
  idempotencyKey = newIdempotencyKey();
}

watch(() => props.modelValue, (open) => {
  if (open) reset();
}, { immediate: true });

async function onSubmit() {
  if (!formValid.value) {
    errorState.value = {
      status: null,
      code: null,
      message: i18n.t("daycare.inventory.make-this-servings-invalid"),
      kind: "validation",
      details: null,
    };
    return;
  }

  saving.value = true;
  errorState.value = null;

  const payload: Omit<LotCreate, "recipe_slug"> = {
    portions: servings.value!,
    made_date: madeDate.value,
    use_by: useBy.value,
    storage: storage.value,
  };
  const result = await props.createLot(payload, idempotencyKey);
  saving.value = false;

  if (result.data) {
    emit("saved", result.data);
    emit("update:modelValue", false);
    return;
  }

  errorState.value = result.error;
}
</script>
