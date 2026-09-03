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

## Modified upstream files

### Phase 9 — Recipe page back/X control (charter §7 Phase 9, §23.17)

| Upstream file | Reason |
| --- | --- |
| `frontend/app/components/Domain/Recipe/RecipePage/RecipePageParts/RecipePageHeader.vue` | Forward a new `exit` event from `RecipeActionMenu` up to `RecipePage.vue`, alongside the existing (untouched) `close` event used by edit-mode discard. |
| `frontend/app/components/Domain/Recipe/RecipeActionMenu.vue` | Add a thumb-reachable X/back control, shown only in view mode (`!open`), that emits `exit`. |
| `frontend/app/components/Domain/Recipe/RecipePage/RecipePage.vue` | Minimal wiring: compute the exit destination via `useRecipeExit` and `router.push` it on `@exit`. Does not touch the existing `closeEditor`/discard-dialog logic. |
| `frontend/app/lang/messages/en-US.json` | Add the `general.back-to-recipes` string for the new control's label/tooltip. |

Not touched: `DefaultLayout.vue`, Daycare nav/pages/client code — owned by a parallel lane.
