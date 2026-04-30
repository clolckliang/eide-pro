import { strict as assert } from 'assert';
import { describe, it } from 'mocha';
import { ExportResult, ProjectExporter } from '../../../core/export/ExportManager';
import { EideProjectContext } from '../../../core/project/EideProjectContext';
import { NormalizedProjectModel } from '../../../core/project/NormalizedProjectModel';

const { ExportManager } = require('../../../core/export/ExportManager') as typeof import('../../../core/export/ExportManager');
const {
    createExportPreviewTool,
    createProjectContextTool
} = require('../../../agent/tools/ProjectAgentTools') as typeof import('../../../agent/tools/ProjectAgentTools');

describe('ProjectAgentTools', () => {
    it('creates a readonly project.get_context tool', async () => {
        const tool = createProjectContextTool(() => createContext());

        const result = await tool.run(undefined);

        assert.equal(tool.name, 'project.get_context');
        assert.equal(tool.permissionLevel, 'readonly');
        assert.equal(result.ok, true);
        assert.equal(result.data?.projectName, 'Demo');
    });

    it('reports when project context is unavailable', async () => {
        const tool = createProjectContextTool(() => undefined);

        const result = await tool.run(undefined);

        assert.equal(result.ok, false);
        assert.equal(result.message, 'No active EIDE project context is available.');
    });

    it('creates a readonly export.preview tool', async () => {
        const manager = new ExportManager();
        manager.register(createExporter('agent-context'));

        const tool = createExportPreviewTool(manager, () => createModel(), '/preview');

        const result = await tool.run({
            exporterId: 'agent-context'
        });

        assert.equal(tool.name, 'export.preview');
        assert.equal(tool.permissionLevel, 'readonly');
        assert.equal(result.ok, true);
        assert.equal(result.data?.exporterId, 'agent-context');
        assert.equal(result.data?.outputRoot, '/preview');
    });

    it('rejects invalid export.preview input before calling exporters', async () => {
        const manager = new ExportManager();
        const tool = createExportPreviewTool(manager, () => createModel());

        const result = await tool.run({});

        assert.equal(result.ok, false);
        assert.equal(result.message, 'export.preview requires an input object with exporterId.');
    });

    it('reports when normalized model is unavailable', async () => {
        const manager = new ExportManager();
        manager.register(createExporter('cmake'));
        const tool = createExportPreviewTool(manager, () => undefined);

        const result = await tool.run({
            exporterId: 'cmake'
        });

        assert.equal(result.ok, false);
        assert.equal(result.message, 'No normalized project model is available.');
    });
});

function createExporter(id: string): ProjectExporter {
    return {
        id,
        displayName: id,
        exportProject: async (_model: NormalizedProjectModel, outputRoot: string): Promise<ExportResult> => ({
            exporterId: id,
            status: 'success',
            outputRoot,
            generatedFiles: [`${id}.txt`],
            diagnostics: []
        })
    };
}

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
