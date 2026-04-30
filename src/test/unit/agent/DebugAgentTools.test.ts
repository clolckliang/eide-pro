import { strict as assert } from 'assert';
import { describe, it } from 'mocha';
import type { EideProjectContext } from '../../../core/project/EideProjectContext';
import { DebugBackendRegistry } from '../../../debug/backends/DebugBackendRegistry';

const { DebugService } = require('../../../debug/DebugService') as typeof import('../../../debug/DebugService');
const { CortexDebugBackend } = require('../../../debug/backends/CortexDebugBackend') as typeof import('../../../debug/backends/CortexDebugBackend');
const {
    createDebugBackendListTool,
    createDebugLaunchPreviewTool,
    createDebugValidateEnvironmentTool
} = require('../../../agent/tools/DebugAgentTools') as typeof import('../../../agent/tools/DebugAgentTools');

describe('DebugAgentTools', () => {
    it('creates a readonly debug.list_backends tool', async () => {
        const registry = new DebugBackendRegistry();
        registry.register(new CortexDebugBackend());
        const tool = createDebugBackendListTool(new DebugService(registry));

        const result = await tool.run(undefined);

        assert.equal(tool.name, 'debug.list_backends');
        assert.equal(tool.permissionLevel, 'readonly');
        assert.deepEqual(result.data, [
            {
                id: 'cortex-debug',
                displayName: 'Cortex-Debug'
            }
        ]);
    });

    it('previews launch config without starting debug', async () => {
        const tool = createDebugLaunchPreviewTool(new DebugService(), () => createContext());

        const result = await tool.run({
            backendId: 'cortex-debug'
        });

        assert.equal(tool.name, 'debug.preview_launch_config');
        assert.equal(tool.permissionLevel, 'readonly');
        assert.equal(result.ok, true);
        assert.equal(result.data?.backendId, 'cortex-debug');
        assert.equal(result.data?.name, 'Demo (Cortex-Debug)');
    });

    it('validates debug environment without starting debug', async () => {
        const tool = createDebugValidateEnvironmentTool(new DebugService(), () => ({
            ...createContext(),
            flashConfig: undefined,
            debugConfig: {}
        }));

        const result = await tool.run({
            backendId: 'cortex-debug'
        });

        assert.equal(tool.name, 'debug.validate_environment');
        assert.equal(tool.permissionLevel, 'readonly');
        assert.equal(result.ok, true);
        assert.equal(result.data?.ok, false);
        assert.deepEqual(result.data?.diagnostics, [
            'Cortex-Debug GDB path is missing.',
            'Cortex-Debug server type is missing.'
        ]);
    });

    it('rejects invalid backend input before calling debug service', async () => {
        const tool = createDebugLaunchPreviewTool(new DebugService(), () => createContext());

        const result = await tool.run({});

        assert.equal(result.ok, false);
        assert.equal(result.message, 'debug.preview_launch_config requires an input object with backendId.');
    });

    it('reports missing project context', async () => {
        const tool = createDebugValidateEnvironmentTool(new DebugService(), () => undefined);

        const result = await tool.run({
            backendId: 'cortex-debug'
        });

        assert.equal(result.ok, false);
        assert.equal(result.message, 'No active EIDE project context is available.');
    });

    it('reports unknown backend as a safe tool result', async () => {
        const tool = createDebugLaunchPreviewTool(new DebugService(), () => createContext());

        const result = await tool.run({
            backendId: 'missing'
        });

        assert.equal(result.ok, false);
        assert.equal(result.message, 'Unknown debug backend: missing');
    });
});

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
        },
        flashConfig: {
            programmer: 'JLink'
        },
        debugConfig: {
            gdbPath: 'arm-none-eabi-gdb',
            svdPath: 'device.svd'
        }
    };
}
