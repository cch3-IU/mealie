<template>
  <v-container style="max-width: 720px;">
    <BasePageTitle>
      <template #title>
        {{ $t("daycare.dashboard.title") }}
      </template>
    </BasePageTitle>

    <v-alert
      v-if="daycare.isOffline.value"
      type="warning"
      variant="tonal"
      density="comfortable"
      class="mb-4"
    >
      {{ $t("daycare.dashboard.offline-banner") }}
    </v-alert>

    <DaycareWeekPicker
      class="mb-4"
      :model-value="daycare.selectedWeek.value"
      :disabled="daycare.isOffline.value || daycare.mutating.value"
      @update:model-value="onWeekChange"
    />

    <v-row dense>
      <v-col cols="12">
        <DaycarePlanCard
          :week="daycare.week.data.value"
          :week-empty="daycare.week.empty.value"
          :loading="daycare.week.loading.value"
          :error="daycare.week.error.value"
          :mutating="daycare.mutating.value"
          :offline="daycare.isOffline.value"
          @regenerate="onRegenerate"
        />
      </v-col>
      <v-col cols="12">
        <DaycarePrepCard
          :production-rows="recipesNeedingProduction(daycare.week.data.value?.plan)"
          :blockers="daycare.prep.data.value?.blockers ?? []"
          :loading="daycare.prep.loading.value || daycare.week.loading.value"
          :error="daycare.prep.error.value ?? (daycare.week.empty.value ? null : daycare.week.error.value)"
          :week-empty="daycare.week.empty.value"
          :group-slug="groupSlug"
        />
      </v-col>
      <v-col cols="12">
        <DaycareShoppingCard
          :shopping="daycare.shopping.data.value"
          :week-empty="daycare.shopping.empty.value"
          :loading="daycare.shopping.loading.value"
          :error="daycare.shopping.error.value"
          :mutating="daycare.mutating.value"
          :offline="daycare.isOffline.value"
          @preview="onShoppingPreview"
          @publish="onShoppingPublish"
        />
      </v-col>
      <v-col cols="12">
        <DaycareInventoryCard
          :inventory="daycare.inventory.data.value"
          :loading="daycare.inventory.loading.value"
          :error="daycare.inventory.error.value"
        />
      </v-col>
      <v-col cols="12">
        <DaycareStatusCard
          :status="daycare.status.data.value"
          :processing="daycare.processing.data.value"
          :week="daycare.week.data.value"
          :loading="daycare.status.loading.value || daycare.processing.loading.value"
          :error="daycare.status.error.value ?? daycare.processing.error.value"
        />
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import DaycareInventoryCard from "~/components/Domain/Daycare/DaycareInventoryCard.vue";
import DaycarePlanCard from "~/components/Domain/Daycare/DaycarePlanCard.vue";
import DaycarePrepCard from "~/components/Domain/Daycare/DaycarePrepCard.vue";
import DaycareShoppingCard from "~/components/Domain/Daycare/DaycareShoppingCard.vue";
import DaycareStatusCard from "~/components/Domain/Daycare/DaycareStatusCard.vue";
import DaycareWeekPicker from "~/components/Domain/Daycare/DaycareWeekPicker.vue";
import { recipesNeedingProduction } from "~/composables/daycare/daycare-summary";
import { useDaycare } from "~/composables/daycare/use-daycare";
import { alert } from "~/composables/use-toast";

definePageMeta({
  middleware: ["group-only"],
});

const i18n = useI18n();
const route = useRoute();
const groupSlug = computed(() => route.params.groupSlug as string);

useSeoMeta({
  title: i18n.t("daycare.dashboard.title"),
});

const daycare = useDaycare();

onMounted(() => {
  daycare.refresh();
});

function errorMessage(error: { message: string | null; kind: string }) {
  return error.message ?? i18n.t(`daycare.errors.${error.kind}`);
}

async function onWeekChange(week: string) {
  await daycare.setSelectedWeek(week);
}

async function onRegenerate() {
  const result = await daycare.regenerateWeek();
  if (result.error) {
    alert.error(errorMessage(result.error));
  }
  else {
    alert.success(i18n.t("daycare.plan.regenerate"));
  }
}

async function onShoppingPreview() {
  const result = await daycare.publishShopping({ dry_run: true });
  if (result.error) {
    alert.error(errorMessage(result.error));
  }
  else if (result.data) {
    const { created, updated, deleted } = result.data.counts;
    alert.info(`${created} created, ${updated} updated, ${deleted} deleted`, i18n.t("daycare.shopping.preview-title"));
  }
}

async function onShoppingPublish() {
  const result = await daycare.publishShopping({ dry_run: false });
  if (result.error) {
    alert.error(errorMessage(result.error));
  }
  else {
    alert.success(i18n.t("daycare.shopping.publish"));
  }
}
</script>
