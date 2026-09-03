<template>
  <v-alert
    :type="alertType"
    variant="tonal"
    density="comfortable"
  >
    {{ error.message || $t(`daycare.errors.${error.kind}`) }}
  </v-alert>
</template>

<script setup lang="ts">
import type { DaycareUiError } from "~/composables/daycare/use-daycare";

interface Props {
  error: DaycareUiError;
}
const props = defineProps<Props>();

const alertType = computed(() => {
  switch (props.error.kind) {
    case "offline":
    case "unreachable":
      return "warning";
    case "forbidden":
    case "unauthorized":
      return "info";
    default:
      return "error";
  }
});
</script>
