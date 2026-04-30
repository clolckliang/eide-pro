import { EideProjectContext } from '../../core/project/EideProjectContext';
import { DebugBackend, DebugBackendValidation, DebugLaunchConfig } from './DebugBackend';

export class McuDebugBackend implements DebugBackend {
    readonly id = 'mcu-debug';
    readonly displayName = 'MCU-Debug';

    createLaunchConfig(context: EideProjectContext): DebugLaunchConfig {
        return {
            backendId: this.id,
            type: 'mcu-debug',
            request: 'launch',
            name: `${context.projectName} (${this.displayName})`,
            executable: getExecutablePath(context),
            gdbPath: context.debugConfig?.gdbPath,
            serverType: context.debugConfig?.serverType,
            svdPath: context.debugConfig?.svdPath
        };
    }

    async validateEnvironment(context: EideProjectContext): Promise<DebugBackendValidation> {
        const diagnostics: string[] = [];

        if (getExecutablePath(context) === undefined) {
            diagnostics.push('MCU-Debug executable path is missing.');
        }

        if (context.debugConfig?.gdbPath === undefined || context.debugConfig.gdbPath.trim() === '') {
            diagnostics.push('MCU-Debug GDB path is missing.');
        }

        return {
            ok: diagnostics.length === 0,
            diagnostics
        };
    }
}

function getExecutablePath(context: EideProjectContext): string | undefined {
    return context.debugConfig?.executable ??
        context.outputFiles?.elf ??
        context.outputFiles?.executable;
}
