import { strict as assert } from 'assert';
import { describe, it } from 'mocha';
import type { LegacyProjectLike } from '../../../legacy/LegacyProjectContextAdapter';
import type { ExportResult } from '../../../core/export/ExportManager';
import type { NormalizedProjectModel } from '../../../core/project/NormalizedProjectModel';

const fs = require('fs') as typeof import('fs');
const NodePath = require('path') as typeof import('path');
const os = require('os') as typeof import('os');
const {
    createDefaultExportManager
} = require('../../../exporters/DefaultExportManager') as typeof import('../../../exporters/DefaultExportManager');
const {
    projectContextToNormalizedModel
} = require('../../../core/project/ProjectContextToNormalizedModel') as typeof import('../../../core/project/ProjectContextToNormalizedModel');
const {
    createEideProjectContextFromLegacyProject
} = require('../../../legacy/LegacyProjectContextAdapter') as typeof import('../../../legacy/LegacyProjectContextAdapter');

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

    it('composes legacy project context into default exporter previews without writing files', async () => {
        const tempRoot = fs.mkdtempSync(NodePath.join(os.tmpdir(), 'eide-export-preview-'));
        const previewRoot = NodePath.join(tempRoot, 'do-not-create');
        const manager = createDefaultExportManager();
        const context = createEideProjectContextFromLegacyProject(createLegacyProject());
        const model = projectContextToNormalizedModel(context);

        try {
            assert.equal(fs.existsSync(previewRoot), false);

            const results = new Map<string, ExportResult>();

            for (const exporter of manager.list()) {
                const result = await manager.exportProject(exporter.id, model, previewRoot);

                results.set(exporter.id, result);
                assert.equal(result.outputRoot, previewRoot);
                assert.ok(result.generatedFiles.length > 0);
                assert.ok(result.artifacts !== undefined);
                assert.ok(result.artifacts.length > 0);

                for (const generatedFile of result.generatedFiles) {
                    assert.notEqual(
                        result.artifacts.find((artifact) => artifact.path === generatedFile),
                        undefined
                    );
                }
            }

            assert.equal(results.get('cmake')?.status, 'success');
            assert.equal(results.get('makefile')?.status, 'partial');
            assert.equal(results.get('agent-context')?.status, 'success');
            assert.equal(fs.existsSync(previewRoot), false);
        } finally {
            fs.rmdirSync(tempRoot);
        }
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

function createLegacyProject(): LegacyProjectLike {
    return {
        getProjectName: () => 'Legacy Demo',
        getProjectCurrentTargetName: () => 'Debug',
        getProjectType: () => 'ARM',
        getRootDir: () => ({ path: '/workspace/demo' }),
        getExecutablePath: () => '/workspace/demo/build/Debug/demo.axf',
        getUploaderType: () => 'JLink',
        getToolchain: () => ({
            name: 'AC6',
            categoryName: 'armclang',
            modelName: 'ARM Compiler 6',
            getToolchainDir: () => ({ path: '/tools/armclang' })
        }),
        GetConfiguration: () => ({
            config: {
                name: 'Legacy Demo From Config',
                type: 'ARM',
                mode: 'Debug',
                deviceName: 'STM32F103C8',
                toolchainConfig: {
                    scatterFilePath: 'stm32.sct'
                },
                cppPreprocessAttrs: {
                    incList: ['inc', 'drivers/inc'],
                    libList: ['m'],
                    defineList: ['USE_HAL', 'STM32F103xB']
                },
                dependenceList: [
                    {
                        depList: [
                            {
                                incList: ['cmsis/inc', 'inc'],
                                libList: ['c'],
                                defineList: ['CMSIS', 'USE_HAL']
                            }
                        ]
                    }
                ],
                virtualFolder: {
                    files: [
                        { path: 'src/main.c' },
                        { path: 'include/app.h' },
                        { path: 'linker.ld' }
                    ],
                    folders: [
                        {
                            files: [
                                { path: 'startup.s' },
                                { path: 'src/app.cpp' }
                            ],
                            folders: []
                        }
                    ]
                }
            }
        })
    };
}
