import { strict as assert } from 'assert';
import { describe, it } from 'mocha';
import { NormalizedProjectModel } from '../../../core/project/NormalizedProjectModel';

const {
    createDefaultExportManager
} = require('../../../exporters/DefaultExportManager') as typeof import('../../../exporters/DefaultExportManager');

describe('DefaultExportManager', () => {
    it('registers the default architecture exporters', () => {
        const manager = createDefaultExportManager();

        assert.deepEqual(manager.list().map((exporter) => exporter.id), [
            'cmake',
            'makefile',
            'agent-context'
        ]);
    });

    it('can preview each default exporter without writing files', async () => {
        const manager = createDefaultExportManager();
        const model = createModel();

        const cmake = await manager.exportProject('cmake', model, '/preview');
        const makefile = await manager.exportProject('makefile', model, '/preview');
        const agentContext = await manager.exportProject('agent-context', model, '/preview');

        assert.deepEqual(cmake.generatedFiles, ['CMakeLists.txt']);
        assert.equal(cmake.artifacts?.[0].path, 'CMakeLists.txt');
        assert.deepEqual(makefile.generatedFiles, ['Makefile']);
        assert.equal(makefile.artifacts?.[0].path, 'Makefile');
        assert.deepEqual(agentContext.generatedFiles, ['agent-context.json', 'README.md']);
        assert.equal(agentContext.artifacts?.[0].path, 'agent-context.json');
    });
});

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
                libraries: ['m'],
                linkerScript: 'linker/demo.ld',
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
