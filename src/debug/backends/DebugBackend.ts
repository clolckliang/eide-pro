import { EideProjectContext } from '../../core/project/EideProjectContext';

export type DebugBackendId =
    | 'cortex-debug'
    | 'mcu-debug'
    | 'probe-rs-debug'
    | 'external-gdb'
    | 'native-gdb';

export interface DebugLaunchConfig {
    readonly backendId: DebugBackendId | string;
    readonly type: string;
    readonly request: 'launch' | 'attach';
    readonly name: string;
    readonly executable?: string;
    readonly gdbPath?: string;
    readonly serverType?: string;
    readonly svdPath?: string;
}

export interface DebugBackendValidation {
    readonly ok: boolean;
    readonly diagnostics: readonly string[];
}

export interface DebugBackend {
    readonly id: DebugBackendId | string;
    readonly displayName: string;
    createLaunchConfig(context: EideProjectContext): DebugLaunchConfig;
    validateEnvironment(context: EideProjectContext): Promise<DebugBackendValidation>;
}
