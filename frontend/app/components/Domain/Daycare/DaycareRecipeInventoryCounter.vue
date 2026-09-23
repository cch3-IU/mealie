<template>
  <div v-if="onHand > 0" class="daycare-inventory-counter d-flex align-center justify-center ga-1 mt-2">
    <v-btn
      icon
      size="small"
      variant="outlined"
      density="comfortable"
      :disabled="daycare.mutating.value"
      :aria-label="$t('daycare.inventory.counter-remove')"
      @click="onRemove"
    >
      <v-icon>{{ $globals.icons.minus }}</v-icon>
    </v-btn>
    <span class="daycare-inventory-counter__count text-title-medium text-center" :aria-label="$t('daycare.inventory.on-hand', onHand)">
      {{ onHand }}
    </span>
    <v-btn
      icon
      size="small"
      variant="outlined"
      density="comfortable"
      :disabled="daycare.mutating.value"
      :aria-label="$t('daycare.inventory.counter-add')"
      @click="onAdd"
    >
      <v-icon>{{ $globals.icons.createAlt }}</v-icon>
    </v-btn>

    <BaseDialog
      v-model="lastServingDialogOpen"
      :title="$t('daycare.inventory.lot-consume-last-title')"
      color="warning"
      can-confirm
      @confirm="removeOne"
    >
      <v-card-text>
        {{ $t("daycare.inventory.counter-last-serving-body") }}
      </v-card-text>
    </BaseDialog>
  </div>
</template>

<script setup lang="ts">
import { useRecipeDaycare } from "~/composables/daycare/use-recipe-daycare";
import { alert } from "~/composables/use-toast";

const props = defineProps<{ slug: string }>();

const i18n = useI18n();
const daycare = useRecipeDaycare(computed(() => props.slug));

/** The recipe's total servings across all its lots; null (never 0) while unloaded or when the sidecar is unavailable, so the counter stays hidden. */
const onHand = computed(() => {
  if (daycare.inventory.error.value || !daycare.inventory.data.value) return 0;
  return daycare.preparedPortions.value?.physical ?? 0;
});

const lastServingDialogOpen = ref(false);

onMounted(() => {
  daycare.retryInventory();
});

function report(error: { message: string | null; kind: string } | null) {
  if (error) alert.error(error.message ?? i18n.t(`daycare.errors.${error.kind}`));
}

/** `-` never silently empties a recipe: the very last serving asks for one confirmation first. */
async function onRemove() {
  if (onHand.value <= 1) {
    lastServingDialogOpen.value = true;
    return;
  }
  await removeOne();
}

async function removeOne() {
  report((await daycare.consumeOne()).error);
}

async function onAdd() {
  report((await daycare.addOne()).error);
}
</script>
