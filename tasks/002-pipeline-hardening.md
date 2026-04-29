# 002 - Pipeline Hardening

## Goal

Prove the pure legacy-to-export pipeline without adding VS Code command integration or changing runtime behavior.

Target path:

```txt
LegacyProjectContextAdapter
        |
        v
projectContextToNormalizedModel
        |
        v
createDefaultExportManager
        |
        v
CMake / Makefile / Agent Context preview
```

## Scope

- Add one pure end-to-end composition unit test for the path above.
- Preview all default exporters from one legacy fixture.
- Keep the test preview-only and in-memory.
- Optionally add a tiny shared export result/status helper only if it removes repeated status derivation in at least two exporters.

## Expected Exporter Statuses

For the existing legacy fixture shape that maps to `armclang`:

```txt
cmake: success
makefile: partial
agent-context: success
```

## Acceptance Criteria

- The composition test asserts:
  - each default exporter runs through `ExportManager`
  - `generatedFiles.length > 0`
  - `outputRoot` equals the test preview root
  - preview artifacts exist in returned exporter results
  - the nonexistent preview output path is not created on disk
- Any helper introduced:
  - does not change `ExportResult`
  - does not change exporter behavior
  - does not add file writes
  - is used by at least two exporters
- Do not modify `tasks/001-refactor-baseline.md`.
- Do not add VS Code export command/controller integration in this task.

## Checks

```bash
npm run test:unit
npm run lint
npx tsc --noEmit --strict --skipLibCheck --module commonjs --moduleResolution node --target es2018 --typeRoots ./node_modules/@types --types "node,mocha" src/legacy/LegacyProjectContextAdapter.ts src/core/project/ProjectContextToNormalizedModel.ts src/exporters/DefaultExportManager.ts src/exporters/cmake/CMakeExporter.ts src/exporters/makefile/MakefileExporter.ts src/exporters/agent-context/AgentContextExporter.ts src/test/unit/legacy/LegacyProjectContextAdapter.test.ts src/test/unit/core/ProjectContextToNormalizedModel.test.ts src/test/unit/exporters/DefaultExportManager.test.ts
```

Skip `npm run compile` unless this task unexpectedly touches runtime glue.

## Explicit Deferrals

- VS Code export command integration.
- Broad mapper fidelity expansion.
- New exporter features.
- Exporter file-writing behavior.
- `ExportResult` shape changes.
