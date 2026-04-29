import { strict as assert } from 'assert';
import { describe, it } from 'mocha';
import { EideProjectContext } from '../../../core/project/EideProjectContext';

const { CortexDebugBackend } = require('../../../debug/backends/CortexDebugBackend') as typeof import('../../../debug/backends/CortexDebugBackend');
const { McuDebugBackend } = require('../../../debug/backends/McuDebugBackend') as typeof import('../../../debug/backends/McuDebugBackend');

describe('DebugBackends', () => {
    it('creates a Cortex-Debug launch config from project context', () => {
        const backend = new CortexDebugBackend();

        const config = backend.createLaunchConfig(createContext());

        assert.equal(config.backendId, 'cortex-debug');
        assert.equal(config.type, 'cortex-debug');
        assert.equal(config.request, 'launch');
        assert.equal(config.name, 'Demo (Cortex-Debug)');
        assert.equal(config.executable, 'build/demo.elf');
        assert.equal(config.gdbPath, 'arm-none-eabi-gdb');
        assert.equal(config.serverType, 'jlink');
        assert.equal(config.svdPath, 'device.svd');
    });

    it('validates Cortex-Debug missing executable, gdb, and server type', async () => {
        const backend = new CortexDebugBackend();

        const result = await backend.validateEnvironment({
            ...createContext(),
            outputFiles: undefined,
            flashConfig: undefined,
            debugConfig: {}
        });

        assert.equal(result.ok, false);
        assert.deepEqual(result.diagnostics, [
            'Cortex-Debug executable path is missing.',
            'Cortex-Debug GDB path is missing.',
            'Cortex-Debug server type is missing.'
        ]);
    });

    it('creates an MCU-Debug launch config from project context', () => {
        const backend = new McuDebugBackend();

        const config = backend.createLaunchConfig(createContext());

        assert.equal(config.backendId, 'mcu-debug');
        assert.equal(config.type, 'mcu-debug');
        assert.equal(config.request, 'launch');
        assert.equal(config.name, 'Demo (MCU-Debug)');
        assert.equal(config.executable, 'build/demo.elf');
        assert.equal(config.gdbPath, 'arm-none-eabi-gdb');
        assert.equal(config.serverType, undefined);
        assert.equal(config.svdPath, 'device.svd');
    });

    it('validates MCU-Debug without requiring a server type', async () => {
        const backend = new McuDebugBackend();

        const result = await backend.validateEnvironment(createContext());

        assert.equal(result.ok, true);
        assert.deepEqual(result.diagnostics, []);
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
        toolchain: {
            name: 'GNU Arm Embedded',
            family: 'gcc'
        },
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
