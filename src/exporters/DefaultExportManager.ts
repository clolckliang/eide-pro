import { ExportManager } from '../core/export/ExportManager';
import { AgentContextExporter } from './agent-context/AgentContextExporter';
import { CMakeExporter } from './cmake/CMakeExporter';
import { MakefileExporter } from './makefile/MakefileExporter';

export function createDefaultExportManager(): ExportManager {
    const manager = new ExportManager();

    manager.register(new CMakeExporter());
    manager.register(new MakefileExporter());
    manager.register(new AgentContextExporter());

    return manager;
}
