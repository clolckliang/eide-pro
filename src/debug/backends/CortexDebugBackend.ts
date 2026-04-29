import { EideProjectContext } from '../../core/project/EideProjectContext';
import { DebugBackend, DebugBackendValidation, DebugLaunchConfig } from './DebugBackend';

export class CortexDebugBackend implements DebugBackend {
    readonly id = 'cortex-debug';
    readonly displayName = 'Cortex-Debug';

    createLaunchConfig(context: EideProjectContext): DebugLaunchConfig {
        return {
            backendId: this.id,
            type: 'cortex-debug',
            request: 'launch',
            name: createDebugName(context.projectName, this.displayName),
            executable: getExecutablePath(context),
            gdbPath: context.debugConfig?.gdbPath,
            serverType: context.debugConfig?.serverType ?? inferServerType(context.flashConfig?.programmer),
            svdPath: context.debugConfig?.svdPath
        };
    }

    async validateEnvironment(context: EideProjectContext): Promise<DebugBackendValidation> {
        const diagnostics = createCommonDiagnostics(context, this.displayName);
        const launchConfig = this.createLaunchConfig(context);

        if (launchConfig.serverType === undefined || launchConfig.serverType.trim() === '') {
            diagnostics.push('Cortex-Debug server type is missing.');
        }

        return {
            ok: diagnostics.length === 0,
            diagnostics
        };
    }
}

function createCommonDiagnostics(context: EideProjectContext, displayName: string): string[] {
    const diagnostics: string[] = [];

    if (getExecutablePath(context) === undefined) {
        diagnostics.push(`${displayName} executable path is missing.`);
    }

    if (context.debugConfig?.gdbPath === undefined || context.debugConfig.gdbPath.trim() === '') {
        diagnostics.push(`${displayName} GDB path is missing.`);
    }

    return diagnostics;
}

function getExecutablePath(context: EideProjectContext): string | undefined {
    return context.debugConfig?.executable ??
        context.outputFiles?.elf ??
        context.outputFiles?.executable;
}

function createDebugName(projectName: string, displayName: string): string {
    return `${projectName} (${displayName})`;
}

function inferServerType(programmer: string | undefined): string | undefined {
    if (programmer === undefined || programmer.trim() === '') {
        return undefined;
    }

    const normalized = programmer.toLowerCase();

    if (normalized.includes('jlink') || normalized.includes('j-link')) {
        return 'jlink';
    }

    if (normalized.includes('openocd')) {
        return 'openocd';
    }

    if (normalized.includes('pyocd')) {
        return 'pyocd';
    }

    if (normalized.includes('stlink') || normalized.includes('st-link')) {
        return 'stlink';
    }

    return undefined;
}
