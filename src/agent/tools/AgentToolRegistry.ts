import { AgentPermissionLevel } from './AgentPermissionManager';

export interface AgentToolDefinition<Input = unknown, Output = unknown> {
    readonly name: string;
    readonly description: string;
    readonly permissionLevel: AgentPermissionLevel;
    readonly inputSchema?: unknown;
    run(input: Input): Promise<AgentToolResult<Output>>;
}

export interface AgentToolResult<Output = unknown> {
    readonly ok: boolean;
    readonly data?: Output;
    readonly message?: string;
    readonly diagnostics?: readonly string[];
}

export class AgentToolRegistry {
    private readonly tools = new Map<string, AgentToolDefinition>();

    register(tool: AgentToolDefinition): void {
        if (this.tools.has(tool.name)) {
            throw new Error(`Agent tool already registered: ${tool.name}`);
        }

        this.tools.set(tool.name, tool);
    }

    get(name: string): AgentToolDefinition | undefined {
        return this.tools.get(name);
    }

    list(): readonly AgentToolDefinition[] {
        return Array.from(this.tools.values());
    }
}
