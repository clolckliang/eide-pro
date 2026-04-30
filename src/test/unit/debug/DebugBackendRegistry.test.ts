import { strict as assert } from 'assert';
import { describe, it } from 'mocha';
import { DebugBackend, DebugBackendValidation, DebugLaunchConfig } from '../../../debug/backends/DebugBackend';
import { EideProjectContext } from '../../../core/project/EideProjectContext';

const {
    createDefaultDebugBackendRegistry,
    DebugBackendRegistry
} = require('../../../debug/backends/DebugBackendRegistry') as typeof import('../../../debug/backends/DebugBackendRegistry');

describe('DebugBackendRegistry', () => {
    it('registers and lists debug backends', () => {
        const registry = new DebugBackendRegistry();
        const backend = createBackend('custom-debug');

        registry.register(backend);

        assert.equal(registry.get('custom-debug'), backend);
        assert.deepEqual(registry.list(), [backend]);
    });

    it('rejects duplicate backend ids', () => {
        const registry = new DebugBackendRegistry();

        registry.register(createBackend('custom-debug'));

        assert.throws(
            () => registry.register(createBackend('custom-debug')),
            /Debug backend already registered: custom-debug/
        );
    });

    it('requires a known backend by id', () => {
        const registry = new DebugBackendRegistry();
        const backend = createBackend('external-gdb');

        registry.register(backend);

        assert.equal(registry.require('external-gdb'), backend);
    });

    it('throws when requiring an unknown backend id', () => {
        const registry = new DebugBackendRegistry();

        assert.throws(
            () => registry.require('missing'),
            /Unknown debug backend: missing/
        );
    });

    it('creates a default registry with Cortex-Debug and MCU-Debug', () => {
        const registry = createDefaultDebugBackendRegistry();

        assert.deepEqual(registry.list().map((backend) => backend.id), [
            'cortex-debug',
            'mcu-debug'
        ]);
        assert.equal(registry.require('cortex-debug').displayName, 'Cortex-Debug');
        assert.equal(registry.require('mcu-debug').displayName, 'MCU-Debug');
    });
});

function createBackend(id: string): DebugBackend {
    return {
        id,
        displayName: id,
        createLaunchConfig: (_context: EideProjectContext): DebugLaunchConfig => ({
            backendId: id,
            type: id,
            request: 'launch',
            name: id
        }),
        validateEnvironment: async (_context: EideProjectContext): Promise<DebugBackendValidation> => ({
            ok: true,
            diagnostics: []
        })
    };
}
