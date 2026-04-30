import { strict as assert } from 'assert';
import { describe, it } from 'mocha';

const {
    createDefaultPidSafetyLimits,
    PidSafetyGuard
} = require('../../../debug/pid-tuner/PidSafetyGuard') as typeof import('../../../debug/pid-tuner/PidSafetyGuard');

describe('PidSafetyGuard', () => {
    it('allows safe preview requests while still requiring user approval', () => {
        const guard = new PidSafetyGuard(createDefaultPidSafetyLimits());

        const report = guard.validateRequest({
            parameters: {
                kp: 1.2,
                ki: 0.1,
                kd: 0.01
            },
            setpoint: 50,
            outputLimit: 80,
            testDurationMs: 5000
        });

        assert.equal(report.decision, 'allow-preview');
        assert.equal(report.requiresUserApproval, true);
        assert.deepEqual(report.violations, []);
    });

    it('rejects PID parameters outside configured ranges', () => {
        const guard = new PidSafetyGuard(createDefaultPidSafetyLimits());

        const report = guard.validateRequest({
            parameters: {
                kp: -1,
                ki: 1001,
                kd: Number.NaN
            },
            testDurationMs: 5000
        });

        assert.equal(report.decision, 'reject');
        assert.deepEqual(report.violations.map((violation) => violation.field), ['kp', 'ki', 'kd']);
        assert.deepEqual(report.violations.map((violation) => violation.code), [
            'pid-value-out-of-range',
            'pid-value-out-of-range',
            'pid-value-not-finite'
        ]);
    });

    it('rejects unsafe setpoint, output, and duration values', () => {
        const guard = new PidSafetyGuard(createDefaultPidSafetyLimits());

        const report = guard.validateRequest({
            parameters: {
                kp: 1,
                ki: 1,
                kd: 1
            },
            setpoint: 150,
            outputLimit: 150,
            testDurationMs: 60000
        });

        assert.equal(report.decision, 'reject');
        assert.deepEqual(report.violations.map((violation) => violation.field), [
            'setpoint',
            'outputLimit',
            'testDurationMs'
        ]);
    });

    it('rejects non-positive test durations', () => {
        const guard = new PidSafetyGuard(createDefaultPidSafetyLimits());

        const report = guard.validateRequest({
            parameters: {
                kp: 1,
                ki: 1,
                kd: 1
            },
            testDurationMs: 0
        });

        assert.equal(report.decision, 'reject');
        assert.equal(report.violations[0].code, 'pid-invalid-test-duration');
    });

    it('creates suggestions that always require approval', () => {
        const guard = new PidSafetyGuard(createDefaultPidSafetyLimits());

        const suggestion = guard.createSuggestion({
            kp: 2,
            ki: 0.2,
            kd: 0.02
        }, 'Conservative increase based on simulated response.');

        assert.equal(suggestion.requiresUserApproval, true);
        assert.equal(suggestion.reason, 'Conservative increase based on simulated response.');
        assert.deepEqual(suggestion.parameters, {
            kp: 2,
            ki: 0.2,
            kd: 0.02
        });
    });
});
