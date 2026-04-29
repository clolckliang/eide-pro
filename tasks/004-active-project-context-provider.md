# 004 - Active Project Context Provider

## Goal

Add a small VS Code-layer provider that turns the currently active legacy project into an `EideProjectContext` without importing VS Code APIs or changing runtime behavior.

Target path:

```txt
active legacy project getter
        |
        v
ActiveProjectContextProvider
        |
        v
LegacyProjectContextAdapter
        |
        v
EideProjectContext
```

## Scope

- Add `src/vscode/project/ActiveProjectContextProvider.ts`.
- Add focused unit tests under `src/test/unit/vscode/`.
- Keep the provider read-only.
- Do not register VS Code commands in this task.
- Do not modify `src/EIDEProjectExplorer.ts`, `src/extension.ts`, or `src/EIDEProject.ts`.

## Acceptance Criteria

- Returns `undefined` when no legacy project is active.
- Converts an active legacy project into `EideProjectContext`.
- Uses the injected getter each time and does not cache stale project state.
- Does not import `vscode`.

## Explicit Deferrals

- Wiring to `ProjectExplorer`.
- Wiring to `ProjectExportPreviewController`.
- Command registration.
- Export file writing.
