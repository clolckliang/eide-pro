import { ExportManager, ExportResult, ProjectExporter } from '../../core/export/ExportManager';
import { EideProjectContext } from '../../core/project/EideProjectContext';
import { projectContextToNormalizedModel } from '../../core/project/ProjectContextToNormalizedModel';
import { createDefaultExportManager } from '../../exporters/DefaultExportManager';

export type ActiveProjectContextProvider = () => Promise<EideProjectContext | undefined> | EideProjectContext | undefined;

export interface ProjectExportPreviewRequest {
    readonly exporterId: string;
    readonly outputRoot: string;
}

export interface ProjectExportPreviewControllerOptions {
    readonly contextProvider: ActiveProjectContextProvider;
    readonly exportManager?: ExportManager;
}

export class ProjectExportPreviewController {
    private readonly contextProvider: ActiveProjectContextProvider;
    private readonly exportManager: ExportManager;

    constructor(options: ProjectExportPreviewControllerOptions) {
        this.contextProvider = options.contextProvider;
        this.exportManager = options.exportManager ?? createDefaultExportManager();
    }

    listExporters(): readonly ProjectExporter[] {
        return this.exportManager.list();
    }

    async previewExport(request: ProjectExportPreviewRequest): Promise<ExportResult> {
        if (request.exporterId.trim() === '') {
            throw new Error('Project export preview requires an exporter id.');
        }

        const context = await this.contextProvider();

        if (context === undefined) {
            throw new Error('No active EIDE project context is available.');
        }

        const model = projectContextToNormalizedModel(context);

        return this.exportManager.exportProject(request.exporterId, model, request.outputRoot);
    }
}
