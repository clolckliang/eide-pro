import { ExportManager } from '../../core/export/ExportManager';
import { DebugService } from '../../debug/DebugService';
import { createDefaultExportManager } from '../../exporters/DefaultExportManager';
import { AgentToolRegistry } from './AgentToolRegistry';
import {
    createDebugBackendListTool,
    createDebugLaunchPreviewTool,
    createDebugValidateEnvironmentTool
} from './DebugAgentTools';
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
    readonly debugService?: DebugService;
    readonly defaultOutputRoot?: string;
}

export function createDefaultProjectAgentToolRegistry(
    options: DefaultProjectAgentToolRegistryOptions
): AgentToolRegistry {
    const registry = new AgentToolRegistry();
    const exportManager = options.exportManager ?? createDefaultExportManager();
    const debugService = options.debugService ?? new DebugService();

    registry.register(createProjectContextTool(options.contextProvider));
    registry.register(createExportPreviewTool(
        exportManager,
        options.normalizedModelProvider,
        options.defaultOutputRoot
    ));
    registry.register(createDebugBackendListTool(debugService));
    registry.register(createDebugLaunchPreviewTool(debugService, options.contextProvider));
    registry.register(createDebugValidateEnvironmentTool(debugService, options.contextProvider));

    return registry;
}
