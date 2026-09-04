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
          :is-admin="daycare.isAdmin.value"
          :get-unlock-preview="daycare.getUnlockPreview"
          :unlock-week="daycare.unlockWeek"
          @regenerate="onRegenerate"
          @unlocked="onUnlocked"
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
          :week="daycare.week.data.value"
          :mutating="daycare.mutating.value"
          :offline="daycare.isOffline.value"
          :get-completion-preview="daycare.getCompletionPreview"
          :complete-week="daycare.completeWeek"
          :get-commit-receipt="daycare.getCommitReceipt"
          :undo-complete-week="daycare.undoCompleteWeek"
          @completed="onPrepCompleted"
          @undone="onPrepUndone"
        />
      </v-col>
      <v-col cols="12">
        <DaycareShoppingCard
          :shopping="daycare.shopping.data.value"
          :week="daycare.week.data.value"
          :week-empty="daycare.shopping.empty.value"
          :loading="daycare.shopping.loading.value"
          :error="daycare.shopping.error.value"
          :mutating="daycare.mutating.value"
          :offline="daycare.isOffline.value"
          :group-slug="groupSlug"
          @preview="onShoppingPreview"
          @publish="onShoppingPublish"
        />
      </v-col>
      <v-col cols="12">
        <DaycareInventoryCard
          :inventory="daycare.inventory.data.value"
          :loading="daycare.inventory.loading.value"
          :error="daycare.inventory.error.value"
          :group-slug="groupSlug"
          :week="daycare.week.data.value"
          :recipes="daycare.recipes.data.value?.recipes ?? []"
          :mutating="daycare.mutating.value"
          :offline="daycare.isOffline.value"
          :update-lot="daycare.updateLot"
        />
      </v-col>
      <v-col cols="12">
        <DaycareStatusCard
          :status="daycare.status.data.value"
          :processing="daycare.processing.data.value"
          :week="daycare.week.data.value"
          :group-slug="groupSlug"
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

/** `shopping_blocked` and `week_committed` are shown inline by DaycareShoppingCard's own calm, non-error state — a red toast on top would contradict that. */
function isHandledInlineByShoppingCard(error: { code: string | null }) {
  return error.code === "shopping_blocked" || error.code === "week_committed";
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
    if (!isHandledInlineByShoppingCard(result.error)) alert.error(errorMessage(result.error));
  }
  else if (result.data) {
    const { created, updated, deleted } = result.data.counts;
    alert.info(
      i18n.t("daycare.shopping.preview-result", { created, updated, deleted }),
      i18n.t("daycare.shopping.preview-title"),
      { action: { onClick: onShoppingPublish, message: i18n.t("daycare.shopping.publish") } },
    );
  }
}

async function onShoppingPublish() {
  const result = await daycare.publishShopping({ dry_run: false });
  if (result.error) {
    if (!isHandledInlineByShoppingCard(result.error)) alert.error(errorMessage(result.error));
  }
  else if (result.data) {
    // The shopping resource is already refetched by publishShopping's own request-then-refetch;
    // the week is reloaded too so anything week-scoped that reads publication state stays in sync.
    await daycare.week.load();
    const { created, updated, deleted } = result.data.counts;
    const listId = result.data.list_id;
    alert.success(
      i18n.t("daycare.shopping.publish-result", { created, updated, deleted }),
      i18n.t("daycare.shopping.publish"),
      listId ? { action: { onClick: () => navigateTo(`/shopping-lists/${listId}`), message: i18n.t("daycare.shopping.open-shopping-list") } } : undefined,
    );
  }
}

function onPrepCompleted() {
  alert.success(i18n.t("daycare.prep.mark-complete-success"));
}

function onPrepUndone() {
  alert.success(i18n.t("daycare.prep.undo-success"));
}

function onUnlocked() {
  alert.success(i18n.t("daycare.plan.unlock-success-toast"));
}
</script>
