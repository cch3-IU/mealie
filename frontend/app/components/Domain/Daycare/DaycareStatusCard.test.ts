import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import DaycareStatusCard from "./DaycareStatusCard.vue";
import { vuetifyStubs } from "~/tests/stub-vuetify";
import type { ProcessingStatus, StatusResponse } from "~/lib/api/types/daycare";

function statusFixture(overrides: Partial<StatusResponse> = {}): StatusResponse {
  return {
    service: "daycare",
    version: "1.0.0",
    mealie: { reachable: true, version: "3.25.0", checked_at: null, cached: false, error: null },
    daycare_household: { household_id: "h1", household_name: "Family", group_id: "g1" },
    counts: { lots: 0, reservations: 0, commits: 0 },
    latest_plan_week: "2026-01-05",
    scheduler: { last_run: null, next_run: null, reason: "not_implemented" },
    write_enabled: true,
    ...overrides,
  };
}

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

function mountCard(props: Partial<InstanceType<typeof DaycareStatusCard>["$props"]> = {}) {
  return mount(DaycareStatusCard, {
    props: { status: null, processing: null, week: null, loading: false, error: null, ...props },
    global: { stubs: vuetifyStubs },
  });
}

describe("DaycareStatusCard", () => {
  test("shows a loading skeleton", () => {
    const wrapper = mountCard({ loading: true });
    expect(wrapper.find(".v-skeleton-loader").exists()).toBe(true);
  });

  test("shows an error state", () => {
    const wrapper = mountCard({ error: { status: 401, code: null, message: null, kind: "unauthorized", details: null } });
    expect(wrapper.text()).toContain("session needs to be refreshed");
  });

  test("shows recipes tracked and a needs-review count", () => {
    const wrapper = mountCard({
      status: statusFixture(),
      processing: processingFixture({ recipes_lacking_classification: ["a"] }),
    });
    expect(wrapper.text()).toContain("11 recipes tracked");
    expect(wrapper.text()).toContain("1 needs review");
  });

  test("prompts to regenerate when recipes changed since the plan was made", () => {
    const processing = processingFixture();
    processing.processing.changed_since_plan.count = 2;
    const wrapper = mountCard({ status: statusFixture(), processing });
    expect(wrapper.text()).toContain("2 recipes changed since this week was planned");
    expect(wrapper.text()).toContain("Regenerate to pick up the changes.");
  });

  test("shows Not run yet / Not scheduled when the scheduler hasn't run", () => {
    const wrapper = mountCard({ status: statusFixture() });
    expect(wrapper.text()).toContain("Not run yet");
    expect(wrapper.text()).toContain("Not scheduled");
  });

  test("surfaces week warnings and dead-lettered processing items", () => {
    const wrapper = mountCard({
      status: statusFixture(),
      week: {
        week_start: "2026-01-05",
        generated_at: null,
        schema_version: null,
        committed: false,
        committed_at: null,
        stale: false,
        stale_reason: null,
        reservation_status: "active",
        reservation: { total_reserved: 0, recipe_daycare_portions: {} },
        downstream_reservations_invalidated: [],
        warnings: ["Two recipes share a rotation group this week."],
        artifacts: {},
        publication: { status: "never", last_published_at: null, plan_id: "p", published_plan_id: null, entry_count: 0, drift: false, drift_reason: null, receipt: null },
        plan: { schema_version: 1, week_start: "2026-01-05", generated_at: "", plan_id: null, days: [], production_plan: [], warnings: [] },
      },
      processing: processingFixture({ processing: { ...processingFixture().processing, counts: { pending: 0, running: 0, succeeded: 9, failed: 0, dead_lettered: 1, total: 10 } } }),
    });
    expect(wrapper.text()).toContain("Two recipes share a rotation group this week.");
    expect(wrapper.text()).toContain("failed processing");
  });
});
