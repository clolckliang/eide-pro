import { strict as assert } from 'assert';
import { describe, it } from 'mocha';
import { EideProjectContext } from '../../../core/project/EideProjectContext';
import { DebugBackend, DebugBackendValidation, DebugLaunchConfig } from '../../../debug/backends/DebugBackend';
import { DebugBackendRegistry } from '../../../debug/backends/DebugBackendRegistry';

const { DebugService } = require('../../../debug/DebugService') as typeof import('../../../debug/DebugService');

describe('DebugService', () => {
    it('lists default Cortex-Debug and MCU-Debug backends', () => {
        const service = new DebugService();

        assert.deepEqual(service.listBackends().map((backend) => backend.id), [
            'cortex-debug',
            'mcu-debug'
        ]);
    });

    it('creates launch config through the selected backend', () => {
        const registry = new DebugBackendRegistry();
        registry.register(createBackend('external-gdb'));
        const service = new DebugService(registry);

        const config = service.createLaunchConfig('external-gdb', createContext());

        assert.deepEqual(config, {
            backendId: 'external-gdb',
            type: 'external-gdb',
            request: 'launch',
            name: 'Demo external-gdb',
            executable: 'build/demo.elf'
        });
    });

    it('throws when creating launch config for an unknown backend', () => {
        const service = new DebugService(new DebugBackendRegistry());

        assert.throws(
            () => service.createLaunchConfig('missing', createContext()),
            /Unknown debug backend: missing/
        );
    });

    it('validates environment through the selected backend', async () => {
        const registry = new DebugBackendRegistry();
        registry.register(createBackend('native-gdb', {
            ok: false,
            diagnostics: ['GDB path is missing.']
        }));
        const service = new DebugService(registry);

        const result = await service.validateEnvironment('native-gdb', createContext());

        assert.deepEqual(result, {
            ok: false,
            diagnostics: ['GDB path is missing.']
        });
    });
});

function createBackend(
    id: string,
    validation: DebugBackendValidation = {
        ok: true,
        diagnostics: []
    }
): DebugBackend {
    return {
        id,
        displayName: id,
        createLaunchConfig: (context: EideProjectContext): DebugLaunchConfig => ({
            backendId: id,
            type: id,
            request: 'launch',
            name: `${context.projectName} ${id}`,
            executable: context.outputFiles?.elf
        }),
        validateEnvironment: async (_context: EideProjectContext): Promise<DebugBackendValidation> => validation
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
        outputFiles: {
            elf: 'build/demo.elf'
        }
    };
}
