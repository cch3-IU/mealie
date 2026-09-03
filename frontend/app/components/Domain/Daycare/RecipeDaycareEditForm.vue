<template>
  <v-form @submit.prevent="onSubmit">
    <v-switch
      v-model="enabled"
      :label="enabled ? $t('daycare.recipe.enabled') : $t('daycare.recipe.disabled')"
      density="compact"
      hide-details
    />
    <v-text-field
      v-model.number="portionsPerBatch"
      type="number"
      min="1"
      density="compact"
      :label="$t('daycare.recipe.portions-per-batch')"
      class="mt-2"
    />

    <template v-if="record.classified">
      <p class="font-weight-medium mt-2 mb-1">
        {{ $t("daycare.recipe.slots-roles") }}
      </p>
      <div v-for="slot in SLOTS" :key="slot" class="d-flex align-center flex-wrap ga-2 mb-1">
        <span class="text-body-2" style="min-width: 80px;">{{ $t(`daycare.recipe.slot-${slot}`) }}</span>
        <v-checkbox
          v-for="role in ROLES"
          :key="role"
          :model-value="slotRoles[slot]?.includes(role) ?? false"
          :label="$t(`daycare.recipe.role-${role}`)"
          density="compact"
          hide-details
          class="mr-2"
          @update:model-value="(checked: boolean) => toggleRole(slot, role, checked)"
        />
      </div>

      <v-switch
        v-model="batchable"
        :label="$t('daycare.recipe.batchable')"
        density="compact"
        hide-details
        class="mt-2"
      />
      <v-select
        v-model="freezable"
        :items="FREEZABLE_OPTIONS"
        item-title="title"
        item-value="value"
        density="compact"
        :label="$t('daycare.recipe.freezable')"
        class="mt-2"
      />
      <v-select
        v-model="preferredStorage"
        :items="STORAGE_OPTIONS"
        item-title="title"
        item-value="value"
        density="compact"
        :label="$t('daycare.recipe.preferred-storage')"
        class="mt-2"
      />
    </template>
    <p v-else class="text-caption text-medium-emphasis mt-2">
      {{ $t("daycare.recipe.edit-limited-notice") }}
    </p>

    <v-btn
      type="submit"
      color="primary"
      class="mt-3"
      size="small"
      :loading="saving"
      :disabled="saving"
    >
      {{ $t("daycare.recipe.save") }}
    </v-btn>
  </v-form>
</template>

<script setup lang="ts">
import { slotRolesToUsesPatch, usesToSlotRoles, type SlotRoles } from "~/composables/daycare/use-recipe-daycare";
import type { Freezability, PreferredBatchStorage, RecipeDaycare, RecipeDaycareUpdate, Role, Slot } from "~/lib/api/types/daycare";

interface Props {
  record: RecipeDaycare;
  saving: boolean;
}
const props = defineProps<Props>();
const emit = defineEmits<{ save: [payload: RecipeDaycareUpdate] }>();

const i18n = useI18n();

const SLOTS: Slot[] = ["breakfast", "lunch", "snack"];
const ROLES: Role[] = ["main", "produce", "addon"];
const FREEZABLE_OPTIONS = (["yes", "no", "uncertain"] as Freezability[]).map(value => ({ value, title: i18n.t(`daycare.recipe.freezable-${value}`) }));
const STORAGE_OPTIONS = (["freezer", "refrigerator", "fresh", "shelf_stable", "unknown"] as PreferredBatchStorage[]).map(value => ({ value, title: i18n.t(`daycare.recipe.storage-${value}`) }));

const enabled = ref(props.record.settings.enabled !== false);
const portionsPerBatch = ref<number | null>(props.record.settings.daycare_portions_per_batch);
const slotRoles = ref<SlotRoles>(usesToSlotRoles(props.record.classification?.uses));
const batchable = ref(props.record.classification?.production.batchable ?? false);
const freezable = ref<Freezability>(props.record.classification?.production.freezable ?? "uncertain");
const preferredStorage = ref<PreferredBatchStorage>(props.record.classification?.production.preferred_batch_storage ?? "unknown");

function toggleRole(slot: Slot, role: Role, checked: boolean) {
  const current = slotRoles.value[slot] ?? [];
  const next = checked ? [...current, role] : current.filter(r => r !== role);
  slotRoles.value = { ...slotRoles.value, [slot]: next };
}

/** `v-model.number` on an emptied field yields `""` (NaN can't round-trip through the modifier), not `null` — the sidecar rejects anything but a number or null. */
function normalizedPortionsPerBatch(): number | null {
  const value = portionsPerBatch.value;
  return typeof value === "number" && !Number.isNaN(value) ? value : null;
}

function onSubmit() {
  const payload: RecipeDaycareUpdate = {
    settings: {
      enabled: enabled.value,
      daycare_portions_per_batch: normalizedPortionsPerBatch(),
    },
  };
  if (props.record.classified) {
    payload.classification = {
      uses: slotRolesToUsesPatch(slotRoles.value),
      production: {
        batchable: batchable.value,
        freezable: freezable.value,
        preferred_batch_storage: preferredStorage.value,
      },
    };
  }
  emit("save", payload);
}
</script>
