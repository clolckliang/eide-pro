export interface PidParameters {
    readonly kp: number;
    readonly ki: number;
    readonly kd: number;
}

export interface PidParameterRange {
    readonly min: number;
    readonly max: number;
}

export interface PidSafetyLimits {
    readonly kp: PidParameterRange;
    readonly ki: PidParameterRange;
    readonly kd: PidParameterRange;
    readonly output?: PidParameterRange;
    readonly setpoint?: PidParameterRange;
    readonly maxTestDurationMs: number;
}

export interface PidTuningRequest {
    readonly parameters: PidParameters;
    readonly setpoint?: number;
    readonly outputLimit?: number;
    readonly testDurationMs: number;
}

export type PidSafetyDecision = 'allow-preview' | 'reject';

export interface PidSafetyViolation {
    readonly code: string;
    readonly message: string;
    readonly field: string;
}

export interface PidSafetyReport {
    readonly decision: PidSafetyDecision;
    readonly violations: readonly PidSafetyViolation[];
    readonly requiresUserApproval: boolean;
}

export interface PidSuggestion {
    readonly parameters: PidParameters;
    readonly reason: string;
    readonly requiresUserApproval: true;
}

export class PidSafetyGuard {
    private readonly limits: PidSafetyLimits;

    constructor(limits: PidSafetyLimits) {
        this.limits = limits;
    }

    validateRequest(request: PidTuningRequest): PidSafetyReport {
        const violations: PidSafetyViolation[] = [];

        appendRangeViolation(violations, 'kp', request.parameters.kp, this.limits.kp);
        appendRangeViolation(violations, 'ki', request.parameters.ki, this.limits.ki);
        appendRangeViolation(violations, 'kd', request.parameters.kd, this.limits.kd);

        if (request.setpoint !== undefined && this.limits.setpoint !== undefined) {
            appendRangeViolation(violations, 'setpoint', request.setpoint, this.limits.setpoint);
        }

        if (request.outputLimit !== undefined && this.limits.output !== undefined) {
            appendRangeViolation(violations, 'outputLimit', request.outputLimit, this.limits.output);
        }

        if (!Number.isFinite(request.testDurationMs) || request.testDurationMs <= 0) {
            violations.push({
                code: 'pid-invalid-test-duration',
                field: 'testDurationMs',
                message: 'PID test duration must be a positive finite number.'
            });
        } else if (request.testDurationMs > this.limits.maxTestDurationMs) {
            violations.push({
                code: 'pid-test-duration-out-of-range',
                field: 'testDurationMs',
                message: `PID test duration ${request.testDurationMs} exceeds maximum ${this.limits.maxTestDurationMs}.`
            });
        }

        return {
            decision: violations.length === 0 ? 'allow-preview' : 'reject',
            violations,
            requiresUserApproval: true
        };
    }

    createSuggestion(parameters: PidParameters, reason: string): PidSuggestion {
        return {
            parameters,
            reason,
            requiresUserApproval: true
        };
    }
}

export function createDefaultPidSafetyLimits(): PidSafetyLimits {
    return {
        kp: {
            min: 0,
            max: 1000
        },
        ki: {
            min: 0,
            max: 1000
        },
        kd: {
            min: 0,
            max: 1000
        },
        output: {
            min: -100,
            max: 100
        },
        setpoint: {
            min: -100,
            max: 100
        },
        maxTestDurationMs: 30000
    };
}

function appendRangeViolation(
    violations: PidSafetyViolation[],
    field: string,
    value: number,
    range: PidParameterRange
): void {
    if (!Number.isFinite(value)) {
        violations.push({
            code: 'pid-value-not-finite',
            field,
            message: `${field} must be a finite number.`
        });
        return;
    }

    if (value < range.min || value > range.max) {
        violations.push({
            code: 'pid-value-out-of-range',
            field,
            message: `${field} value ${value} is outside allowed range ${range.min}..${range.max}.`
        });
    }
}
