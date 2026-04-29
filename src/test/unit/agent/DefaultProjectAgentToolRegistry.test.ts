import { strict as assert } from 'assert';
import { describe, it } from 'mocha';
import type { ExportResult } from '../../../core/export/ExportManager';
import type { EideProjectContext } from '../../../core/project/EideProjectContext';
import type { NormalizedProjectModel } from '../../../core/project/NormalizedProjectModel';

const {
    createDefaultProjectAgentToolRegistry
} = require('../../../agent/tools/DefaultProjectAgentToolRegistry') as typeof import('../../../agent/tools/DefaultProjectAgentToolRegistry');

describe('DefaultProjectAgentToolRegistry', () => {
    it('registers readonly project context and export preview tools', () => {
        const registry = createDefaultProjectAgentToolRegistry({
            contextProvider: () => createContext(),
            normalizedModelProvider: () => createModel()
        });

        const tools = registry.list();

        assert.deepEqual(tools.map((tool) => tool.name), [
            'project.get_context',
            'export.preview'
        ]);
        assert.deepEqual(tools.map((tool) => tool.permissionLevel), [
            'readonly',
            'readonly'
        ]);
    });

    it('previews exports with the default export manager', async () => {
        const registry = createDefaultProjectAgentToolRegistry({
            contextProvider: () => createContext(),
            normalizedModelProvider: () => createModel(),
            defaultOutputRoot: '/preview'
        });

        const tool = registry.get('export.preview');

        assert.notEqual(tool, undefined);

        const result = await tool!.run({
            exporterId: 'agent-context'
        }) as { readonly ok: boolean; readonly data?: ExportResult };

        assert.equal(result.ok, true);
        assert.equal(result.data?.exporterId, 'agent-context');
        assert.equal(result.data?.outputRoot, '/preview');
    });

    it('reports unavailable project context through the default registry', async () => {
        const registry = createDefaultProjectAgentToolRegistry({
            contextProvider: () => undefined,
            normalizedModelProvider: () => createModel()
        });
        const tool = registry.get('project.get_context');

        assert.notEqual(tool, undefined);

        const result = await tool!.run(undefined);

        assert.equal(result.ok, false);
        assert.equal(result.message, 'No active EIDE project context is available.');
    });

    it('reports unavailable normalized model through the default registry', async () => {
        const registry = createDefaultProjectAgentToolRegistry({
            contextProvider: () => createContext(),
            normalizedModelProvider: () => undefined
        });
        const tool = registry.get('export.preview');

        assert.notEqual(tool, undefined);

        const result = await tool!.run({
            exporterId: 'cmake'
        });

        assert.equal(result.ok, false);
        assert.equal(result.message, 'No normalized project model is available.');
    });
});

function createContext(): EideProjectContext {
    return {
        projectName: 'Demo',
        projectRoot: '/workspace/demo',
        activeTarget: 'Debug',
        sourceFiles: ['src/main.c'],
        includePaths: ['include'],
        defines: ['USE_HAL'],
        libraries: []
    };
}

function createModel(): NormalizedProjectModel {
    return {
        name: 'Demo',
        root: '/workspace/demo',
        toolchainFamily: 'gcc',
        targets: [
            {
                name: 'Debug',
                sourceFiles: [
                    {
                        path: 'src/main.c',
                        language: 'c'
                    }
                ],
                includePaths: ['include'],
                defines: ['USE_HAL'],
                libraries: [],
                cFlags: [],
                cppFlags: [],
                asmFlags: [],
                linkerFlags: []
            }
        ],
        diagnostics: []
    };
}
