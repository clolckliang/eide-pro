import { EideProjectContext } from '../core/project/EideProjectContext';
import { DebugBackend, DebugBackendValidation, DebugLaunchConfig } from './backends/DebugBackend';
import { createDefaultDebugBackendRegistry, DebugBackendRegistry } from './backends/DebugBackendRegistry';

export class DebugService {
    private readonly registry: DebugBackendRegistry;

    constructor(registry: DebugBackendRegistry = createDefaultDebugBackendRegistry()) {
        this.registry = registry;
    }

    listBackends(): readonly DebugBackend[] {
        return this.registry.list();
    }

    createLaunchConfig(backendId: string, context: EideProjectContext): DebugLaunchConfig {
        return this.registry.require(backendId).createLaunchConfig(context);
    }

    validateEnvironment(backendId: string, context: EideProjectContext): Promise<DebugBackendValidation> {
        return this.registry.require(backendId).validateEnvironment(context);
    }
}
