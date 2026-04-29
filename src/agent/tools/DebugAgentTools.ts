import { DebugService } from '../../debug/DebugService';
import { DebugBackendValidation, DebugLaunchConfig } from '../../debug/backends/DebugBackend';
import { AgentToolDefinition, AgentToolResult } from './AgentToolRegistry';
import { ProjectContextProvider } from './ProjectAgentTools';

export interface DebugBackendSummary {
    readonly id: string;
    readonly displayName: string;
}

export interface DebugBackendInput {
    readonly backendId: string;
}

type DebugBackendInputResult =
    | {
        readonly ok: true;
        readonly data: DebugBackendInput;
    }
    | {
        readonly ok: false;
        readonly message: string;
    };

export function createDebugBackendListTool(
    debugService: DebugService
): AgentToolDefinition<unknown, readonly DebugBackendSummary[]> {
    return {
        name: 'debug.list_backends',
        description: 'List registered debug backends without starting or controlling a debug session.',
        permissionLevel: 'readonly',
        run: async (): Promise<AgentToolResult<readonly DebugBackendSummary[]>> => ({
            ok: true,
            data: debugService.listBackends().map((backend) => ({
                id: backend.id,
                displayName: backend.displayName
            }))
        })
    };
}

export function createDebugLaunchPreviewTool(
    debugService: DebugService,
    contextProvider: ProjectContextProvider
): AgentToolDefinition<unknown, DebugLaunchConfig> {
    return {
        name: 'debug.preview_launch_config',
        description: 'Preview a debug launch configuration without starting a debug session.',
        permissionLevel: 'readonly',
        inputSchema: createDebugBackendInputSchema(),
        run: async (input: unknown): Promise<AgentToolResult<DebugLaunchConfig>> => {
            const backendInput = parseDebugBackendInput(input, 'debug.preview_launch_config');

            if (backendInput.ok === false) {
                return backendInput;
            }

            const context = await contextProvider();

            if (context === undefined) {
                return missingProjectContextResult();
            }

            return runDebugTool(() => debugService.createLaunchConfig(backendInput.data.backendId, context));
        }
    };
}

export function createDebugValidateEnvironmentTool(
    debugService: DebugService,
    contextProvider: ProjectContextProvider
): AgentToolDefinition<unknown, DebugBackendValidation> {
    return {
        name: 'debug.validate_environment',
        description: 'Validate debug backend settings without starting or controlling a debug session.',
        permissionLevel: 'readonly',
        inputSchema: createDebugBackendInputSchema(),
        run: async (input: unknown): Promise<AgentToolResult<DebugBackendValidation>> => {
            const backendInput = parseDebugBackendInput(input, 'debug.validate_environment');

            if (backendInput.ok === false) {
                return backendInput;
            }

            const context = await contextProvider();

            if (context === undefined) {
                return missingProjectContextResult();
            }

            return runDebugTool(() => debugService.validateEnvironment(backendInput.data.backendId, context));
        }
    };
}

function createDebugBackendInputSchema(): unknown {
    return {
        type: 'object',
        required: ['backendId'],
        properties: {
            backendId: {
                type: 'string'
            }
        }
    };
}

function parseDebugBackendInput(
    input: unknown,
    toolName: string
): DebugBackendInputResult {
    if (!isRecord(input) || typeof input.backendId !== 'string' || input.backendId.trim() === '') {
        return {
            ok: false,
            message: `${toolName} requires an input object with backendId.`
        };
    }

    return {
        ok: true,
        data: {
            backendId: input.backendId
        }
    };
}

function missingProjectContextResult<Output>(): AgentToolResult<Output> {
    return {
        ok: false,
        message: 'No active EIDE project context is available.'
    };
}

async function runDebugTool<Output>(
    action: () => Promise<Output> | Output
): Promise<AgentToolResult<Output>> {
    try {
        return {
            ok: true,
            data: await action()
        };
    } catch (error: unknown) {
        return {
            ok: false,
            message: error instanceof Error ? error.message : 'Debug tool failed.'
        };
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
