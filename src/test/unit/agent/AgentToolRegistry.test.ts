import { strict as assert } from 'assert';
import { describe, it } from 'mocha';
import { AgentToolDefinition, AgentToolRegistry } from '../../../agent/tools/AgentToolRegistry';

describe('AgentToolRegistry', () => {
    it('registers and lists agent tools', () => {
        const registry = new AgentToolRegistry();
        const tool = createTool('project.get_context');

        registry.register(tool);

        assert.equal(registry.get('project.get_context'), tool);
        assert.deepEqual(registry.list(), [tool]);
    });

    it('rejects duplicate tool names', () => {
        const registry = new AgentToolRegistry();

        registry.register(createTool('project.get_context'));

        assert.throws(
            () => registry.register(createTool('project.get_context')),
            /Agent tool already registered: project\.get_context/
        );
    });
});

function createTool(name: string): AgentToolDefinition<void, { readonly name: string }> {
    return {
        name,
        description: 'Return a test result.',
        permissionLevel: 'readonly',
        run: async () => ({
            ok: true,
            data: { name }
        })
    };
}
