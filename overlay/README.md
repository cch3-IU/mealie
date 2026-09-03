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

## Modified upstream files

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
