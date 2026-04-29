import { strict as assert } from 'assert';
import { describe, it } from 'mocha';
import { ExportResult, ProjectExporter } from '../../../core/export/ExportManager';
import { EideProjectContext } from '../../../core/project/EideProjectContext';
import { NormalizedProjectModel } from '../../../core/project/NormalizedProjectModel';

const { ExportManager } = require('../../../core/export/ExportManager') as typeof import('../../../core/export/ExportManager');
const {
    ProjectExportPreviewController
} = require('../../../vscode/commands/ProjectExportPreviewController') as typeof import('../../../vscode/commands/ProjectExportPreviewController');

describe('ProjectExportPreviewController', () => {
    it('lists exporters from the configured export manager', () => {
        const manager = new ExportManager();
        manager.register(createExporter('cmake'));
        const controller = new ProjectExportPreviewController({
            contextProvider: () => createContext(),
            exportManager: manager
        });

        assert.deepEqual(controller.listExporters().map((exporter) => exporter.id), ['cmake']);
    });

    it('maps active project context and previews the selected exporter', async () => {
        const manager = new ExportManager();
        manager.register(createExporter('agent-context'));
        const controller = new ProjectExportPreviewController({
            contextProvider: () => createContext(),
            exportManager: manager
        });

        const result = await controller.previewExport({
            exporterId: 'agent-context',
            outputRoot: '/preview'
        });

        assert.equal(result.exporterId, 'agent-context');
        assert.equal(result.outputRoot, '/preview');
        assert.equal(result.generatedFiles[0], 'Demo-agent-context.txt');
    });

    it('reports missing active project context', async () => {
        const controller = new ProjectExportPreviewController({
            contextProvider: () => undefined,
            exportManager: new ExportManager()
        });

        await assert.rejects(
            () => controller.previewExport({
                exporterId: 'cmake',
                outputRoot: '/preview'
            }),
            /No active EIDE project context is available\./
        );
    });

    it('rejects blank exporter ids before calling the provider', async () => {
        let providerCalled = false;
        const controller = new ProjectExportPreviewController({
            contextProvider: () => {
                providerCalled = true;
                return createContext();
            },
            exportManager: new ExportManager()
        });

        await assert.rejects(
            () => controller.previewExport({
                exporterId: ' ',
                outputRoot: '/preview'
            }),
            /Project export preview requires an exporter id\./
        );
        assert.equal(providerCalled, false);
    });
});

function createExporter(id: string): ProjectExporter {
    return {
        id,
        displayName: id,
        exportProject: async (model: NormalizedProjectModel, outputRoot: string): Promise<ExportResult> => ({
            exporterId: id,
            status: 'success',
            outputRoot,
            generatedFiles: [`${model.name}-${id}.txt`],
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
        libraries: [],
        toolchain: {
            name: 'GNU Arm Embedded',
            family: 'gcc'
        }
    };
}
