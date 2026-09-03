import type { PlanSlot, ProcessingStatus, ProductionRow, WeekPlan } from "~/lib/api/types/daycare";

export interface PlanSummary {
  plannedSlots: number;
  fromFreezer: number;
  newProduction: number;
}

const SLOT_KEYS = ["breakfast", "lunch", "snack_am", "snack_pm"] as const;

/** Counts planned meal slots across the week, split by whether new production was activated for them. */
export function summarizePlanWeek(plan: WeekPlan | null | undefined): PlanSummary {
  const summary: PlanSummary = { plannedSlots: 0, fromFreezer: 0, newProduction: 0 };
  if (!plan) return summary;

  for (const day of plan.days) {
    for (const key of SLOT_KEYS) {
      const slot = day[key] as PlanSlot | undefined;
      if (!slot?.recipe) continue;
      summary.plannedSlots += 1;
      if (slot.recipe.production_activated) {
        summary.newProduction += 1;
      }
      else {
        summary.fromFreezer += 1;
      }
    }
  }

  return summary;
}

/** Recipes whose production plan calls for at least one batch, or that are short of demand. */
export function recipesNeedingProduction(plan: WeekPlan | null | undefined): ProductionRow[] {
  if (!plan) return [];
  return plan.production_plan.filter(row => (row.batches_to_make ?? 0) > 0 || row.shortage_daycare_portions > 0);
}

/** Recipes that changed after this week was already planned, and may need a Regenerate. */
export function changedSincePlanCount(processing: ProcessingStatus | null | undefined): number {
  return processing?.processing.changed_since_plan.count ?? 0;
}

/** Recipes flagged during processing as needing a human look before they're trustworthy for planning. */
export function recipesNeedingReviewCount(processing: ProcessingStatus | null | undefined): number {
  if (!processing) return 0;
  return processing.recipes_lacking_classification.length;
}

/** Maps a week plan's production rows by recipe name — the same source the sidecar builds its blocker text from. */
function productionRowsByName(plan: WeekPlan | null | undefined): Map<string, string> {
  const byName = new Map<string, string>();
  if (!plan) return byName;
  for (const row of plan.production_plan) {
    byName.set(row.recipe_name, row.recipe_slug);
  }
  return byName;
}

/** Maps a week plan's production rows by recipe slug, to resolve a bare slug back to a display name. */
function productionRowsBySlug(plan: WeekPlan | null | undefined): Map<string, string> {
  const bySlug = new Map<string, string>();
  if (!plan) return bySlug;
  for (const row of plan.production_plan) {
    bySlug.set(row.recipe_slug, row.recipe_name);
  }
  return bySlug;
}

export interface ParsedBlocker {
  text: string;
  recipeName: string | null;
  recipeSlug: string | null;
  detail: string | null;
}

/**
 * Parses the sidecar's `shopping_blocked` blocker strings ("<recipe name>: <reason>")
 * back into a recipe name/slug — resolved against the current week's production plan,
 * the same source the sidecar built the blocker text from — plus the reason text.
 */
export function parseShoppingBlockers(blockers: string[], plan: WeekPlan | null | undefined): ParsedBlocker[] {
  const slugByName = productionRowsByName(plan);
  return blockers.map((text) => {
    const separator = text.indexOf(":");
    if (separator === -1) {
      return { text, recipeName: null, recipeSlug: null, detail: null };
    }
    const recipeName = text.slice(0, separator).trim();
    const detail = text.slice(separator + 1).trim();
    return { text, recipeName, recipeSlug: slugByName.get(recipeName) ?? null, detail };
  });
}

export interface RecipeLink {
  slug: string;
  name: string;
}

/** Resolves display names for recipe slugs (e.g. `recipes_lacking_daycare_yield`) against the current week's plan, falling back to the bare slug when the recipe isn't in this week's plan. */
export function recipeLinksForSlugs(slugs: string[], plan: WeekPlan | null | undefined): RecipeLink[] {
  const nameBySlug = productionRowsBySlug(plan);
  return slugs.map(slug => ({ slug, name: nameBySlug.get(slug) ?? slug }));
}

export interface RelaxedSpacingGroup {
  count: number;
  details: string[];
}

const RELAXED_SPACING_PREFIX = "Relaxed spacing/repetition for ";

/**
 * Splits a week's planner warnings into the repetitive "relaxed spacing to prefer prepared
 * inventory" family — informational, collapsed into one count — and everything else, which
 * stays individual since it's a mix of other, genuinely actionable warnings.
 */
export function groupRelaxedSpacingWarnings(warnings: string[]): { relaxedSpacing: RelaxedSpacingGroup | null; rest: string[] } {
  const matched = warnings.filter(w => w.startsWith(RELAXED_SPACING_PREFIX));
  const rest = warnings.filter(w => !w.startsWith(RELAXED_SPACING_PREFIX));
  return {
    relaxedSpacing: matched.length ? { count: matched.length, details: matched } : null,
    rest,
  };
}
