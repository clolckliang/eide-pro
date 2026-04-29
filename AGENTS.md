# AGENTS.md

## Project Overview

EIDE Pro is a VS Code extension for embedded MCU development.

The project extends the original EIDE-style workflow and is being evolved into a modern embedded development platform with:

- legacy EIDE project compatibility
- Keil, IAR, Eclipse, CMake, and SCons project import
- project export and migration to CMake, Makefile, VS Code, PlatformIO, and Agent Context packages
- embedded debug backend abstraction
- Cortex-Debug and MCU-Debug integration
- Keil-like Live Watch Tree
- Agent-callable build, debug, export, and analysis tools
- future PID tuning and automatic debug workflows

This repository is in a long-term refactor. The goal is not to rewrite everything at once. The goal is to gradually introduce a clean layered architecture while keeping existing EIDE behavior working.

## Refactor Strategy

Use a gradual migration strategy. The legacy runtime remains valid until it is replaced by new modules.

Preferred migration path:

```txt
Legacy EIDE project model
        |
        v
Legacy adapters
        |
        v
EideProjectContext
        |
        v
NormalizedProjectModel
        |
        v
Exporter / DebugBackend / Agent Tools / Live Watch / PID Tuner
```

Do not perform a full rewrite in one task. Each task should be small, testable, and reviewable.

## Long-Term Architecture Target

The target architecture is:

```txt
src/
|- vscode/
|  |- activation/
|  |- commands/
|  |- treeviews/
|  |- webviews/
|  `- statusbar/
|- core/
|  |- project/
|  |- import/
|  |- export/
|  |- build/
|  |- flash/
|  |- toolchain/
|  `- config/
|- importers/
|  |- keil/
|  |- iar/
|  |- cmake/
|  |- eclipse/
|  `- scons/
|- exporters/
|  |- cmake/
|  |- makefile/
|  |- vscode/
|  |- platformio/
|  `- agent-context/
|- debug/
|  |- backends/
|  |- live-watch/
|  |- fault/
|  |- svd/
|  |- rtos/
|  `- pid-tuner/
|- analysis/
|  |- map/
|  |- elf/
|  |- memory/
|  |- build-log/
|  `- reports/
|- agent/
|  |- tools/
|  |- resources/
|  |- prompts/
|  |- permissions/
|  `- mcp/
|- legacy/
|  |- LegacyProjectContextAdapter.ts
|  |- LegacyBuildAdapter.ts
|  |- LegacyFlashAdapter.ts
|  `- LegacyImporterAdapter.ts
|- shared/
|  |- fs/
|  |- path/
|  |- process/
|  |- logging/
|  `- types/
`- test/
   |- agent/
   |- exporters/
   |- legacy/
   |- debug/
   |- core/
   `- importers/
```

Do not force this full structure in one PR. Introduce it gradually.

## Critical Files Not To Expand

Avoid adding new large logic to these files:

```txt
src/EIDEProjectExplorer.ts
src/extension.ts
src/EIDEProject.ts
```

These files may be changed only for:

- lightweight glue code
- delegating to new services
- preserving compatibility
- registering commands
- fixing small bugs

Do not add major new features directly into these files.

## Directory Boundary Rules

### Core Layer

Files under `src/core/` should contain pure project, build, import, export, and configuration models and logic.

Rules:

- Avoid importing `vscode`.
- Avoid UI prompts.
- Avoid direct hardware actions.
- Avoid direct dependency on VS Code `ExtensionContext`.
- Prefer pure interfaces, service classes, and data models.
- Keep modules testable with `npm run test:unit`.

Allowed examples:

```txt
src/core/project/EideProjectContext.ts
src/core/project/NormalizedProjectModel.ts
src/core/import/ImportReport.ts
src/core/build/BuildResult.ts
```

### VS Code Layer

Files under `src/vscode/` may use VS Code APIs.

Responsibilities:

- command registration
- TreeView providers
- WebView panels
- user prompts
- progress UI
- status bar updates
- extension activation

VS Code code should call core, debug, export, and agent services rather than contain business logic directly.

### Legacy Layer

Files under `src/legacy/` may depend on old EIDE types such as `AbstractProject`.

Responsibilities:

- bridge old project structures to new models
- provide adapters
- preserve compatibility
- isolate legacy coupling

Examples:

```txt
LegacyProjectContextAdapter
LegacyBuildAdapter
LegacyFlashAdapter
LegacyImporterAdapter
```

Legacy adapters should be read-only unless explicitly named as writers.

### Importer Layer

Importers convert external project formats into normalized project models.

Input examples:

- Keil `.uvprojx`
- IAR project files
- Eclipse CDT project files
- CMake project files
- SCons project files

Importer output should eventually be:

```txt
NormalizedProjectModel + ImportReport
```

Do not make importers directly responsible for UI prompts or workspace switching unless they are explicitly controller classes.

Preferred structure:

```txt
KeilProjectReader
KeilToNormalizedModel
KeilImportController
```

### Exporter Layer

Exporters convert `NormalizedProjectModel` into target project formats.

Output examples:

- CMake
- GNU Makefile
- VS Code config
- PlatformIO
- Agent Context Package
- RT-Thread skeleton
- Zephyr skeleton

Exporter output should include an export report. All exporters must be registered through `ExportManager`.

Do not implement target-specific export logic inside project managers or VS Code commands.

### Debug Layer

Debug features must go through `DebugBackend`.

Do not hard-code Cortex-Debug everywhere. Cortex-Debug and MCU-Debug are backend implementations, not architecture foundations.

Supported or future backend IDs include:

```txt
cortex-debug
mcu-debug
probe-rs-debug
external-gdb
native-gdb
```

Preferred flow:

```txt
EideProjectContext
        |
        v
DebugService
        |
        v
DebugBackend
        |
        v
CortexDebugBackend / McuDebugBackend / future backend
```

Do not implement raw GDB command execution unless a task explicitly asks for it and permission controls are added.

### Agent Layer

Agent-callable behavior must go through:

```txt
AgentToolRegistry
AgentPermissionManager
AgentAuditLog
```

Agents must not directly call build, flash, debug, memory write, raw GDB, or PID parameter write operations.

All Agent tools must have:

- name
- description
- permission level
- input schema or documented input shape
- safe output shape
- auditability

## Required Core Models

The long-term refactor should use these central models:

```txt
EideProjectContext
NormalizedProjectModel
ImportReport
ExportResult
DebugLaunchConfig
AgentToolResult
```

Do not invent parallel models without checking whether these already exist.

## Project Context Rules

`EideProjectContext` represents the currently opened project runtime context.

It is used by:

- build tools
- debug tools
- exporters
- Agent tools
- Live Watch
- PID Tuner

It should include best-effort information such as:

- project name
- project root
- workspace file
- project type
- active target
- source files
- include paths
- defines
- toolchain info
- output files
- flash config
- debug config

When data cannot be extracted safely, return `undefined`, `null`, or empty arrays. Do not throw unnecessarily.

## Normalized Project Model Rules

`NormalizedProjectModel` is for import/export conversion.

It should be independent of VS Code and independent of legacy EIDE internals.

It should represent:

- sources
- include paths
- defines
- libraries
- linker script
- startup file
- toolchain family
- C, C++, ASM, and linker flags
- targets
- file-level options
- migration diagnostics

Importers should move toward producing this model. Exporters should consume this model.

## Import / Export Architecture Rules

Do not implement direct pairwise converters like:

```txt
Keil -> CMake
IAR -> Makefile
CMake -> PlatformIO
```

Instead, use:

```txt
Importer -> NormalizedProjectModel -> Exporter
```

This avoids converter explosion.

All exports should produce diagnostics for unsupported or partially mapped features.

Example report categories:

```txt
success
partial
warning
error
manual-review
unsupported
```

## Debug Architecture Rules

Do not treat Cortex-Debug as the only debug backend.

Allowed first-stage features:

- generate launch config
- validate debug environment
- check executable path
- check GDB path
- check server type
- check SVD path
- check backend extension availability

Do not implement low-level GDB/MI parsing unless explicitly requested.

## Live Watch Rules

Live Watch is a future core feature.

Target behavior:

- Keil-like variable watch
- real-time variable refresh
- recursive struct expansion
- nested struct expansion
- array expansion
- pointer struct expansion
- formatting as dec, hex, float, or bool
- Live Plot
- CSV export

Preferred architecture:

```txt
LiveWatchService
LiveWatchTree
LiveWatchNode
TypeResolver
GdbTypeResolver
ExpressionExpander
LiveWatchSampler
LiveWatchStorage
```

Do not implement this inside `EIDEProjectExplorer.ts`.

## Agent Tool Safety Rules

Agent tools must be permission-gated.

Permission levels:

```txt
readonly
debug-control
device-control
dangerous
```

Default policy:

```txt
readonly: allow
debug-control: require approval
device-control: require approval
dangerous: deny by default
```

Examples:

Readonly:

```txt
project.get_context
build.get_log
export.preview
debug.get_state
live_watch.get_tree
```

Debug control:

```txt
debug.pause
debug.continue
debug.step_over
debug.set_breakpoint
```

Device control:

```txt
flash.program
debug.reset
debug.attach
```

Dangerous:

```txt
flash.erase_all
memory.write
variable.set
raw_gdb.run
pid.apply_params
```

Dangerous tools must never be auto-approved by default.

## PID Tuning Safety Rules

PID tuning is a future feature and must be safety-controlled.

Agents must not freely write PID parameters.

PID tuning must use:

```txt
PidTuningService
PidSafetyGuard
PidSession
PidVariableBinding
StepTestRunner
ResponseAnalyzer
PidParamSuggester
PidReportGenerator
```

Required safety controls:

- parameter range limits
- target range limits
- output limits
- current limits if available
- temperature limits if available
- max test duration
- rollback
- user approval before write
- audit log

Do not implement automatic hardware-affecting PID writes without permission checks.

## Coding Rules

- Keep each refactor task small, testable, and reviewable.
- Preserve legacy behavior unless the task explicitly changes it.
- Do not introduce new npm dependencies unless the task explicitly justifies them.
- Do not modify `package-lock.json` unless `package.json` changes require it.
- Prefer existing project utilities and patterns over new abstractions.
- Keep docs and code changes in separate commits unless the task explicitly pairs them.
- Do not perform hardware flashing, chip erase, raw GDB execution, memory writes, or PID parameter writes unless explicitly requested and permission controls are in place.

## TypeScript Rules

Use TypeScript strictly for new modules.

Preferred rules:

- avoid `any`
- prefer `unknown` for caught errors
- use type guards
- use explicit return types on exported APIs
- keep model files pure
- avoid circular imports
- keep barrel exports simple
- do not import VS Code APIs in core models
- avoid new dependencies unless necessary

When handling errors, use existing error helper utilities if available.

## Testing Rules

There are two kinds of tests.

Unit tests for new architecture modules:

```bash
npm run test:unit
```

These tests should not require VS Code Extension Host.

They should cover:

- AgentToolRegistry
- AgentPermissionManager
- ExportManager
- LegacyProjectContextAdapter
- model conversion utilities
- pure exporters
- pure analyzers

Legacy or full project compile:

```bash
npm run compile
```

This may currently fail because of pre-existing legacy TypeScript issues.

Do not attempt to fix all legacy compile errors unless the task explicitly asks for that.

## Required Checks Before Commit

For most refactor tasks, run:

```bash
npm run test:unit
npm run lint
```

If the task touches legacy runtime behavior, also try:

```bash
npm run compile
```

If `npm run test:unit` is not available yet, report it and do not add it unless the task asks for the unit test workflow.

If `npm run compile` fails due to pre-existing legacy errors unrelated to the task, report it clearly and do not perform broad unrelated fixes.

## Commit Rules

Each task should create one focused commit.

Commit message style:

```txt
refactor: add project context adapter
feat: add cmake exporter skeleton
test: add unit workflow for pro architecture modules
docs: add agent refactor instructions
fix: stabilize export manager tests
```

Do not create huge commits that mix unrelated changes.

Do not force push.

Do not merge into master automatically.

## PR Rules

Each PR should be small and reviewable.

PR body should include:

- goal
- changed files
- behavior impact
- tests run
- known limitations
- whether legacy compile still fails

Do not auto-merge PRs.

## Forbidden Actions

Do not perform these actions unless explicitly asked:

```txt
git push --force
git reset --hard
delete branches
rewrite package-lock.json unnecessarily
change license files
change release configuration
large rename-only commits mixed with logic changes
hardware flashing
chip erase
raw GDB command execution
memory write
PID parameter write
```

## Suggested Task Decomposition

Follow this order unless the user gives a different priority:

```txt
1. Stabilize refactor baseline
2. Add or verify AGENTS.md
3. Add test:unit workflow
4. Add EideProjectContext
5. Add NormalizedProjectModel
6. Add ImportReport
7. Add ExportManager and ProjectExporter
8. Add DebugBackend skeleton
9. Add AgentToolRegistry and AgentPermissionManager
10. Add LegacyProjectContextAdapter
11. Add ProjectContextToNormalizedModel
12. Add CMakeExporter skeleton
13. Add MakefileExporter skeleton
14. Add AgentContextExporter
15. Add VS Code export command
16. Add DebugBackend implementations
17. Add Agent project/export tools
18. Add Live Watch Tree skeleton
19. Add HardFault Analyzer
20. Add PID Tuner skeleton
```

## Current Recommended Next Tasks

Add or verify the following baseline architecture pieces:

```txt
EideProjectContext
NormalizedProjectModel
ExportManager
DebugBackend
AgentToolRegistry
test:unit
```

If the architecture skeleton already exists later, continue with:

```txt
ProjectContextToNormalizedModel
```

Goal:

```txt
EideProjectContext -> NormalizedProjectModel
```

This enables exporters and Agent context generation.

If the legacy adapter does not exist yet, do that first:

```txt
LegacyProjectContextAdapter
```

Goal:

```txt
AbstractProject -> EideProjectContext
```

## Refactor Philosophy

Do not make EIDE Pro a larger monolith.

The long-term goal is:

```txt
Legacy compatibility
+
clean core models
+
import/export pipeline
+
debug backend abstraction
+
Agent-safe tool layer
+
modern embedded workflow
```

Every refactor should move the project closer to this architecture.
