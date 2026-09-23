<template>
  <div class="daycare-made-inventory">
    <div class="text-title-medium mt-4 mb-2">
      {{ $t("daycare.inventory.made-this-heading") }}
    </div>
    <v-text-field
      v-model.number="servings"
      type="number"
      min="0"
      step="1"
      density="compact"
      :label="$t('daycare.inventory.make-this-servings')"
      :hint="$t('daycare.inventory.made-this-servings-hint')"
      persistent-hint
      :error-messages="servingsInvalid ? [$t('daycare.inventory.make-this-servings-invalid')] : []"
    />
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
    <v-btn v-if="useBy" variant="text" size="small" class="px-0" @click="useBy = null">
      {{ $t("general.clear") }}
    </v-btn>
  </div>
</template>

<script setup lang="ts">
import { formatISO } from "date-fns";
import { STORAGE_LOCATIONS } from "~/composables/daycare/use-made-this-inventory";
import type { StorageLocation } from "~/lib/api/types/daycare";

defineProps<{ servingsInvalid?: boolean }>();

const servings = defineModel<number | null>("servings", { default: null });
const storage = defineModel<StorageLocation>("storage", { default: "freezer" });
const useBy = defineModel<string | null>("useBy", { default: null });

const i18n = useI18n();
const STORAGE_OPTIONS = STORAGE_LOCATIONS.map(value => ({ value, title: i18n.t(`daycare.inventory.storage-${value}`) }));

const useByMenu = ref(false);
const useByPickerDate = computed<Date | null>(() => (useBy.value ? new Date(`${useBy.value}T00:00:00`) : null));

function onPickUseBy(value: unknown) {
  const date = value instanceof Date ? value : new Date(value as string);
  if (Number.isNaN(date.getTime())) return;
  useBy.value = formatISO(date, { representation: "date" });
  useByMenu.value = false;
}
</script>
