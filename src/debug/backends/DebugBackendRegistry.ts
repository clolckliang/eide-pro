import { DebugBackend } from './DebugBackend';
import { CortexDebugBackend } from './CortexDebugBackend';
import { McuDebugBackend } from './McuDebugBackend';

export class DebugBackendRegistry {
    private readonly backends = new Map<string, DebugBackend>();

    register(backend: DebugBackend): void {
        if (this.backends.has(backend.id)) {
            throw new Error(`Debug backend already registered: ${backend.id}`);
        }

        this.backends.set(backend.id, backend);
    }

    get(backendId: string): DebugBackend | undefined {
        return this.backends.get(backendId);
    }

    require(backendId: string): DebugBackend {
        const backend = this.get(backendId);

        if (backend === undefined) {
            throw new Error(`Unknown debug backend: ${backendId}`);
        }

        return backend;
    }

    list(): readonly DebugBackend[] {
        return Array.from(this.backends.values());
    }
}

export function createDefaultDebugBackendRegistry(): DebugBackendRegistry {
    const registry = new DebugBackendRegistry();

    registry.register(new CortexDebugBackend());
    registry.register(new McuDebugBackend());

    return registry;
}
