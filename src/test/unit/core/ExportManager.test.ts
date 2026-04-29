import { strict as assert } from 'assert';
import { describe, it } from 'mocha';
import { ExportManager, ProjectExporter, ExportResult } from '../../../core/export/ExportManager';
import { NormalizedProjectModel } from '../../../core/project/NormalizedProjectModel';

const emptyModel: NormalizedProjectModel = {
    name: 'Demo',
    root: '/demo',
    toolchainFamily: 'gcc',
    targets: [],
    diagnostics: []
};

describe('ExportManager', () => {
    it('registers and lists project exporters', () => {
        const manager = new ExportManager();
        const exporter = createExporter('cmake');

        manager.register(exporter);

        assert.equal(manager.get('cmake'), exporter);
        assert.deepEqual(manager.list(), [exporter]);
    });

    it('rejects duplicate exporter ids', () => {
        const manager = new ExportManager();

        manager.register(createExporter('cmake'));

        assert.throws(() => manager.register(createExporter('cmake')), /Exporter already registered: cmake/);
    });

    it('delegates export requests to the selected exporter', async () => {
        const manager = new ExportManager();

        manager.register(createExporter('agent-context'));

        const result = await manager.exportProject('agent-context', emptyModel, '/out');

        assert.equal(result.exporterId, 'agent-context');
        assert.equal(result.outputRoot, '/out');
        assert.deepEqual(result.generatedFiles, ['agent-context.txt']);
    });

    it('rejects unknown exporter ids', async () => {
        const manager = new ExportManager();

        await assert.rejects(
            () => manager.exportProject('missing', emptyModel, '/out'),
            /Unknown exporter: missing/
        );
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
