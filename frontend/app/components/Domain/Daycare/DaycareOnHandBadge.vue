<template>
  <div
    v-if="isOwnGroup && count > 0"
    class="daycare-on-hand-badge"
    role="img"
    :aria-label="$t('daycare.inventory.on-hand', count)"
    :title="$t('daycare.inventory.on-hand', count)"
  >
    {{ count }}
  </div>
</template>

<script setup lang="ts">
import { useRecipeOnHand } from "~/composables/daycare/use-recipe-on-hand";
import { useLoggedInState } from "~/composables/use-logged-in-state";

const props = defineProps<{ slug?: string | null }>();

const { isOwnGroup } = useLoggedInState();
const count = useRecipeOnHand(() => props.slug, () => isOwnGroup.value);
</script>

<style scoped>
/* Top-left of the card (= top-left of its image); pointer-events off so the card link still works. */
.daycare-on-hand-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 2;
  min-width: 24px;
  height: 24px;
  padding: 0 7px;
  border-radius: 12px;
  box-sizing: border-box;
  font-size: 0.8125rem;
  font-weight: 700;
  line-height: 24px;
  text-align: center;
  pointer-events: none;
  /* Fixed dark chip with a white ring: legible over any image, on light and dark themes alike. */
  background: rgba(0, 0, 0, 0.78);
  color: #fff;
  box-shadow:
    0 0 0 2px rgba(255, 255, 255, 0.9),
    0 1px 4px rgba(0, 0, 0, 0.4);
}
</style>
