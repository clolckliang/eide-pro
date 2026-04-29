import { strict as assert } from 'assert';
import { describe, it } from 'mocha';
import { AgentPermissionManager } from '../../../agent/tools/AgentPermissionManager';

describe('AgentPermissionManager', () => {
    it('uses the default safety policy', () => {
        const manager = new AgentPermissionManager();

        assert.equal(manager.getDecision('readonly'), 'allow');
        assert.equal(manager.getDecision('debug-control'), 'require-approval');
        assert.equal(manager.getDecision('device-control'), 'require-approval');
        assert.equal(manager.getDecision('dangerous'), 'deny');
    });

    it('only allows readonly tools to run without approval by default', () => {
        const manager = new AgentPermissionManager();

        assert.equal(manager.canRunWithoutApproval('readonly'), true);
        assert.equal(manager.canRunWithoutApproval('debug-control'), false);
        assert.equal(manager.canRunWithoutApproval('device-control'), false);
        assert.equal(manager.canRunWithoutApproval('dangerous'), false);
    });
});
