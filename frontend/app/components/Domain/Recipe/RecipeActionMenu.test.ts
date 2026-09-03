import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import RecipeActionMenu from "./RecipeActionMenu.vue";

// These pull in Nuxt auto-imports ("#imports") that aren't resolvable outside a Nuxt build;
// none of them are exercised by the exit-control behavior under test here.
vi.mock("./RecipeContextMenu/RecipeContextMenu.vue", () => ({ default: { template: "<button type=\"button\" class=\"recipe-context-menu-btn\" />" } }));
vi.mock("./RecipeFavoriteBadge.vue", () => ({ default: { template: "<div />" } }));
vi.mock("./RecipeTimelineBadge.vue", () => ({ default: { template: "<div />" } }));

const wrappers: VueWrapper[] = [];

const recipe = {
  id: "1",
  slug: "chili",
  name: "Chili",
};

function mountMenu(open: boolean, options: { loggedIn?: boolean; canEdit?: boolean } = {}) {
  vi.stubGlobal("useNuxtApp", () => ({
    $globals: {
      icons: {
        alertCircle: "alertCircle",
        close: "close",
        delete: "delete",
        codeBraces: "codeBraces",
        save: "save",
        edit: "edit",
        dotsVertical: "dotsVertical",
      },
    },
  }));

  const wrapper = mount(RecipeActionMenu, {
    props: {
      recipe: recipe as any,
      slug: recipe.slug,
      name: recipe.name,
      recipeId: recipe.id,
      open,
      loggedIn: options.loggedIn ?? false,
      canEdit: options.canEdit ?? false,
    },
    global: {
      mocks: {
        $vuetify: {
          display: { xs: false },
        },
      },
      stubs: {
        BaseDialog: { template: "<div><slot /></div>" },
        VToolbar: { template: "<div><slot /></div>" },
        VTooltip: { template: "<div><slot name=\"activator\" :props=\"{}\" /><slot /></div>" },
        VBtn: { template: "<button type=\"button\"><slot /></button>" },
        VIcon: { template: "<span><slot /></span>" },
        VSpacer: { template: "<div />" },
        VCardText: { template: "<div><slot /></div>" },
      },
    },
  });

  wrappers.push(wrapper);
  return wrapper;
}

describe("RecipeActionMenu exit control", () => {
  afterEach(() => {
    wrappers.forEach(wrapper => wrapper.unmount());
    wrappers.length = 0;
    vi.unstubAllGlobals();
  });

  test("renders the back/exit control in view mode", () => {
    const wrapper = mountMenu(false);

    const exitBtn = wrapper.find(".recipe-exit-btn");
    expect(exitBtn.exists()).toBe(true);
  });

  test("places the back/exit control last in the action row, after the other action buttons", () => {
    const wrapper = mountMenu(false, { loggedIn: true, canEdit: true });

    const group = wrapper.find(".custom-btn-group");
    const buttons = group.findAll("button");
    // With loggedIn+canEdit both true, the row renders the edit button and the
    // RecipeContextMenu overflow button ahead of the exit control.
    expect(buttons.length).toBe(3);
    expect(buttons[buttons.length - 1].classes()).toContain("recipe-exit-btn");
    expect(buttons[buttons.length - 2].classes()).toContain("recipe-context-menu-btn");
  });

  test("matches the neighbouring edit button's Vuetify props (icon, flat, circle, small, info)", () => {
    const wrapper = mountMenu(false, { loggedIn: true, canEdit: true });

    const group = wrapper.find(".custom-btn-group");
    const buttons = group.findAll("button");
    const editBtn = buttons[0];
    const exitBtn = wrapper.find(".recipe-exit-btn");

    for (const attr of ["icon", "variant", "rounded", "size", "color"]) {
      expect(exitBtn.attributes(attr)).toBe(editBtn.attributes(attr));
    }
  });

  test("does not render the back/exit control in edit mode", () => {
    const wrapper = mountMenu(true);

    const exitBtn = wrapper.find(".recipe-exit-btn");
    expect(exitBtn.exists()).toBe(false);
  });

  test("clicking the control emits exit, leaving close/discard semantics untouched", async () => {
    const wrapper = mountMenu(false);

    await wrapper.find(".recipe-exit-btn").trigger("click");

    expect(wrapper.emitted("exit")).toHaveLength(1);
    expect(wrapper.emitted("close")).toBeUndefined();
  });
});
