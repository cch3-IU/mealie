import { describe, expect, test } from "vitest";
import {
  changedSincePlanCount,
  recipesNeedingProduction,
  recipesNeedingReviewCount,
  summarizePlanWeek,
} from "../daycare-summary";
import type { PlanDay, PlanSlot, ProcessingStatus, ProductionRow, WeekPlan } from "~/lib/api/types/daycare";

function slot(recipeSlug: string, productionActivated: boolean | null = null): PlanSlot {
  return {
    recipe: {
      slug: recipeSlug,
      name: recipeSlug,
      role: "main",
      roles: ["main"],
      rotation_group: null,
      inventory_available_at_plan_time: null,
      production_activated: productionActivated,
    },
    produce_side: null,
    companion: null,
  };
}

function day(date: string, slots: Partial<Pick<PlanDay, "breakfast" | "lunch" | "snack_am" | "snack_pm">>): PlanDay {
  return {
    date,
    day: "monday",
    breakfast: slots.breakfast ?? slot("empty-breakfast"),
    lunch: slots.lunch ?? slot("empty-lunch"),
    snack_am: slots.snack_am ?? slot("empty-snack-am"),
    snack_pm: slots.snack_pm ?? slot("empty-snack-pm"),
  };
}

function plan(days: PlanDay[], productionPlan: ProductionRow[] = []): WeekPlan {
  return {
    schema_version: 1,
    week_start: "2026-01-05",
    generated_at: "2026-01-01T00:00:00Z",
    plan_id: "plan-1",
    days,
    production_plan: productionPlan,
    warnings: [],
  };
}

describe("summarizePlanWeek", () => {
  test("returns zeroes for a missing plan", () => {
    expect(summarizePlanWeek(null)).toEqual({ plannedSlots: 0, fromFreezer: 0, newProduction: 0 });
  });

  test("counts every filled slot once, split by production_activated", () => {
    const week = plan([
      day("2026-01-05", {
        breakfast: slot("oat-cups", false),
        lunch: slot("veggie-bowl", true),
      }),
    ]);

    const summary = summarizePlanWeek(week);
    expect(summary.plannedSlots).toEqual(4);
    expect(summary.fromFreezer).toEqual(3); // breakfast + snack_am + snack_pm default (production_activated null)
    expect(summary.newProduction).toEqual(1); // lunch only
  });
});

describe("recipesNeedingProduction", () => {
  test("returns an empty list when there is no plan", () => {
    expect(recipesNeedingProduction(null)).toEqual([]);
  });

  function row(overrides: Partial<ProductionRow>): ProductionRow {
    return {
      recipe_slug: "chicken-barley-soup",
      recipe_name: "Chicken Barley Soup",
      demand_daycare_portions: 10,
      inventory_available: 0,
      shortage_daycare_portions: 0,
      batchable: true,
      daycare_portions_per_batch: 8,
      batches_to_make: 0,
      yield_needs_configuration: false,
      ...overrides,
    };
  }

  test("includes rows that need at least one batch made", () => {
    const withBatch = row({ batches_to_make: 1 });
    const withoutBatch = row({ batches_to_make: 0 });
    const week = plan([], [withBatch, withoutBatch]);
    expect(recipesNeedingProduction(week)).toEqual([withBatch]);
  });

  test("includes rows that are short on inventory even with no batch count yet", () => {
    const shortRow = row({ batches_to_make: null, shortage_daycare_portions: 2 });
    const week = plan([], [shortRow]);
    expect(recipesNeedingProduction(week)).toEqual([shortRow]);
  });
});

describe("changedSincePlanCount / recipesNeedingReviewCount", () => {
  function processingFixture(overrides: Partial<ProcessingStatus> = {}): ProcessingStatus {
    return {
      write_enabled: true,
      last_export_at: null,
      recipe_count: 11,
      snapshots: {},
      caches: {},
      recipes_lacking_classification: [],
      recipes_lacking_normalization: [],
      recipes_lacking_daycare_yield: [],
      llm_triggered: false,
      processing: {
        available: true,
        counts: { pending: 0, running: 0, succeeded: 11, failed: 0, dead_lettered: 0, total: 11 },
        worker: null,
        high_water_mark: null,
        last_poll_at: null,
        last_poll: null,
        last_cycle: null,
        baseline: null,
        dead_letters: [],
        tombstones: [],
        recent: [],
        changed_since_plan: { week: "2026-01-05", planned_at: null, count: 0, recipes: [] },
      },
      ...overrides,
    };
  }

  test("returns 0 for a missing processing status", () => {
    expect(changedSincePlanCount(null)).toEqual(0);
    expect(recipesNeedingReviewCount(null)).toEqual(0);
  });

  test("reads the changed-since-plan count through to the UI", () => {
    const processing = processingFixture();
    processing.processing.changed_since_plan.count = 3;
    expect(changedSincePlanCount(processing)).toEqual(3);
  });

  test("counts recipes lacking classification as needing review", () => {
    const processing = processingFixture({ recipes_lacking_classification: ["a", "b"] });
    expect(recipesNeedingReviewCount(processing)).toEqual(2);
  });
});
