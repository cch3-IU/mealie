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

## Modified upstream files

(none yet)
