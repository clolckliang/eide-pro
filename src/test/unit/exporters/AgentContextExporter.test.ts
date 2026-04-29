import { strict as assert } from 'assert';
import { describe, it } from 'mocha';
import { NormalizedProjectModel } from '../../../core/project/NormalizedProjectModel';

const { ExportManager } = require('../../../core/export/ExportManager') as typeof import('../../../core/export/ExportManager');
const {
    AgentContextExporter,
    createAgentContextPackage,
    createAgentContextReadme
} = require('../../../exporters/agent-context/AgentContextExporter') as typeof import('../../../exporters/agent-context/AgentContextExporter');

describe('AgentContextExporter', () => {
    it('generates read-only agent context artifacts', async () => {
        const exporter = new AgentContextExporter();

        const result = await exporter.exportProject(createModel(), '/out');

        assert.equal(result.exporterId, 'agent-context');
        assert.equal(result.status, 'success');
        assert.deepEqual(result.generatedFiles, ['agent-context.json', 'README.md']);
        assert.equal(result.artifacts?.length, 2);
        assert.equal(result.artifacts?.[0].path, 'agent-context.json');
        assert.equal(result.artifacts?.[1].path, 'README.md');

        const parsed = JSON.parse(result.artifacts?.[0].content ?? '') as ReturnType<typeof createAgentContextPackage>;

        assert.equal(parsed.schemaVersion, 1);
        assert.equal(parsed.project.name, 'Demo Project');
        assert.equal(parsed.safety.permissionLevel, 'readonly');
        assert.deepEqual(parsed.targets[0].sourceFiles, ['src/main.c', 'src/app.cpp', 'startup.s']);
        assert.equal(parsed.safety.forbiddenOperations.includes('flash'), true);
        assert.equal(parsed.safety.forbiddenOperations.includes('pid parameter write'), true);
    });

    it('can be registered through ExportManager', async () => {
        const manager = new ExportManager();

        manager.register(new AgentContextExporter());

        const result = await manager.exportProject('agent-context', createModel(), '/out');

        assert.equal(result.exporterId, 'agent-context');
        assert.deepEqual(result.generatedFiles, ['agent-context.json', 'README.md']);
    });

    it('preserves model diagnostics and reports partial status', async () => {
        const exporter = new AgentContextExporter();
        const model: NormalizedProjectModel = {
            ...createModel(),
            diagnostics: [
                {
                    level: 'manual-review',
                    code: 'unknown-toolchain',
                    message: 'Project context does not contain a recognized toolchain family.'
                }
            ]
        };

        const result = await exporter.exportProject(model, '/out');

        assert.equal(result.status, 'partial');
        assert.equal(result.diagnostics[0].code, 'unknown-toolchain');
        assertIncludes(result.artifacts?.[1].content ?? '', /manual-review unknown-toolchain/);
    });

    it('reports a failed result when no normalized target exists', async () => {
        const exporter = new AgentContextExporter();
        const model = {
            ...createModel(),
            targets: []
        };

        const result = await exporter.exportProject(model, '/out');

        assert.equal(result.status, 'failed');
        assert.equal(result.diagnostics[0].code, 'agent-context-no-targets');
    });

    it('creates stable readme text without unsafe operations', () => {
        const contextPackage = createAgentContextPackage(createModel());
        const readme = createAgentContextReadme(contextPackage);

        assertIncludes(readme, /Permission level: readonly/);
        assertIncludes(readme, /Forbidden operations include build, flash, debug control, raw GDB, memory writes, and PID parameter writes\./);
        assert.equal(readme.endsWith('\n'), true);
    });
});

function assertIncludes(value: string, pattern: RegExp): void {
    assert.equal(pattern.test(value), true);
}

function createModel(): NormalizedProjectModel {
    return {
        name: 'Demo Project',
        root: '/workspace/demo',
        toolchainFamily: 'gcc',
        targets: [
            {
                name: 'Debug',
                sourceFiles: [
                    {
                        path: 'src/main.c',
                        language: 'c'
                    },
                    {
                        path: 'src/app.cpp',
                        language: 'cpp'
                    },
                    {
                        path: 'startup.s',
                        language: 'asm'
                    }
                ],
                includePaths: ['include', 'drivers/include'],
                defines: ['USE_HAL', 'STM32F103xB'],
                libraries: ['m', 'c'],
                linkerScript: 'linker/stm32.ld',
                startupFile: 'startup.s',
                cFlags: [],
                cppFlags: [],
                asmFlags: [],
                linkerFlags: []
            }
        ],
        diagnostics: []
    };
}
