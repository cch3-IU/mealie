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
