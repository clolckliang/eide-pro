# 003 - VS Code Export Preview Controller

## Goal

Prepare the first small VS Code-layer bridge for the new export pipeline without registering commands or changing runtime behavior yet.

Target path:

```txt
Active EideProjectContext
        |
        v
projectContextToNormalizedModel
        |
        v
ExportManager
        |
        v
export preview result
```

## Scope

- Add a controller module under `src/vscode/commands/`.
- Keep it unit-testable without the VS Code Extension Host.
- Do not import `vscode` in this first controller.
- Do not write exporter artifacts to disk.
- Do not change existing legacy export commands.

## Acceptance Criteria

- The controller can list exporters from an injected `ExportManager`.
- The controller can preview a selected exporter from an active `EideProjectContext`.
- Missing active project context is reported as an error.
- Blank exporter id is rejected before reading project context.

## Explicit Deferrals

- Command registration in `src/extension.ts`.
- New menu contributions in `package.json`.
- File-writing export behavior.
- Replacing legacy `ExportMakefile`, `ExportKeilXml`, or template export commands.
