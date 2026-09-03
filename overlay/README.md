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

- `frontend/app/components/Domain/Daycare/DaycarePrepCompletionDialog.vue` (+ test) — the `Mark Prep Complete` preview/confirm dialog on the Prep card. For an unplanned/uncommitted week it fetches `GET /weeks/{week}/completion-preview` and renders the per-recipe breakdown in plain words (existing portions consumed, new portions produced, allocated to this week, leftovers to the freezer), surfacing a `409 prep_blocked` as a blocker list and a `404` as "not planned yet" instead of a generic error. Confirming calls `POST /weeks/{week}/complete` with one Idempotency-Key minted when the dialog opens and reused for the life of that confirmation, so a same-session retry replays the stored response; the dialog also reuses this component (with `committed: true`) as the "View Receipt" action for an already-committed week, since the sidecar has no read endpoint for the persisted receipt — it POSTs a fresh attempt and reads the summary back off the `409 week_committed` error's `details` (`WeekService._commit_reference`) when the commit already exists.
- `frontend/app/components/Domain/Daycare/DaycarePrepReceipt.vue` (+ test) — pure-display receipt view (completed-on date, portions used from the freezer, portions saved back to it, optional expandable per-recipe breakdown), shared by the completion dialog and the already-committed "View Receipt" flow.
- `frontend/app/components/Domain/Daycare/DaycarePrepUndoControl.vue` (+ test) — the `Undo` control shown for a committed week. There is no sidecar endpoint to pre-check undo safety, so it always offers Undo and attempts `POST /weeks/{week}/undo-complete` behind its own confirmation; a `409 undo_unsafe` response shows a plain-words refusal and hides the button (sticky for that week), any other failure shows a retryable inline error.
- `frontend/app/lib/api/types/daycare.ts` — narrowed `CompletionPreview.recipes`/`summary` and `CommitReceipt.summary` from `Record<string, unknown>` to typed shapes (the sidecar's `completion_preview`/`commit_completion` return these fixed fields; `Artifact`'s `extra="allow"` also means `CommitReceipt` carries `completion_preview` on the wire, added here as an optional field), and added `CommitReference` for the `details` shape of a `409 week_committed` error.
- `frontend/app/lib/api/user/daycare.ts` (+ test) — `withIdempotencyKey` now preserves a caller-supplied `Idempotency-Key` header instead of always minting one, so `completeWeek`/`undoCompleteWeek` retries can replay the same logical mutation.
- `frontend/app/composables/daycare/use-daycare.ts` (+ test) — `completeWeek`/`undoCompleteWeek` take an optional explicit `idempotencyKey`; added `getCompletionPreview()`, a plain on-demand read (never auto-loaded) returning `{data, error}`.
- `frontend/app/components/Domain/Daycare/DaycarePrepCard.vue` (+ test) — extended with the `Mark Prep Complete` button (disabled while blockers remain), the committed-week state (`Prep completed on <date>`, `View Receipt`, `Undo`), and the new dialog/undo-control wiring.
- `frontend/app/pages/g/[groupSlug]/daycare/index.vue` — passes the week/mutating/offline state and the three new `useDaycare()` functions down to `DaycarePrepCard`, and toasts on `completed`/`undone`.

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

### Phase 6 — Daycare dashboard, settings, and API integration

| Upstream file | Reason |
| --- | --- |
| `frontend/app/lib/api/client-user.ts` | Registers the new `DaycareAPI` client (one import, one field, one constructor line) on `UserApiClient`, following the existing pattern used for every other domain client. |
| `frontend/app/components/Layout/DefaultLayout.vue` | Adds one `topLinks` entry ("Daycare") immediately after "Meal Planner", `restricted: true` so it only shows for a signed-in household member in their own group. |
| `frontend/app/lang/messages/en-US.json` | Adds the `daycare.*` translation keys (nav label, dashboard/settings copy, error fallback text). Note: this is the actual Crowdin-source locale file — the task brief's `frontend/app/lang/locales/en-US.json` path does not exist in this repo; only non-English locale files under `frontend/app/lang/messages/` are Crowdin-managed and must never be hand-edited. |

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
