<template>
  <v-container style="max-width: 640px;">
    <BasePageTitle>
      <template #title>
        {{ $t("daycare.settings.title") }}
      </template>
    </BasePageTitle>

    <v-alert
      v-if="!daycare.isAdmin.value"
      type="info"
      variant="tonal"
      density="comfortable"
      class="mb-4"
    >
      {{ $t("daycare.settings.read-only-notice") }}
    </v-alert>

    <DaycareErrorState v-if="daycare.settings.error.value" :error="daycare.settings.error.value" />
    <v-skeleton-loader v-else-if="daycare.settings.loading.value && !form" type="article" />

    <v-form v-else-if="form" @submit="onSave">
      <v-card class="mb-4">
        <v-card-title>{{ $t("daycare.settings.planning") }}</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="form.planning.max_recipe_uses_per_week"
            type="number"
            min="1"
            :disabled="!daycare.isAdmin.value"
            :label="$t('daycare.settings.max-recipe-uses-per-week')"
          />
          <v-text-field
            v-model="form.planning.max_inventory_recipe_uses_per_week"
            type="number"
            min="1"
            :disabled="!daycare.isAdmin.value"
            :label="$t('daycare.settings.max-inventory-recipe-uses-per-week')"
          />
          <v-text-field
            v-model="form.planning.min_recipe_gap_days"
            type="number"
            min="0"
            :disabled="!daycare.isAdmin.value"
            :label="$t('daycare.settings.min-recipe-gap-days')"
          />
          <v-text-field
            v-model="form.planning.min_same_slot_recipe_gap_days"
            type="number"
            min="0"
            :disabled="!daycare.isAdmin.value"
            :label="$t('daycare.settings.min-same-slot-recipe-gap-days')"
          />
          <v-text-field
            v-model="form.planning.max_rotation_group_uses_per_week"
            type="number"
            min="1"
            :disabled="!daycare.isAdmin.value"
            :label="$t('daycare.settings.max-rotation-group-uses-per-week')"
          />
          <v-text-field
            v-model="form.planning.min_rotation_gap_days"
            type="number"
            min="0"
            :disabled="!daycare.isAdmin.value"
            :label="$t('daycare.settings.min-rotation-gap-days')"
          />
          <v-text-field
            v-model="form.planning.max_new_production_recipes_per_week"
            type="number"
            min="0"
            :disabled="!daycare.isAdmin.value"
            :label="$t('daycare.settings.max-new-production-recipes-per-week')"
          />
          <v-text-field
            v-model="form.planning.history_weeks"
            type="number"
            min="0"
            :disabled="!daycare.isAdmin.value"
            :label="$t('daycare.settings.history-weeks')"
          />
        </v-card-text>
      </v-card>

      <v-card class="mb-4">
        <v-card-title>{{ $t("daycare.settings.production") }}</v-card-title>
        <v-card-text>
          <v-switch
            v-model="form.production.prefer_prepared_inventory"
            :disabled="!daycare.isAdmin.value"
            :label="$t('daycare.settings.prefer-prepared-inventory')"
          />
          <v-switch
            v-model="form.production.avoid_new_production"
            :disabled="!daycare.isAdmin.value"
            :label="$t('daycare.settings.avoid-new-production')"
          />
        </v-card-text>
      </v-card>

      <v-card class="mb-4">
        <v-card-title>{{ $t("daycare.settings.automation") }}</v-card-title>
        <v-card-text>
          <v-switch
            v-model="form.automation.weekly_planning_enabled"
            :disabled="!daycare.isAdmin.value"
            :label="$t('daycare.settings.weekly-planning-enabled')"
          />
          <v-select
            v-model="form.automation.planning_weekday"
            :items="weekdayOptions"
            :disabled="!daycare.isAdmin.value"
            :label="$t('daycare.settings.planning-weekday')"
          />
          <v-text-field
            v-model="form.automation.planning_time"
            :disabled="!daycare.isAdmin.value"
            :label="$t('daycare.settings.planning-time')"
            placeholder="HH:MM"
          />
          <v-text-field
            v-model="form.automation.timezone"
            :disabled="!daycare.isAdmin.value"
            :label="$t('daycare.settings.timezone')"
          />
          <v-switch
            v-model="form.automation.auto_publish_meal_plan"
            :disabled="!daycare.isAdmin.value"
            :label="$t('daycare.settings.auto-publish-meal-plan')"
          />
          <v-switch
            v-model="form.automation.auto_publish_shopping_list"
            :disabled="!daycare.isAdmin.value"
            :label="$t('daycare.settings.auto-publish-shopping-list')"
          />
          <v-switch
            v-model="form.automation.ingredient_writeback_enabled"
            :disabled="!daycare.isAdmin.value"
            :label="$t('daycare.settings.ingredient-writeback-enabled')"
            hide-details
          />
          <p class="text-caption text-medium-emphasis mt-1">
            {{ $t("daycare.settings.ingredient-writeback-enabled-hint") }}
          </p>
        </v-card-text>
      </v-card>

      <v-alert v-if="saveError" type="error" variant="tonal" density="comfortable" class="mb-4">
        {{ saveError }}
      </v-alert>

      <v-btn
        v-if="daycare.isAdmin.value"
        type="submit"
        color="primary"
        :loading="daycare.mutating.value"
        :disabled="daycare.isOffline.value"
      >
        {{ $t("daycare.settings.save") }}
      </v-btn>
    </v-form>
  </v-container>
</template>

<script setup lang="ts">
import DaycareErrorState from "~/components/Domain/Daycare/DaycareErrorState.vue";
import { type DaycareUiError, useDaycare } from "~/composables/daycare/use-daycare";
import { alert } from "~/composables/use-toast";
import type { PlannerSettingsUpdate, Weekday } from "~/lib/api/types/daycare";

definePageMeta({
  middleware: ["group-only"],
});

const i18n = useI18n();
useSeoMeta({
  title: i18n.t("daycare.settings.title"),
});

const daycare = useDaycare();

onMounted(() => {
  daycare.settings.load();
});

const weekdayOptions: Weekday[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const form = ref<PlannerSettingsUpdate | null>(null);
const saveError = ref<string | null>(null);

watch(() => daycare.settings.data.value, (data) => {
  if (data) {
    form.value = {
      planning: { ...data.planning },
      production: { ...data.production },
      automation: { ...data.automation },
    };
  }
}, { immediate: true });

function errorMessage(error: DaycareUiError) {
  const base = error.message ?? i18n.t(`daycare.errors.${error.kind}`);
  const fieldErrors = error.details?.errors as { loc?: (string | number)[]; msg?: string }[] | undefined;
  if (!fieldErrors?.length) {
    return base;
  }
  const detail = fieldErrors.map(e => `${(e.loc ?? []).join(".")}: ${e.msg ?? ""}`).join("; ");
  return `${base} (${detail})`;
}

function toPayload(source: PlannerSettingsUpdate): PlannerSettingsUpdate {
  return {
    planning: {
      ...source.planning,
      max_recipe_uses_per_week: Number(source.planning.max_recipe_uses_per_week),
      max_inventory_recipe_uses_per_week: Number(source.planning.max_inventory_recipe_uses_per_week),
      min_recipe_gap_days: Number(source.planning.min_recipe_gap_days),
      min_same_slot_recipe_gap_days: Number(source.planning.min_same_slot_recipe_gap_days),
      max_rotation_group_uses_per_week: Number(source.planning.max_rotation_group_uses_per_week),
      min_rotation_gap_days: Number(source.planning.min_rotation_gap_days),
      max_new_production_recipes_per_week: Number(source.planning.max_new_production_recipes_per_week),
      history_weeks: Number(source.planning.history_weeks),
    },
    production: { ...source.production },
    automation: { ...source.automation },
  };
}

async function onSave() {
  if (!form.value || !daycare.isAdmin.value) {
    return;
  }
  saveError.value = null;
  const result = await daycare.updateSettings(toPayload(form.value));
  if (result.error) {
    saveError.value = errorMessage(result.error);
    alert.error(saveError.value);
  }
  else {
    alert.success(i18n.t("daycare.settings.saved"));
  }
}
</script>
