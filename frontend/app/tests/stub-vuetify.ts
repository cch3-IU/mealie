/**
 * Shared Vuetify component stubs for Daycare component tests. Vuetify itself isn't installed in the
 * test environment (see app/tests/setup.ts), so every component test stubs the Vuetify elements it
 * renders; this collects the common ones so each Daycare test file isn't re-declaring the same
 * pass-through templates.
 */
export const vuetifyStubs = {
  VAlert: {
    props: ["type"],
    template: "<div class=\"v-alert\" :data-type=\"type\"><slot /></div>",
  },
  VBtn: {
    props: ["disabled", "loading"],
    template: "<button type=\"button\" :disabled=\"disabled || loading\"><slot /></button>",
  },
  VCard: { template: "<div class=\"v-card\"><slot /></div>" },
  VCardActions: { template: "<div><slot /></div>" },
  VCardText: { template: "<div><slot /></div>" },
  VCardTitle: { template: "<div><slot /></div>" },
  VChip: { template: "<span class=\"v-chip\"><slot /></span>" },
  VCol: { template: "<div><slot /></div>" },
  VContainer: { template: "<div><slot /></div>" },
  VDialog: {
    props: ["modelValue"],
    template: "<div v-if=\"modelValue\" class=\"v-dialog\"><slot /></div>",
  },
  VDivider: { template: "<hr>" },
  VExpandTransition: { template: "<div><slot /></div>" },
  VIcon: { template: "<span class=\"v-icon\"><slot /></span>" },
  VList: { template: "<div><slot /></div>" },
  VListItem: { template: "<div class=\"v-list-item\"><slot /><slot name=\"append\" /></div>" },
  VListItemTitle: { template: "<div><slot /></div>" },
  VListItemSubtitle: { template: "<div><slot /></div>" },
  VProgressCircular: { template: "<div class=\"v-progress-circular\" />" },
  VRow: { template: "<div><slot /></div>" },
  VSkeletonLoader: { template: "<div class=\"v-skeleton-loader\" />" },
  VSpacer: { template: "<div />" },
  VSwitch: {
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template: "<input type=\"checkbox\" :checked=\"modelValue\" @change=\"$emit('update:modelValue', ($event.target as HTMLInputElement).checked)\">",
  },
  VTextField: {
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template: "<input :value=\"modelValue\" @input=\"$emit('update:modelValue', ($event.target as HTMLInputElement).value)\">",
  },
  VSelect: {
    props: ["modelValue", "items"],
    emits: ["update:modelValue"],
    template: "<select :value=\"modelValue\" @change=\"$emit('update:modelValue', ($event.target as HTMLSelectElement).value)\"><option v-for=\"item in items\" :key=\"item\" :value=\"item\">{{ item }}</option></select>",
  },
  VTable: { template: "<table><slot /></table>" },
  VToolbar: { template: "<div><slot /></div>" },
  VToolbarTitle: { template: "<div><slot /></div>" },
};
