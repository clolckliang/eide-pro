export type AgentPermissionLevel = 'readonly' | 'debug-control' | 'device-control' | 'dangerous';

export type AgentPermissionDecision = 'allow' | 'require-approval' | 'deny';

export interface AgentPermissionPolicy {
    readonly readonly: AgentPermissionDecision;
    readonly 'debug-control': AgentPermissionDecision;
    readonly 'device-control': AgentPermissionDecision;
    readonly dangerous: AgentPermissionDecision;
}

export const DEFAULT_AGENT_PERMISSION_POLICY: AgentPermissionPolicy = {
    readonly: 'allow',
    'debug-control': 'require-approval',
    'device-control': 'require-approval',
    dangerous: 'deny'
};

export class AgentPermissionManager {
    private readonly policy: AgentPermissionPolicy;

    constructor(policy: AgentPermissionPolicy = DEFAULT_AGENT_PERMISSION_POLICY) {
        this.policy = policy;
    }

    getDecision(level: AgentPermissionLevel): AgentPermissionDecision {
        return this.policy[level];
    }

    canRunWithoutApproval(level: AgentPermissionLevel): boolean {
        return this.getDecision(level) === 'allow';
    }
}
