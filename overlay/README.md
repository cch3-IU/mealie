# Overlay files

This directory tracks the patch surface this fork adds on top of upstream Mealie
(`mealie-recipes/mealie`), so rebases onto later upstream tags stay tractable.
Per charter §12: prefer new files under upstream paths over edits to upstream
files, and list every upstream file this fork modifies here with a one-line
reason.

## New files (not upstream)

- `.github/workflows/daycare-pr.yml` — Upstream's `pull-requests.yml` only
  triggers on PRs/pushes targeting `mealie-next`, so PRs against this fork's
  default branch (`daycare`) get no CI checks and the delivery pipeline's CI
  gate can never complete. This adds a `daycare`-scoped workflow, `Daycare PR
  CI`, that reuses the existing `./.github/workflows/test-frontend.yml` for
  frontend lint/tests and runs a quick static-build sanity job (checkout,
  Node 24 + pnpm per `frontend/package.json`'s `devEngines.packageManager`,
  `pnpm install --frozen-lockfile`, `pnpm generate` in `frontend/`, no
  Docker). Backend tests are intentionally skipped — this fork never changes
  backend Python. No upstream workflow file is edited.

  **`daycare-image-build` job** (charter §16 "End-to-end browser test";
  runs automatically on every PR/push): builds `custom-mealie` from this
  checkout's HEAD with the upstream `docker/Dockerfile`, `push: false`,
  `load: true` — proves the custom image still builds without publishing
  anywhere. No `packages` build-context override (unlike upstream's own
  `e2e.yml`) — the Dockerfile's `packages` stage self-builds the wheel from
  this checkout, matching how `deploy/build-mealie.sh` builds it, so this
  job needs no separate "build the Python package first" job.

  **`daycare-e2e` job — manual only (`workflow_dispatch`), see "Daycare e2e
  CI" below.**

- `frontend/app/composables/use-recipe-exit.ts` — holds the last visited
  recipe-list route (`/g/{groupSlug}` with its query/filter state) for this
  session, so the exit control can return to it, falling back to the group's
  Recipes page when there's no such entry (e.g. a direct deep link).
  Intentionally does not use `document.referrer`.

- `frontend/app/lib/api/types/daycare.ts` — hand-written TypeScript mirror of the sidecar's `/api/daycare/v1` Pydantic schemas. **Not** produced by Mealie's own `pydantic2ts` generator (that pipeline only walks `mealie/schema/*`) and deliberately **not** camelCased — the sidecar has no `alias_generator`, so field names match its raw snake_case JSON.
- `frontend/app/lib/api/user/daycare.ts` (+ `daycare.test.ts`) — `DaycareAPI extends BaseAPI`, one method per sidecar route, attaching a fresh `Idempotency-Key` (UUID v4) to every mutating call per the sidecar's contract.
- `frontend/app/composables/daycare/use-daycare.ts` (+ test) — the `useDaycare()` composable: per-resource loading/error/data state, permission helpers, `refresh()`, and request-then-refetch mutation helpers.
- `frontend/app/composables/daycare/daycare-summary.ts` (+ test) — pure helpers deriving dashboard summaries (planned-meals split, recipes needing production, changed-since-plan/needs-review counts) from typed API responses.
- `frontend/app/components/Domain/Daycare/*.vue` (+ matching `*.test.ts`) — the dashboard's presentational cards: `DaycareErrorState`, `DaycareWeekPicker`, `DaycarePlanCard`, `DaycarePrepCard`, `DaycareShoppingCard`, `DaycareInventoryCard`, `DaycareStatusCard`.
- `frontend/app/tests/stub-vuetify.ts` — a shared Vuetify component stub set reused across the Daycare component tests (Vuetify isn't installed in the Vitest environment, so every component test stubs the Vuetify elements it renders; this collects the common ones instead of duplicating the same stub map in ~8 files).
- `frontend/app/pages/g/[groupSlug]/daycare/index.vue` (+ test) — the dashboard page.
- `frontend/app/pages/g/[groupSlug]/daycare/settings.vue` (+ test) — the admin-gated settings page.
- `frontend/app/composables/daycare/use-recipe-daycare.ts` (+ test) — a second, lighter composable for the recipe-page panel. Deliberately does not reuse `useDaycare()`, which loads the whole household's status/settings/week/prep/shopping/inventory/reservations/processing on every call — far more than a single recipe's panel needs on every recipe page view. Fetches only the recipe's own daycare record, its prepared-inventory totals, the household-wide processing report (to derive this one recipe's processing/classification status via `deriveProcessingNote`), and (best-effort) the current week's plan for "next planned use". Also owns the `uses` array ↔ per-slot-roles map conversion used by the edit form, and hides entirely (no data fetched beyond the first call) the moment the sidecar reports the caller is outside the daycare household.
- `frontend/app/components/Domain/Daycare/RecipeDaycareSummary.vue` (+ test) — read-only display of one recipe's daycare record: enabled, eligible slots/roles, portions per batch, batchable/freezable/storage, prepared portions (total physical on hand, not just the unreserved `free` count — a household member checking "do we have any of this made" wants the whole freezer stash), next planned use, and processing/classification/review status.
- `frontend/app/components/Domain/Daycare/RecipeDaycareEditForm.vue` (+ test) — edit form for the recipe-specific fields only (enabled, slots/roles, portions per batch, batchable, freezable, preferred storage); hides the classification-derived fields when the recipe hasn't been classified yet, since the sidecar 409s a classification-override PUT in that state (`services/recipes.py::_apply_classification_patch`). Normalizes an emptied portions-per-batch field to `null` rather than `v-model.number`'s raw `""` on a failed parse, which the sidecar's settings-patch validator otherwise rejects with a 422.
- `frontend/app/components/Domain/Recipe/RecipePage/RecipePageParts/RecipePageDaycarePanel.vue` (+ test) — the panel itself: loads via `useRecipeDaycare`, gates visibility (nothing rendered until the household check has settled, so an out-of-household user never sees a flash of the card), shows `DaycareErrorState` inline when the sidecar is unreachable, is collapsible (edit form hidden behind its own toggle so opening the panel never dumps a full form onto the recipe page), and links to `/g/{groupSlug}/daycare/settings` for global planner settings rather than exposing them here (per charter §3.3 — recipe-specific fields are any household member's to edit, global settings are admin-only).

### Phase 7 — Mark Prep Complete and completion receipts (charter §7 Phase 7, §15, §23.8)

- `frontend/app/components/Domain/Daycare/DaycarePrepCompletionDialog.vue` (+ test) — a single dialog shared by both the `Mark Prep Complete` and `View Receipt` actions on the Prep card, driven entirely by the live `committed` prop (bound to `week?.committed`, never hardcoded). For an uncommitted week it fetches `GET /weeks/{week}/completion-preview` and renders the per-recipe breakdown in plain words (existing portions consumed, new portions produced, allocated to this week, leftovers to the freezer), surfacing a `409 prep_blocked` as a blocker list and a `404` as "not planned yet" instead of a generic error. Confirming calls `POST /weeks/{week}/complete` with one Idempotency-Key minted when the dialog opens; a genuine `200` shows the fresh receipt and emits `completed`. For an already-committed week (either because it was opened via `View Receipt`, or because confirm raced another commit and got back `409 week_committed`) the dialog reads the persisted receipt via the read-only `GET /weeks/{week}/commit-receipt` instead of replaying `POST .../complete` — a read action must never mutate. Any `404` on that route — whether the documented `receipt_not_found` envelope or a bare route-not-found response with no structured error code — falls back to showing just the completed-on date with a "detail unavailable" note rather than misleading zero-portion numbers or a wrongly-labeled "not planned yet" state; the confirm-path race additionally shows a "this week's prep was already marked complete" note and does not emit `completed`, since that tap did not cause the mutation.
- `frontend/app/components/Domain/Daycare/DaycarePrepReceipt.vue` (+ test) — pure-display receipt view (completed-on date, portions used from the freezer, portions saved back to it, optional expandable per-recipe breakdown), shared by the completion dialog and the already-committed "View Receipt" flow. Renders a "detail unavailable" note instead of the numeric summary lines when `summary` is `null`.
- `frontend/app/components/Domain/Daycare/DaycarePrepUndoControl.vue` (+ test) — the `Undo` control shown for a committed week. There is no sidecar endpoint to pre-check undo safety, so it always offers Undo and attempts `POST /weeks/{week}/undo-complete` behind its own confirmation; a `409 undo_unsafe` response shows a plain-words refusal and hides the button (sticky for that week — enforced by `DaycarePrepCard.vue` keying the control on `week.week_start` so switching weeks remounts it and clears the refusal), any other failure shows a retryable inline error.
- `frontend/app/lib/api/types/daycare.ts` — narrowed `CompletionPreview.recipes`/`summary` and `CommitReceipt.summary` from `Record<string, unknown>` to typed shapes (the sidecar's `completion_preview`/`commit_completion` return these fixed fields; `Artifact`'s `extra="allow"` also means `CommitReceipt` carries `completion_preview` on the wire, added here as an optional field). `CommitReference` (which had mirrored the `409 week_committed` error's `details` shape) was removed once the dialog switched from parsing that error's `details` object to calling `getCommitReceipt()` directly, leaving the type with no consumers.
- `frontend/app/lib/api/user/daycare.ts` (+ test) — added `getCommitReceipt`, a plain read hitting `GET /weeks/{week}/commit-receipt` (no Idempotency-Key). `withIdempotencyKey` preserves a caller-supplied `Idempotency-Key` header instead of always minting one, so `completeWeek`/`undoCompleteWeek` retries can replay the same logical mutation.
- `frontend/app/composables/daycare/use-daycare.ts` (+ test) — `completeWeek`/`undoCompleteWeek` take an optional explicit `idempotencyKey`; added `getCompletionPreview()` and `getCommitReceipt()`, plain on-demand reads (never auto-loaded) returning `{data, error}`.
- `frontend/app/components/Domain/Daycare/DaycarePrepCard.vue` (+ test) — extended with the `Mark Prep Complete` button (disabled while blockers remain), the committed-week state (`Prep completed on <date>`, `View Receipt`, `Undo`), and a single completion-dialog instance (keyed on `week.week_start`) shared by both entry points.
- `frontend/app/pages/g/[groupSlug]/daycare/index.vue` — passes the week/mutating/offline state and the four new `useDaycare()` functions down to `DaycarePrepCard`, and toasts on `completed`/`undone`.

### Phase F5 — Actionable shopping/status blockers (charter §7 Phase 6 "Warnings must be actionable", §17)

- `frontend/app/composables/daycare/use-daycare.ts` (+ test) — added `shoppingBlockers()` and `committedAtFromError()`, pure readers of a `409 shopping_blocked`/`week_committed` error's `details` (mirrors the existing `prep_blocked`/`week_committed` detail-reading pattern already established for `DaycarePrepCompletionDialog`).
- `frontend/app/composables/daycare/daycare-summary.ts` (+ test) — added `parseShoppingBlockers()` (resolves the sidecar's name-only `"<recipe name>: <reason>"` blocker strings back to a recipe slug via the current week's `production_plan` — the same source the sidecar built the blocker text from — so the Shopping card can link to the recipe), `recipeLinksForSlugs()` (resolves a bare slug list, e.g. `processing.recipes_lacking_daycare_yield`, to display names the same way), and `groupRelaxedSpacingWarnings()` (splits the repetitive "Relaxed spacing/repetition for <day> <slot> to use prepared inventory instead of opening new production" planner-warning family out of `week.warnings` into one collapsed count, leaving every other warning individual).
- `frontend/app/components/Domain/Daycare/DaycareShoppingCard.vue` (+ test) — new `week`/`groupSlug` props. A `409 shopping_blocked` (from either the shopping-demand `GET` or a `publish`) now renders a calm, non-error "Shopping needs one more thing" state — each blocker linked to its recipe's Mealie page plus a one-line hint about `daycare_portions_per_batch` — with Preview/Publish disabled rather than a raw error. A committed week (`week.committed`, or a `409 week_committed` publish response as a race-safety fallback) shows "This week is completed and locked" with the commit date and hides the Preview/Publish actions entirely, on both this card and `DaycarePlanCard.vue`'s existing committed notice (which gained the same date).
- `frontend/app/components/Domain/Daycare/DaycareStatusCard.vue` (+ test) — new `groupSlug` prop. Planner warnings are now split into an info-styled collapsed line for the repetitive relaxed-spacing family (`groupRelaxedSpacingWarnings()`, expandable to the original lines) and a warning-styled "Needs attention" list for everything genuinely actionable, individually: a new "N recipes have no daycare batch yield yet" item (from `processing.recipes_lacking_daycare_yield`, expandable to linked recipes — the root cause of a blocked shopping list), a new stale-plan item (`week.stale`/`stale_reason`), a new meal-plan publication-drift item (`week.publication.drift`/`drift_reason`), the existing dead-lettered-processing count, and any remaining raw warning strings (unchanged pass-through, so no warning kind is silently dropped).
- `frontend/app/pages/g/[groupSlug]/daycare/index.vue` — passes `week`/`groupSlug` to `DaycareShoppingCard` and `groupSlug` to `DaycareStatusCard`; suppresses the generic error toast for `shopping_blocked`/`week_committed` publish results (the Shopping card already shows those inline, so a red toast on top would contradict its calm state). Also (same lane, captain's live-use follow-up): the shopping preview toast now states plainly that nothing has published yet and offers a Publish action; a real publish refetches the week (in addition to `publishShopping`'s own shopping refetch) and its success toast states the actual created/updated/deleted counts with an "Open Shopping List" action. `daycare.shopping.publication-never` was reworded to "Not published yet." for the same plain-language reason.

### Phase F7 — Inventory recipe links and editable portions/use-by (captain feedback, 2026-09-03)

- `frontend/app/components/Domain/Daycare/DaycareLotEditDialog.vue` (+ test) — new dialog for correcting one inventory lot's `portions_remaining`/`use_by`. Portions is a numeric field (Save disabled — and, defensively, submission rejected with an inline validation message even if triggered via Enter — while it's not a non-negative number); Use By is a Vuetify date picker in a menu (ISO `YYYY-MM-DD` value, matching `RecipeLastMade.vue`'s existing `date-fns formatISO` pattern) with a `Clear` action to set it back to `null`. Save calls `PATCH /api/daycare/v1/inventory/lots/{lot_id}` via the `updateLot` prop (bound to `useDaycare().updateLot`, which attaches a fresh Idempotency-Key and refetches inventory on completion — mirrors the existing request-then-refetch mutation pattern). A `409 lot_reserved` or `422` (bad date, or — per the sidecar's own validation — a use-by before the lot's made-date) renders inline via the existing `DaycareErrorState`, keeping the dialog open (`keep-open`) so the user can correct and retry; a bare `404`/`405` (the sidecar not yet exposing this route) shows a dedicated "editing not available yet" message instead of a generic error. Fields reset from the current `lot` prop whenever the dialog opens (`watch(modelValue, ..., {immediate: true})`, needed because the parent mounts this component with `modelValue` already `true` — there's no false→true transition to key off of on first open).
- `frontend/app/components/Domain/Daycare/DaycareInventoryCard.vue` (+ test) — each lot row's recipe slug is now a name, resolved from two sources the dashboard already loads: the sidecar's `GET /recipes` summaries (primary — covers every tracked recipe, not just ones on this week's plan) and the current week's plan `PlanRecipeChoice`s (fallback, for recipes the summaries source might not have); a bare humanised slug (`chicken-barley-soup` → `Chicken Barley Soup`) is the last resort when neither has a name. The name links to `/g/{groupSlug}/r/{slug}`, styled as an ordinary underlined title rather than a boxed button (`.daycare-recipe-title-link`, `v-btn variant="text"` with the button chrome stripped via CSS) — same treatment as `DaycarePrepCard.vue` below. Each row gained a pencil icon-button (`daycare.inventory.lot-edit` aria-label) opening `DaycareLotEditDialog` for that lot, keyed on the lot's `id` so switching lots always remounts fresh state; disabled while offline or another mutation is in flight. New props: `groupSlug`, `week`, `recipes`, `mutating`, `offline`, `updateLot`.
- `frontend/app/components/Domain/Daycare/DaycarePrepCard.vue` (+ test) — removed the separate "Open Recipe" button; the production row's recipe name itself is now the link (same `.daycare-recipe-title-link` treatment), removing the now-unused `daycare.prep.open-recipe` string.
- `frontend/app/composables/daycare/use-daycare.ts` (+ test) — added a `recipes` resource (`GET /recipes`, loaded in `refresh()` alongside the other resources) and `updateLot(lotId, payload)`, a request-then-refetch mutation (`runMutation` → `inventory.load()`) matching `updateRecipeDaycare`/`updateSimpleFood`'s existing shape.
- `frontend/app/lib/api/user/daycare.ts` (+ test) — added `updateLot()`, a `PATCH /inventory/lots/{lot_id}` call via `withIdempotencyKey` (same helper every other mutating route uses).
- `frontend/app/lib/api/types/daycare.ts` — added `LotPatch` (`{portions_remaining?, use_by?}`), matching the sidecar's `LotPatch` schema (`services/inventory.py`, `api/schemas.py` on the sidecar's `fm/mdp-lot-edit-endpoint` lane, merged to the sidecar's `main` mid-lane per a live captain update — the sidecar schema also carries `storage`/`notes`, not exposed here since this phase's editor only covers portions/use-by). Only the fields this editor sends are typed; the sidecar's `extra="forbid"` config would 422 on anything else anyway.
- `frontend/app/tests/stub-vuetify.ts` — added `VMenu` (renders both the activator and default slots unconditionally, rather than gating on `modelValue`, so tests can interact with menu contents without first simulating the open click) and `VDatePicker` (a native `<input type="date">` stub emitting a `Date` via `update:modelValue` on `change`, matching how the real Vuetify component's `v-model` behaves) stubs, needed by `DaycareLotEditDialog.test.ts`.
- `frontend/app/pages/g/[groupSlug]/daycare/index.vue` — passes `groupSlug`, `week`, `recipes`, `mutating`, `offline`, and `updateLot` down to `DaycareInventoryCard`.

Live-verified against a disposable copy of the sidecar's staging harness (`dev/staging/` in the sidecar repo, cloned `--shared` into a scratch dir per the lane brief, built from the sidecar's `fm/mdp-lot-edit-endpoint` tip — which had, by the time of this run, already merged to the sidecar's `main`): recipe names resolve and link correctly on the Prepared Food card (confirmed navigation to the recipe page); the edit dialog's portions/use-by/Clear/Save flow works end to end, including persistence across a full page reload; a `422` (use-by before made-date) renders the sidecar's exact message inline without closing the dialog. Screenshots at 390×844 (mobile) and 1440×900 (desktop) are in this phase's PR body. A live `409 lot_reserved` was not reproduced (needs a real plan-driven reservation, which needs recipe classification, which needs the sidecar's processing worker actually draining its queue — out of reach of this staging harness's default `PROCESSING_WORKER_ENABLED=false`/no-loop CLI within this lane's time budget); that path shares the exact same rendering code as the verified `422` case and is covered by dedicated unit tests (`DaycareLotEditDialog.test.ts`, `use-daycare.test.ts`). The 404/405 "editing not available yet" degrade path is unit-tested only — moot as a live check since the sidecar's `main` already has the endpoint.

## Modified upstream files

### Phase 8 — Recipe-page Daycare panel (charter §7 Phase 8, §10, §3.3, §23.9)

| Upstream file | Reason |
| --- | --- |
| `frontend/app/components/Domain/Recipe/RecipePage/RecipePage.vue` | Minimal wiring: one import plus one line rendering `RecipePageDaycarePanel` (view mode only, `v-if="!isEditForm"`) inside the existing content area, right after `RecipePageFooter`. Does not touch `RecipePageHeader.vue` or `RecipeActionMenu.vue` (Phase 9's back/X control). |
| `frontend/app/lang/messages/en-US.json` | Adds the `daycare.recipe.*` translation keys for the panel's labels, edit form, and empty/limited-edit notices; reuses the existing `daycare.plan.*` slot labels and `daycare.errors.*` fallbacks rather than duplicating them. |

### Phase 9 — Recipe page back/X control (charter §7 Phase 9, §23.17)

| Upstream file | Reason |
| --- | --- |
| `frontend/app/components/Domain/Recipe/RecipePage/RecipePageParts/RecipePageHeader.vue` | Forward a new `exit` event from `RecipeActionMenu` up to `RecipePage.vue`, alongside the existing (untouched) `close` event used by edit-mode discard. |
| `frontend/app/components/Domain/Recipe/RecipeActionMenu.vue` | Add a thumb-reachable X/back control, shown only in view mode (`!open`), that emits `exit`. |
| `frontend/app/components/Domain/Recipe/RecipePage/RecipePage.vue` | Minimal wiring: compute the exit destination via `useRecipeExit` and `router.push` it on `@exit`. Does not touch the existing `closeEditor`/discard-dialog logic. |
| `frontend/app/lang/messages/en-US.json` | Add the `general.back-to-recipes` string for the new control's label/tooltip. |

**Follow-up (captain feedback, this lane):** the X/back control originally sat
before `v-spacer`, at the far left of the view-mode action row, styled with
its own one-off props (`variant="text"`, `size="large"`, plus a
`.recipe-exit-btn` CSS rule pinning a 44px min touch target) — visually
distinct from the filled circular `info`-colored buttons (favorite, timeline,
edit, overflow menu) sitting at the far right. Moved it into the same
`div.custom-btn-group` as those buttons, as the last item (after the
overflow `RecipeContextMenu`), and switched its `v-btn` props to exactly
match its neighbours (`icon`, `variant="flat"`, `rounded="circle"`,
`size="small"`, `color="info"`, `class="ml-1"`, `v-icon size="x-large"`),
dropping the now-redundant `.recipe-exit-btn` CSS rule (the shared `size`
prop already gives it the same touch target as its neighbours on both
desktop and the 390×844 mobile viewport). No behavior change: `useRecipeExit`,
the `@exit`/`@close` event wiring, and edit-mode close semantics are
untouched. `frontend/app/components/Domain/Recipe/RecipeActionMenu.test.ts`
gained two tests, both mounted with `loggedIn`/`canEdit` true so the edit
button and the `RecipeContextMenu` overflow button actually render (the
prior tests defaulted both props to `false`, so the exit control was the
only button in the row — a placement assertion against that mount would
pass regardless of where the control sat): one asserts the exit control is
the last button in `.custom-btn-group`, after the overflow button; the
other compares the exit button's `icon`/`variant`/`rounded`/`size`/`color`
attributes against the edit button's rather than hardcoding literal values,
so it actually encodes "matches its neighbours" instead of "matches
whatever I typed."

Also, dropping `.recipe-exit-btn`'s custom CSS (a 44px min-width/min-height
touch-target override) shrinks its hit area to Vuetify's own `size="small"`
sizing — the same as its neighbours. That's the intended effect of "no
custom CSS unless the neighbours have it"; the brief's "thumb-reachable"
requirement is about position (far right, clear of the overflow menu),
confirmed via the PR's attached 390×844 mobile screenshots, not about a
larger-than-sibling touch target.

Net effect on this file's patch surface versus upstream: it shrinks — the
control moved out of the untouched-upstream region before `v-spacer` into
the already-modified `.custom-btn-group` block, so the diff against
upstream `RecipeActionMenu.vue` touches less of the file than before.

### Phase 6 — Daycare dashboard, settings, and API integration

| Upstream file | Reason |
| --- | --- |
| `frontend/app/lib/api/client-user.ts` | Registers the new `DaycareAPI` client (one import, one field, one constructor line) on `UserApiClient`, following the existing pattern used for every other domain client. |
| `frontend/app/components/Layout/DefaultLayout.vue` | Adds one `topLinks` entry ("Daycare") immediately after "Meal Planner", `restricted: true` so it only shows for a signed-in household member in their own group. |
| `frontend/app/lang/messages/en-US.json` | Adds the `daycare.*` translation keys (nav label, dashboard/settings copy, error fallback text). Note: this is the actual Crowdin-source locale file — the task brief's `frontend/app/lang/locales/en-US.json` path does not exist in this repo; only non-English locale files under `frontend/app/lang/messages/` are Crowdin-managed and must never be hand-edited. |

### Phase F4 — End-to-end browser test and custom-image CI (charter §16 "End-to-end browser test", §16 "Upgrade/rebase test", §23.21)

| Upstream file | Reason |
| --- | --- |
| `tests/e2e/playwright.config.ts` | Adds two new projects (`Daycare Mobile Safari`, `Daycare Desktop Chrome`) scoped to `tests/e2e/daycare/**` via `testDir` + `testMatch`; the existing `chromium`/`firefox`/`webkit` project blocks are byte-for-byte unchanged. Scoping is done entirely by project config plus the `*.dc-spec.ts` filename convention (not by a top-level `testIgnore`, which would need reasoning about Playwright's project/top-level option-inheritance rules that isn't worth the risk) — verified with `playwright test --list` that daycare specs run exactly twice (once per new project) and `login.spec.ts`/`oidc-native.spec.ts` still run under all three original projects, zero overlap either direction. |

New files, not upstream (`tests/e2e/daycare/**`):

- `tests/e2e/daycare/primary-workflow.dc-spec.ts` — one sequential Playwright
  test (charter's 9-step flow, in order, via `test.step()`) rather than nine
  independent tests, because most steps depend on state the previous step
  created: the recipe opened in step 4 is the one edited in step 7; the
  current week regenerated in step 3 is the one whose prep is marked
  complete in step 9. Runs on two projects (`Daycare Mobile Safari` /
  `Daycare Desktop Chrome`, see the `playwright.config.ts` entry below) —
  same spec, real iPhone-class and desktop viewports. Captures a numbered
  screenshot per step as a Playwright test attachment and asserts no
  unexpected console/page errors or unexplained HTTP failures across the
  whole flow (see `support.ts` below for the exact allow-list). Both
  projects share one real calendar week (`daycare.dashboard`'s "current
  week", computed from wall-clock date) when run together in one suite
  invocation, so steps 3, 6, and 9 each check observed state (already
  committed / already published) before attempting a mutation, rather than
  assuming a blank slate — the sidecar correctly 409s a second attempt to
  regenerate or re-publish a week the other project's run already
  committed, and a naive test would misread that correct refusal as a
  failure.
- `tests/e2e/daycare/support.ts` — shared helpers: `loginAsStagingAdmin`
  (handles Mealie's one-time "admin setup wizard" skip link, present only
  after the very first login against a fresh database), `attachConsoleGuard`
  (the console/response-error allow-list: benign empty-week 404s from the
  dashboard's own eager fetch, the WebKit-headless "Wake Lock permission
  request denied" `pageerror` that has nothing to do with Daycare, and the
  one documented known-defect 500 below — anything else fails the guard),
  and `createScreenshotStep` (per-test numbered screenshot attachments).

**Playwright/WebKit nav-drawer quirk (mobile project only):** on the
iPhone-class viewport, clicking the "Daycare" nav-drawer link via
Playwright's normal `.click()` fails with "element is outside of the
viewport" — confirmed by direct `boundingBox()` inspection to be false: the
link's measured box (`y:321, height:44`) sits comfortably inside the
390×664 viewport, and the drawer needs no scrolling at all
(`scrollHeight === clientHeight`). `force:true` does not help either — the
same bound is enforced at WebKit's input-dispatch layer, not just
Playwright's actionability wait. Worked around in `openDaycareFromNav()` by
dispatching a plain DOM `.click()` via `locator.evaluate()`, which still
exercises the real `<a href>` / Vue Router navigation while sidestepping
Playwright/WebKit's coordinate-based click dispatch. Chromium is unaffected.

**Known defect: recipe-daycare writes fail against the individual-file
config bind mount.** Every write to a recipe's daycare settings or
classification override — `PUT /api/daycare/v1/recipes/{slug}/daycare`,
exercised by the recipe-page edit form (Phase 6/frontend patch point) — and
every write to `PUT /api/daycare/v1/settings` (the Daycare Settings page's
automation toggles, including `auto_publish_meal_plan`) returns `500
internal_error` when run against `deploy/compose.yaml`'s actual deployment
topology. Root cause, confirmed live against the rehearsal stack (sidecar
container logs): the sidecar's `atomic_write_yaml` (`daycare_processor/
atomic.py`) writes via a temp file plus `os.replace(tmp, path)` for an
atomic swap, but `deploy/compose.yaml` binds `recipe_settings.yaml` and
`overrides.yaml` (and `planner.yaml`, for the settings PUT) as *individual*
files, each its own bind-mount point (confirmed via
`mount | grep overrides` inside the container: `/dev/sdd on
/app/config/overrides.yaml type ext4`). `os.replace()` cannot atomically
replace a path that is itself a distinct mount point — the kernel refuses
with `OSError: [Errno 16] Device or resource busy`. This is a **new**
finding, distinct from the already-documented "whole-directory bind would
shadow baked-in static files" constraint in `deploy/README.md` "Config
mount" — that section explains why the four files are bound individually
in the first place; this defect is a consequence of that same individual
binding colliding with the sidecar's own atomic-write pattern, not
previously exercised against a live gateway before this lane's rehearsal.
This blocks charter completion criteria §23.9 ("Recipe-specific daycare
settings can be viewed/edited in Mealie") and §23.10 ("Global planner
settings can be edited through Mealie by authorized users") outright — as
deployed, *no* Daycare setting can be saved through the UI at all. Filed as
a note to firstmate in the sidecar repo's `docs/FOLLOWUPS.md`
(`blocked:` — it blocks charter §23.9/§23.10, out of this lane's file
ownership to fix: the fix is either a sidecar `src/` change — write mutable
config through a directory the compose file binds as a whole, per the
already-recorded follow-up in `deploy/README.md`'s own "Config mount" —
or a `deploy/compose.yaml` change, both outside `tests/e2e/**` /
`playwright.config.ts` / this workflow file / this doc). `primary-
workflow.dc-spec.ts`'s step 7 exercises the real UI edit and asserts the
**current** (broken) behavior on purpose — a `500`/"An internal error
occurred." toast — rather than skipping the step, so the test starts
failing loudly the moment this is fixed, which is the signal to flip that
one assertion back to "persists". `attachConsoleGuard`'s allow-list tracks
this one exact known-defect response (`PUT .../recipes/{slug}/daycare` →
`500`) rather than silently ignoring all errors, so a genuinely new failure
elsewhere still fails the suite.

**Rehearsal-only config workaround (setup, not part of the flow under
test):** the stub LLM classifier (`LLM_PROVIDER=stub`) deterministically
assigns every fixture recipe to `lunch`/`main` — it reads no recipe content
for slot assignment, per its own docstring ("placeholders, not
judgements"). Weekly regeneration therefore always fails
(`409 planning_failed`, `"No eligible recipes for breakfast"`) against an
unmodified fixture set, and `DaycarePrepCard`'s "Mark Prep Complete" stays
blocked on "batch size is not calibrated" without a
`daycare_portions_per_batch` value. Both the known defect above (writes
broken) *and* the charter's hard rule against giving the frontend a second
mutation path make fixing this by calling the sidecar API a non-option, so
`overrides.yaml`, `recipe_settings.yaml`, and `planner.yaml`
(`automation.auto_publish_meal_plan: true` — off by default, and there is
no other way to turn it on given the known defect above) are pre-seeded
directly on the host before the sidecar container's first start (the same
mechanism `deploy/README.md` "First start" step 3 already documents for a
from-scratch install) rather than through the API. See the `daycare-e2e`
job in `.github/workflows/daycare-pr.yml` for the exact file contents used
in CI, or the "E2E rehearsal" section below for the equivalent local
sequence.

## Daycare e2e CI

The `daycare-e2e` job in `.github/workflows/daycare-pr.yml` is
`workflow_dispatch`-only (run it by hand from the Actions tab), not
automatic on every PR, for one concrete reason: **it needs a second,
private repository checked out** — `cch3-IU/mealie-daycare-processor`, for
`deploy/compose.yaml`, `deploy/build-sidecar.sh`, and
`dev/staging/fixtures` — via `actions/checkout` with `secrets.
DAYCARE_SIDECAR_PAT`, a cross-repo PAT this fork's default `GITHUB_TOKEN`
cannot provide (`GITHUB_TOKEN` is scoped to the repository the workflow
runs in). That secret does not exist in this fork yet; add it (a
fine-grained PAT with read access to `cch3-IU/mealie-daycare-processor`)
before the first manual run. This is a hard blocker on automatic
triggering, not a time-budget judgment call — the image-build job above
covers the part of charter §16 that *can* run on every PR.

When run, the job: builds `custom-mealie` from this checkout's HEAD and
`daycare-processor` from the sidecar checkout
(`deploy/build-sidecar.sh --allow-dirty`, since a CI checkout of a
just-cloned repo has no meaningful "clean working tree" concept to
protect); brings up `deploy/compose.yaml` + `deploy/compose.rehearsal.yaml`
on `127.0.0.1:29931` with a throwaway `$GITHUB_WORKSPACE/rehearsal`
data/config directory (never `dev/staging`, never production, never port
9925); mints a fresh Mealie service-account token and seeds the 11
`dev/staging/fixtures/recipes/*.json` recipes via `dev/staging/seed.sh`
pointed at the gateway; runs one full processing poll (`full: true`) plus,
after the sidecar's `quiet_seconds` debounce (120s default — see
`docs/OPERATIONS.md` §8), a second poll (`full: false`) to actually
classify them; runs both Playwright projects; uploads the HTML report as a
workflow artifact; and tears the stack down (`down --volumes`) whether or
not the suite passed.

## E2E rehearsal (2026-09-03, this lane)

Run against a throwaway `deploy/compose.yaml` + `deploy/compose.rehearsal.yaml`
stack on `127.0.0.1:29931`, built from this checkout's HEAD and a `git
clone --shared` of the sidecar repo into `.scratch/mealie-daycare-processor`
(gitignored) inside this worktree — never `dev/staging` directly (shared,
fixed ports, may be held by another lane), never production, never port
9925. `custom-mealie:v3.25.0-daycare-<sha>` built via a direct
`docker build -f docker/Dockerfile .` from this checkout (not
`deploy/build-mealie.sh`, which clones from GitHub and so cannot see an
unpushed branch); `daycare-processor` built via the sidecar's own
`deploy/build-sidecar.sh`. Seeded via `dev/staging/seed.sh` pointed at the
rehearsal gateway (`MEALIE_URL=http://127.0.0.1:29931`), plus the
rehearsal-only config workaround described above.

**Local execution note:** this host's Ubuntu release (26.04) is newer than
Playwright 1.60's supported-OS table (max `ubuntu24.04`) and this session
has no passwordless `sudo`, so `playwright install --with-deps` cannot
install browser system dependencies here directly. Ran the suite instead
inside the official `mcr.microsoft.com/playwright:v1.60.0-noble` Docker
image (`docker run --network host -v tests/e2e:/e2e ... npx playwright
test`), which bundles matching browsers and all system dependencies — this
is also a reasonable pattern for anyone else hitting the same host
constraint locally; GitHub-hosted CI runners are on a supported Ubuntu and
need no such workaround.

**Final clean run (fresh stack, single invocation, no retries), both
projects together:**

| Metric | Result |
| --- | --- |
| `Daycare Desktop Chrome` › primary-workflow | passed, 1 attempt |
| `Daycare Mobile Safari` › primary-workflow | passed, 1 attempt |
| Total wall time (both projects, one worker, includes step 7's known-defect assertion) | 43.7s |
| Screenshots captured | 9 per project (18 total), attached to the Playwright HTML report |
| Console/page-error guard | clean (0 unexpected) on both projects |

Getting to a clean single-invocation run took several iterations, most
instructively: the mobile-project WebKit nav-drawer quirk above, and — the
main structural lesson — steps 3/6/9 needed to check observed committed/
published state before mutating, once it became clear both projects
legitimately race for the same real-world "current week" when run together
against one shared stack (see the `primary-workflow.dc-spec.ts` bullet
above).

## Development notes

Fork-local quirks worth knowing before touching anything above, kept here
rather than in upstream's `AGENTS.md`/`CLAUDE.md` (charter §12: prefer new
files and narrow patch points over edits to upstream-owned files, including
docs, to keep the rebase surface small):

- **`pnpm` via corepack is broken in this checkout:** `frontend/package.json`'s
  `devEngines.packageManager` (`{name:"pnpm",version:"11"}`) makes the corepack
  `pnpm` shim fail with `Invalid package manager specification ... expected a
  semver version`. Use `npx --yes pnpm@latest <command>` instead (or any pnpm
  installed outside corepack).
- **Frontend dev server API proxying:** `frontend/server/api/[...].ts` is a
  Nitro catch-all that proxies every `/api/**` request to
  `runtimeConfig.apiUrl` (default `http://localhost:9000`, override via the
  `API_URL` env var) — there is no separate Vite dev-proxy config. Point
  `API_URL` at a different backend (e.g. a staging gateway) to run `nuxt dev`
  against it — this is how the Daycare dashboard was verified against the
  disposable staging stack's Caddy gateway.
