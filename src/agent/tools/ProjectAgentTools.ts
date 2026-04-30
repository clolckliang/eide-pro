import { ExportManager, ExportResult } from '../../core/export/ExportManager';
import { EideProjectContext } from '../../core/project/EideProjectContext';
import { NormalizedProjectModel } from '../../core/project/NormalizedProjectModel';
import { AgentToolDefinition, AgentToolResult } from './AgentToolRegistry';

export type ProjectContextProvider = () => Promise<EideProjectContext | undefined> | EideProjectContext | undefined;
export type NormalizedProjectModelProvider = () => Promise<NormalizedProjectModel | undefined> | NormalizedProjectModel | undefined;

export interface ExportPreviewInput {
    readonly exporterId: string;
    readonly outputRoot?: string;
}

export function createProjectContextTool(
    provider: ProjectContextProvider
): AgentToolDefinition<unknown, EideProjectContext> {
    return {
        name: 'project.get_context',
        description: 'Return the current EIDE project context without modifying files or hardware.',
        permissionLevel: 'readonly',
        run: async (): Promise<AgentToolResult<EideProjectContext>> => {
            const context = await provider();

            if (context === undefined) {
                return {
                    ok: false,
                    message: 'No active EIDE project context is available.'
                };
            }

            return {
                ok: true,
                data: context
            };
        }
    };
}

export function createExportPreviewTool(
    exportManager: ExportManager,
    modelProvider: NormalizedProjectModelProvider,
    defaultOutputRoot = ''
): AgentToolDefinition<unknown, ExportResult> {
    return {
        name: 'export.preview',
        description: 'Preview an export result from the normalized project model without writing files.',
        permissionLevel: 'readonly',
        inputSchema: {
            type: 'object',
            required: ['exporterId'],
            properties: {
                exporterId: {
                    type: 'string'
                },
                outputRoot: {
                    type: 'string'
                }
            }
        },
        run: async (input: unknown): Promise<AgentToolResult<ExportResult>> => {
            if (!isExportPreviewInput(input)) {
                return {
                    ok: false,
                    message: 'export.preview requires an input object with exporterId.'
                };
            }

            const model = await modelProvider();

            if (model === undefined) {
                return {
                    ok: false,
                    message: 'No normalized project model is available.'
                };
            }

            const result = await exportManager.exportProject(
                input.exporterId,
                model,
                input.outputRoot ?? defaultOutputRoot
            );

            return {
                ok: true,
                data: result
            };
        }
    };
}

function isExportPreviewInput(input: unknown): input is ExportPreviewInput {
    if (!isRecord(input)) {
        return false;
    }

    return typeof input.exporterId === 'string' &&
        input.exporterId.trim() !== '' &&
        (input.outputRoot === undefined || typeof input.outputRoot === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
