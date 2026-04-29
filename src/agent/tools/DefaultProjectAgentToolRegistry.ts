import { ExportManager } from '../../core/export/ExportManager';
import { createDefaultExportManager } from '../../exporters/DefaultExportManager';
import { AgentToolRegistry } from './AgentToolRegistry';
import {
    createExportPreviewTool,
    createProjectContextTool,
    NormalizedProjectModelProvider,
    ProjectContextProvider
} from './ProjectAgentTools';

export interface DefaultProjectAgentToolRegistryOptions {
    readonly contextProvider: ProjectContextProvider;
    readonly normalizedModelProvider: NormalizedProjectModelProvider;
    readonly exportManager?: ExportManager;
    readonly defaultOutputRoot?: string;
}

export function createDefaultProjectAgentToolRegistry(
    options: DefaultProjectAgentToolRegistryOptions
): AgentToolRegistry {
    const registry = new AgentToolRegistry();
    const exportManager = options.exportManager ?? createDefaultExportManager();

    registry.register(createProjectContextTool(options.contextProvider));
    registry.register(createExportPreviewTool(
        exportManager,
        options.normalizedModelProvider,
        options.defaultOutputRoot
    ));

    return registry;
}
