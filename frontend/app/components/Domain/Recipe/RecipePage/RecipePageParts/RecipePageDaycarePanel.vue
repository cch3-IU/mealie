<template>
  <v-card v-if="show" flat class="mt-4 d-print-none" variant="outlined">
    <v-card-title class="d-flex align-center py-2">
      <span>{{ $t("daycare.recipe.title") }}</span>
      <v-spacer />
      <v-btn variant="text" size="small" @click="expanded = !expanded">
        {{ expanded ? $t("daycare.recipe.collapse") : $t("daycare.recipe.expand") }}
      </v-btn>
    </v-card-title>
    <v-expand-transition>
      <v-card-text v-show="expanded" class="pt-0">
        <DaycareErrorState v-if="daycare.recipeDaycare.error.value" :error="daycare.recipeDaycare.error.value" />
        <p v-else-if="daycare.recipeDaycare.empty.value" class="mb-0 text-body-2">
          {{ $t("daycare.recipe.not-tracked") }}
        </p>
        <template v-else-if="record">
          <RecipeDaycareSummary
            :record="record"
            :prepared="daycare.preparedPortions.value"
            :prepared-error="daycare.inventory.error.value"
            :next-use="daycare.nextPlannedUse.value"
            :processing-note="daycare.processingNote.value"
            @retry-prepared="daycare.retryInventory"
          />
          <div class="d-flex align-center mt-2">
            <v-btn v-if="!editing" variant="text" size="small" class="px-0" @click="editing = true">
              {{ $t("daycare.recipe.edit") }}
            </v-btn>
            <v-spacer />
            <v-btn variant="text" size="small" class="px-0" :to="`/g/${groupSlug}/daycare/settings`">
              {{ $t("daycare.settings.title") }}
            </v-btn>
          </div>
          <v-expand-transition>
            <div v-if="editing">
              <v-divider class="my-3" />
              <RecipeDaycareEditForm
                :record="record"
                :saving="daycare.mutating.value"
                @save="onSave"
              />
            </div>
          </v-expand-transition>
        </template>
      </v-card-text>
    </v-expand-transition>
  </v-card>
</template>

<script setup lang="ts">
import DaycareErrorState from "~/components/Domain/Daycare/DaycareErrorState.vue";
import RecipeDaycareEditForm from "~/components/Domain/Daycare/RecipeDaycareEditForm.vue";
import RecipeDaycareSummary from "~/components/Domain/Daycare/RecipeDaycareSummary.vue";
import { useRecipeDaycare } from "~/composables/daycare/use-recipe-daycare";
import { alert } from "~/composables/use-toast";
import type { RecipeDaycareUpdate } from "~/lib/api/types/daycare";

interface Props {
  slug: string;
  groupSlug: string;
}
const props = defineProps<Props>();

const i18n = useI18n();
const daycare = useRecipeDaycare(computed(() => props.slug));

/** Whether the panel's body is shown at all — the compact/collapsible control for mobile. */
const expanded = ref(true);
/** Whether the (larger) edit form is shown, separate from `expanded` so opening the panel never
 * immediately dumps a full form of switches/checkboxes onto the recipe page. */
const editing = ref(false);

/**
 * Rendered only once the initial fetch has settled and the caller isn't forbidden (a different
 * household) — never mounts a skeleton or error card first, so an out-of-household user never sees
 * even a brief flash of the panel before it disappears.
 */
const show = computed(() =>
  !daycare.forbidden.value
  && (!!daycare.recipeDaycare.data.value || daycare.recipeDaycare.empty.value || !!daycare.recipeDaycare.error.value),
);

const record = computed(() => daycare.recipeDaycare.data.value);

onMounted(() => {
  daycare.load();
});

async function onSave(payload: RecipeDaycareUpdate) {
  const result = await daycare.updateRecipeDaycare(payload);
  if (result.error) {
    alert.error(result.error.message ?? i18n.t(`daycare.errors.${result.error.kind}`));
  }
  else {
    alert.success(i18n.t("daycare.recipe.saved"));
    editing.value = false;
  }
}
</script>
