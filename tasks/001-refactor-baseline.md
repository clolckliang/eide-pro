# 001 - Refactor Baseline

## Goal

Establish the first controlled refactor baseline for EIDE Pro without changing runtime behavior.

This task records the repository guidance, the current architecture state, and the next small refactor step. It intentionally does not implement exporters, debug backends, Agent tools, Live Watch, MCP integration, or PID tuning.

## Current Baseline

- Repository-level Agent instructions are maintained in `AGENTS.md`.
- The current `src/` layout is still legacy-oriented and includes `constants`, `importers`, `models`, `providers`, `test`, `utils`, and `WebInterface`.
- No existing files were found for `EideProjectContext`, `NormalizedProjectModel`, `ExportManager`, `DebugBackend`, `AgentToolRegistry`, or `AgentPermissionManager`.
- `package.json` currently defines `test`, `lint`, and `compile` scripts.
- `package.json` does not currently define `test:unit`.

## Next Recommended Refactor Step

Add or verify:

- `EideProjectContext`
- `NormalizedProjectModel`
- `ExportManager`
- `DebugBackend`
- `AgentToolRegistry`
- `test:unit`

Keep the next step small and reviewable. Prefer pure TypeScript modules for core models and managers, and avoid changing legacy runtime behavior while establishing the skeleton.

## Checks For This Baseline Task

- Run `npm run test:unit` if available.
- Run `npm run lint`.
- Skip `npm run compile` unless additional verification is needed, because this task is documentation-only.
- Commit only `AGENTS.md` and this task file.
