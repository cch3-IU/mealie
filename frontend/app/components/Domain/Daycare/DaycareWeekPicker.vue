<template>
  <div class="d-flex align-center justify-space-between">
    <v-btn
      icon
      variant="text"
      :disabled="disabled"
      :aria-label="$t('daycare.dashboard.previous-week')"
      @click="shiftWeek(-7)"
    >
      <v-icon>{{ $globals.icons.arrowLeftBold }}</v-icon>
    </v-btn>
    <div class="text-center font-weight-medium">
      {{ weekLabel }}
    </div>
    <v-btn
      icon
      variant="text"
      :disabled="disabled"
      :aria-label="$t('daycare.dashboard.next-week')"
      @click="shiftWeek(7)"
    >
      <v-icon>{{ $globals.icons.arrowRightBold }}</v-icon>
    </v-btn>
  </div>
</template>

<script setup lang="ts">
interface Props {
  modelValue: string;
  disabled?: boolean;
}
const props = withDefaults(defineProps<Props>(), {
  disabled: false,
});

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const weekLabel = computed(() => {
  const [year, month, day] = props.modelValue.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
});

function shiftWeek(days: number) {
  const [year, month, day] = props.modelValue.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  emit("update:modelValue", `${y}-${m}-${d}`);
}
</script>
