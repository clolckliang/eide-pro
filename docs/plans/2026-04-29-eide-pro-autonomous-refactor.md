# EIDE Pro Autonomous Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a long-running, quality-gated refactor program that gradually moves EIDE Pro from legacy monoliths toward the layered architecture described in `AGENTS.md`.

**Architecture:** The plan uses a rolling task queue, strict branch/PR gates, small commits, and automated verification before each next task. Autonomous execution may create code, tests, docs, and PR updates, but it must not merge, force-push, flash hardware, run raw GDB, write memory, or apply PID changes.

**Tech Stack:** TypeScript, VS Code extension APIs, Mocha, ts-node, ESLint, GitHub PR workflow, existing EIDE Pro legacy project/runtime modules.

---

## Operating Model

This is an autonomous refactor program, not a single mega-refactor.

Each loop must follow:

```txt
Inspect current branch
        |
        v
Pick one task from tasks/
        |
        v
Write or update focused tests
        |
        v
Implement minimal code
        |
        v
Run verification
        |
        v
Commit focused change
        |
        v
Push PR branch
        |
        v
Record next task
```

Autonomous execution is allowed to continue only while all safety gates pass.

Stop and ask for human input when:

- `npm run test:unit` fails for unclear reasons
- `npm run lint` gains new errors
- a task requires touching `src/EIDEProjectExplorer.ts`, `src/extension.ts`, or `src/EIDEProject.ts` with more than tiny glue
- a task requires hardware behavior
- a task requires changing package dependencies
- a task requires broad compile-error cleanup
- the branch diverges from the active PR strategy

## Branch And PR Policy

Primary long-running branch:

```txt
refactor/architecture-foundation
```

The branch may collect small commits, but each commit must remain reviewable.

Never:

- merge to `master` automatically
- force-push
- delete remote branches
- rewrite existing PR history without explicit approval

Preferred commit cadence:

```txt
1 task = 1 commit
1 architecture slice = 1 PR review section
```

## Required Checks Per Loop

Always run:

```bash
npm run test:unit
npm run lint
```

For new pure TypeScript modules, also run targeted strict typecheck:

```bash
npx tsc --noEmit --strict --skipLibCheck --module commonjs --moduleResolution node --target es2018 --typeRoots ./node_modules/@types --types "node,mocha" <new-files-and-tests>
```

Run `npm run compile` only when the task changes runtime glue or activation paths.

If `npm run compile` fails due to known legacy TypeScript issues unrelated to the task, report the failure and do not fix broad legacy errors.

## Autonomous Loop State

Use these repository artifacts:

- `tasks/NNN-*.md` for executable task cards
- `docs/plans/` for long-running plans
- PR description/checklist for external review state

Do not commit local runtime state folders such as:

- `.omx/`
- temporary sandbox logs
- generated local cache files

## Phase 0: Freeze And Review Foundation

**Goal:** Keep the current architecture branch reviewable before deeper runtime migration.

### Task 0.1: Verify PR Branch Health

**Files:**
- Read: `AGENTS.md`
- Read: `tasks/001-refactor-baseline.md`
- Read: `tasks/002-pipeline-hardening.md`
- Read: `tasks/003-vscode-export-preview-controller.md`

**Step 1: Inspect status**

Run:

```bash
git status --short --branch
```

Expected: only intentional local changes. Do not stage unrelated `AGENTS.md` edits unless the task is specifically about that file.

**Step 2: Run checks**

Run:

```bash
npm run test:unit
npm run lint
```

Expected: unit tests pass; lint has no errors.

**Step 3: Record branch health**

Update the active PR description or next task card with:

- latest commit
- test result
- lint result
- compile status if run

**Step 4: Commit**

Only commit if a task/status file changed.

```bash
git add tasks/<task-file>.md
git commit -m "docs: record architecture branch health"
```

## Phase 1: VS Code Export Preview Glue

**Goal:** Connect the new export pipeline to VS Code through tiny glue without replacing legacy export commands yet.

### Task 1.1: Add Project Context Provider Port

**Files:**
- Create: `src/vscode/project/ActiveProjectContextProvider.ts`
- Test: `src/test/unit/vscode/ActiveProjectContextProvider.test.ts`
- Read: `src/legacy/LegacyProjectContextAdapter.ts`
- Read: `src/vscode/commands/ProjectExportPreviewController.ts`

**Step 1: Write failing test**

Test that a provider wraps an injected legacy project getter and returns `undefined` when no active project exists.

**Step 2: Run targeted test**

```bash
npm run test:unit -- --grep "ActiveProjectContextProvider"
```

Expected: fail because the provider does not exist.

**Step 3: Implement minimal provider**

The provider should:

- accept `() => LegacyProjectLike | undefined`
- call `createEideProjectContextFromLegacyProject`
- return `undefined` when no legacy project is available
- avoid importing `vscode`

**Step 4: Verify**

```bash
npm run test:unit
npm run lint
```

**Step 5: Commit**

```bash
git add src/vscode/project/ActiveProjectContextProvider.ts src/test/unit/vscode/ActiveProjectContextProvider.test.ts
git commit -m "refactor: add active project context provider"
```

### Task 1.2: Add Export Preview Command Handler

**Files:**
- Create: `src/vscode/commands/ProjectExportPreviewCommand.ts`
- Test: `src/test/unit/vscode/ProjectExportPreviewCommand.test.ts`
- Read: `src/vscode/commands/ProjectExportPreviewController.ts`

**Step 1: Write failing tests**

Cover:

- exporter selection input is validated
- output root input is validated
- preview result is returned without writing files
- controller errors are converted to user-facing command results

**Step 2: Implement handler without importing VS Code**

Use ports:

```ts
interface ExportPreviewUi {
    selectExporter(...): Promise<string | undefined>;
    selectOutputRoot(...): Promise<string | undefined>;
    showInfo(message: string): void;
    showError(message: string): void;
}
```

**Step 3: Verify**

```bash
npm run test:unit
npm run lint
```

**Step 4: Commit**

```bash
git add src/vscode/commands/ProjectExportPreviewCommand.ts src/test/unit/vscode/ProjectExportPreviewCommand.test.ts
git commit -m "refactor: add export preview command handler"
```

### Task 1.3: Register Command With Tiny Runtime Glue

**Files:**
- Modify: `src/extension.ts`
- Modify: `package.json`
- Test: existing unit tests only unless a pure registration helper is extracted

**Step 1: Inspect current command IDs**

Search existing export commands:

```bash
Select-String -Path package.json,src/extension.ts -Pattern "exportMakefile|exportXml|exportAsTemplate"
```

**Step 2: Add one new command ID**

Suggested command:

```txt
_cl.eide.project.export.preview
```

Do not replace existing legacy commands.

**Step 3: Register tiny glue only**

`extension.ts` may only:

- construct the provider/controller/command handler
- register the command
- delegate execution

No export business logic goes into `extension.ts`.

**Step 4: Verify**

```bash
npm run test:unit
npm run lint
npm run compile
```

If compile fails due to unrelated legacy errors, report it.

**Step 5: Commit**

```bash
git add src/extension.ts package.json
git commit -m "refactor: register export preview command"
```

## Phase 2: Export Pipeline Maturity

**Goal:** Move from preview-only exporters toward controlled write-capable exporters without changing legacy behavior.

### Task 2.1: Add Export Write Plan Model

**Files:**
- Create: `src/core/export/ExportPlan.ts`
- Test: `src/test/unit/core/ExportPlan.test.ts`

**Behavior:**

- represent files to write
- represent overwrite policy
- represent dry-run mode
- represent diagnostics

Do not write files yet.

### Task 2.2: Add Safe Export Writer

**Files:**
- Create: `src/core/export/ExportWriter.ts`
- Test: `src/test/unit/core/ExportWriter.test.ts`

**Behavior:**

- write only inside selected output root
- reject path traversal
- support dry-run
- return written file report

### Task 2.3: Add VS Code Export Write Command

Only after Tasks 2.1 and 2.2 are complete and tested.

Keep legacy export commands intact.

## Phase 3: Build And Toolchain Core Extraction

**Goal:** Add pure core models before extracting behavior from legacy build code.

### Task 3.1: Add BuildResult And BuildDiagnostic Models

**Files:**
- Create: `src/core/build/BuildResult.ts`
- Test: `src/test/unit/core/BuildResult.test.ts`

No runtime build execution.

### Task 3.2: Add Toolchain Descriptor Model

**Files:**
- Create: `src/core/toolchain/ToolchainDescriptor.ts`
- Test: `src/test/unit/core/ToolchainDescriptor.test.ts`

No toolchain probing yet.

### Task 3.3: Add Legacy Build Context Adapter

**Files:**
- Create: `src/legacy/LegacyBuildContextAdapter.ts`
- Test: `src/test/unit/legacy/LegacyBuildContextAdapter.test.ts`

Read-only adapter only.

## Phase 4: Debug Integration Hardening

**Goal:** Keep debug abstraction pure and permission-safe before runtime command integration.

### Task 4.1: Add Debug Command Handler Ports

**Files:**
- Create: `src/vscode/commands/DebugPreviewCommand.ts`
- Test: `src/test/unit/vscode/DebugPreviewCommand.test.ts`

Only preview launch configs. Do not start debug.

### Task 4.2: Add Debug Validation Command

**Files:**
- Create: `src/vscode/commands/DebugValidateCommand.ts`
- Test: `src/test/unit/vscode/DebugValidateCommand.test.ts`

Only validation. Do not start GDB or debug adapters.

## Phase 5: Agent Tool Expansion

**Goal:** Expand Agent-callable tools only through permission gates.

### Task 5.1: Add Agent Audit Log Interface

**Files:**
- Create: `src/agent/tools/AgentAuditLog.ts`
- Test: `src/test/unit/agent/AgentAuditLog.test.ts`

Start with in-memory/no-op implementation.

### Task 5.2: Add Readonly Build Log Tool

**Files:**
- Create: `src/agent/tools/BuildAgentTools.ts`
- Test: `src/test/unit/agent/BuildAgentTools.test.ts`

Readonly only. No build execution.

### Task 5.3: Add Readonly Live Watch Tree Tool

**Files:**
- Create: `src/agent/tools/LiveWatchAgentTools.ts`
- Test: `src/test/unit/agent/LiveWatchAgentTools.test.ts`

Readonly only. No sampling, no GDB.

## Phase 6: Live Watch Incremental Core

**Goal:** Build Live Watch from pure display/tree logic toward sampling, but do not connect hardware until permission gates exist.

### Task 6.1: Add Type Resolver Interfaces

**Files:**
- Create: `src/debug/live-watch/TypeResolver.ts`
- Test: `src/test/unit/debug/TypeResolver.test.ts`

No GDB calls.

### Task 6.2: Add Expression Expander

**Files:**
- Create: `src/debug/live-watch/ExpressionExpander.ts`
- Test: `src/test/unit/debug/ExpressionExpander.test.ts`

Pure expression generation only.

### Task 6.3: Add Sampler Interface

**Files:**
- Create: `src/debug/live-watch/LiveWatchSampler.ts`
- Test: `src/test/unit/debug/LiveWatchSampler.test.ts`

Interface and fake sampler only. No hardware.

## Phase 7: PID Tuning Safety Envelope

**Goal:** Keep PID work safety-first and never allow autonomous writes.

### Task 7.1: Add PID Session Model

**Files:**
- Create: `src/debug/pid-tuner/PidSession.ts`
- Test: `src/test/unit/debug/PidSession.test.ts`

No device operations.

### Task 7.2: Add PID Suggestion Report

**Files:**
- Create: `src/debug/pid-tuner/PidReportGenerator.ts`
- Test: `src/test/unit/debug/PidReportGenerator.test.ts`

Suggestion/report only.

### Task 7.3: Add PID Approval Boundary

**Files:**
- Create: `src/debug/pid-tuner/PidApprovalPolicy.ts`
- Test: `src/test/unit/debug/PidApprovalPolicy.test.ts`

All apply/write actions must require explicit user approval.

## Phase 8: Large File Decomposition

**Goal:** Shrink legacy monoliths only after new services exist.

Do not start by deleting code.

Preferred extraction order:

```txt
src/EIDEProjectExplorer.ts
        |
        +-- command glue
        +-- tree item glue
        +-- export glue
        +-- debug config glue
        +-- source tree operations
```

### Task 8.1: Extract Export Glue Only

**Files:**
- Create: `src/vscode/commands/LegacyExportCommands.ts`
- Modify: `src/EIDEProjectExplorer.ts`
- Test: unit tests if pure seams are available

Rules:

- move logic only after tests or characterization are present
- preserve command behavior
- no exporter feature changes

### Task 8.2: Extract Debug Config Glue Only

Same pattern. One behavior area per commit.

## Autonomous Task Selection Rules

Pick the next task using this priority:

1. Finish a partially started task.
2. Add tests around an existing new architecture module.
3. Add pure model/interface needed by the next migration.
4. Add a tiny VS Code glue layer that delegates to tested modules.
5. Extract one small legacy behavior into a tested adapter.

Never pick:

- large rewrites
- dependency upgrades
- broad formatting
- broad compile-error cleanup
- package-lock churn
- hardware operations
- PID writes

## Automation Guardrails

Allowed autonomous actions:

- create/update task cards
- create/update plan docs
- add pure TypeScript modules
- add unit tests
- run unit/lint/typecheck
- commit focused changes
- push to the active PR branch

Requires explicit human approval:

- merge PR
- force push
- dependency changes
- package-lock changes
- `src/EIDEProjectExplorer.ts` large edits
- `src/extension.ts` non-trivial edits
- `src/EIDEProject.ts` edits
- hardware flashing
- chip erase
- raw GDB commands
- memory writes
- PID parameter writes

## Daily / Session Cadence

At the start of each long-running session:

1. Run `git status --short --branch`.
2. Confirm active branch.
3. Read the latest `tasks/NNN-*.md`.
4. Select one task.
5. State protected files.
6. Run or add tests first.

At the end of each session:

1. Run verification.
2. Commit only the task files.
3. Push the branch if requested or already established for the active PR.
4. Report:
   - branch
   - commit hash
   - files changed
   - commands run
   - test/lint/typecheck/compile result
   - residual local changes

## Immediate Next Five Tasks

1. `004-active-project-context-provider`
   - Add read-only provider from active legacy project to `EideProjectContext`.
2. `005-export-preview-command-handler`
   - Add pure command handler ports around `ProjectExportPreviewController`.
3. `006-register-export-preview-command`
   - Tiny `extension.ts` and `package.json` glue only.
4. `007-export-plan-model`
   - Add write-plan model without writing files.
5. `008-safe-export-writer`
   - Add guarded writer with dry-run and path traversal tests.

## Plan Completion Criteria

This plan is working when:

- the architecture branch keeps passing `npm run test:unit`
- new modules stay covered by unit tests
- legacy behavior remains intact
- PR review can follow small commits
- `src/EIDEProjectExplorer.ts`, `src/extension.ts`, and `src/EIDEProject.ts` shrink or stay stable
- no autonomous task performs hardware-affecting behavior
