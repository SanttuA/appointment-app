# Agent Engineering Rules

## Modularity

- Prefer feature and domain modules over large mixed files.
- Split production files before they exceed roughly 500 lines unless the file is generated, declarative data, or has a short written justification.
- Keep React components presentational where practical. Put workflow state in hooks or controller components, and put pure logic in utility modules.
- Keep API handlers thin and grouped by domain. Shared schemas, serializers, authorization checks, and validation helpers belong in route support modules.
- Preserve public entrypoints when refactoring so callers keep working during modularization.

## Verification

- Preserve HTTP routes, response shapes, auth behavior, test ids, translations, and database schema unless the task explicitly asks for a contract change.
- Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm test` after modular refactors.
- Run relevant Playwright e2e coverage for UI or workflow refactors; use `pnpm --filter @appointment/web e2e --project=chromium` for a focused desktop pass.
- Add focused tests when extracting pure utility behavior that was previously only covered indirectly.
