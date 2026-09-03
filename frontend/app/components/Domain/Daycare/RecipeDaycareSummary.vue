<template>
  <div>
    <div class="d-flex flex-wrap ga-1 mb-2">
      <v-chip size="small" :color="record.settings.enabled === false ? undefined : 'success'">
        {{ record.settings.enabled === false ? $t("daycare.recipe.disabled") : $t("daycare.recipe.enabled") }}
      </v-chip>
      <v-chip v-if="!record.classified" size="small">
        {{ $t("daycare.recipe.not-classified") }}
      </v-chip>
      <template v-else>
        <v-chip size="small" :color="record.classification?.eligible ? 'success' : undefined">
          {{ record.classification?.eligible ? $t("daycare.recipe.eligible") : $t("daycare.recipe.not-eligible") }}
        </v-chip>
        <v-chip v-if="record.classification?.classification.needs_review" size="small" color="warning">
          {{ $t("daycare.recipe.needs-review") }}
        </v-chip>
      </template>
    </div>

    <template v-if="record.classified && record.classification">
      <p class="mb-1">
        <span class="font-weight-medium">{{ $t("daycare.recipe.slots-roles") }}:</span>
        <span v-if="!record.classification.uses.length">{{ $t("daycare.recipe.no-slots") }}</span>
        <span v-else>
          <span v-for="(use, index) in record.classification.uses" :key="use.slot">
            <template v-if="index > 0">, </template>
            {{ $t(`daycare.recipe.slot-${use.slot}`) }} ({{ use.roles.map(r => $t(`daycare.recipe.role-${r}`)).join('/') }})
          </span>
        </span>
      </p>

      <p class="mb-1">
        <span class="font-weight-medium">{{ $t("daycare.recipe.batchable") }}:</span>
        {{ record.classification.production.batchable ? $t("daycare.recipe.batchable") : $t("daycare.recipe.not-batchable") }}
        &middot;
        {{ $t(`daycare.recipe.freezable-${record.classification.production.freezable}`) }}
        &middot;
        {{ $t(`daycare.recipe.storage-${record.classification.production.preferred_batch_storage}`) }}
      </p>
    </template>

    <p class="mb-1">
      <span class="font-weight-medium">{{ $t("daycare.recipe.portions-per-batch") }}:</span>
      {{ record.settings.daycare_portions_per_batch ?? $t("daycare.recipe.portions-per-batch-unset") }}
    </p>

    <p class="mb-1">
      <span class="font-weight-medium">{{ $t("daycare.recipe.prepared-portions") }}:</span>
      <template v-if="preparedError">
        &mdash;
        <span class="text-caption text-medium-emphasis">{{ $t("daycare.recipe.prepared-portions-unavailable") }}</span>
        <v-btn variant="text" size="x-small" class="px-1" @click="emit('retry-prepared')">
          {{ $t("daycare.recipe.retry") }}
        </v-btn>
      </template>
      <template v-else>
        {{ prepared?.physical ?? 0 }}
      </template>
    </p>

    <p class="mb-1">
      <span class="font-weight-medium">{{ $t("daycare.recipe.next-use") }}:</span>
      {{ nextUseText }}
    </p>

    <p v-if="processingText" class="mb-2">
      <span class="font-weight-medium">{{ $t("daycare.recipe.processing") }}:</span>
      {{ processingText }}
    </p>

    <p class="mb-0 d-flex align-center flex-wrap ga-2">
      <span class="font-weight-medium">{{ $t("daycare.recipe.ingredient-writeback") }}:</span>
      {{ record.ingredient_writeback ? $t("daycare.recipe.enabled") : $t("daycare.recipe.disabled") }}
      <v-btn variant="text" size="x-small" class="px-1" @click="emit('preview-writeback')">
        {{ $t("daycare.recipe.ingredient-writeback-preview-action") }}
      </v-btn>
    </p>
  </div>
</template>

<script setup lang="ts">
import type { DaycareUiError } from "~/composables/daycare/use-daycare";
import type { NextPlannedUse, ProcessingNote } from "~/composables/daycare/use-recipe-daycare";
import type { LotTotals, RecipeDaycare } from "~/lib/api/types/daycare";

interface Props {
  record: RecipeDaycare;
  prepared: LotTotals | null;
  preparedError?: DaycareUiError | null;
  nextUse: NextPlannedUse | null;
  processingNote: ProcessingNote | null;
}
const props = withDefaults(defineProps<Props>(), { preparedError: null });
const emit = defineEmits<{ "retry-prepared": []; "preview-writeback": [] }>();

const i18n = useI18n();

const nextUseText = computed(() => {
  if (!props.nextUse) return i18n.t("daycare.recipe.no-next-use");
  const slotLabel = i18n.t(`daycare.plan.${props.nextUse.slot.replace("_", "-")}`);
  return `${props.nextUse.day} (${props.nextUse.date}) · ${slotLabel}`;
});

const processingText = computed(() => {
  const note = props.processingNote;
  if (!note) return null;
  const parts: string[] = [];
  if (note.state === "failed" || note.state === "dead_lettered") {
    parts.push(note.lastError
      ? i18n.t("daycare.recipe.processing-failed-with-error", { error: note.lastError })
      : i18n.t("daycare.recipe.processing-failed"));
  }
  else if (note.state) {
    parts.push(i18n.t(`daycare.recipe.processing-${note.state}`));
  }
  if (note.lackingYield) {
    parts.push(i18n.t("daycare.recipe.lacking-yield"));
  }
  return parts.length ? parts.join(" · ") : null;
});
</script>
