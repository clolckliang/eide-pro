import { strict as assert } from 'assert';
import { describe, it } from 'mocha';
import { LiveWatchNode } from '../../../debug/live-watch/LiveWatchTree';

const {
    createChildNode,
    createLiveWatchTree,
    updateLiveWatchNode
} = require('../../../debug/live-watch/LiveWatchTree') as typeof import('../../../debug/live-watch/LiveWatchTree');

describe('LiveWatchTree', () => {
    it('creates a root node with pending variable bindings', () => {
        const tree = createLiveWatchTree([
            {
                expression: 'pid.output',
                label: 'Output',
                format: 'float'
            },
            {
                expression: 'adc_values[0]',
                format: 'decimal'
            },
            {
                expression: 'controller->state'
            }
        ]);

        assert.deepEqual(tree.diagnostics, []);
        assert.equal(tree.root.label, 'Live Watch');
        assert.equal(tree.root.expandable, true);
        assert.equal(tree.root.children.length, 3);
        assert.equal(tree.root.children[0].kind, 'field');
        assert.equal(tree.root.children[0].label, 'Output');
        assert.equal(tree.root.children[0].format, 'float');
        assert.equal(tree.root.children[1].kind, 'array-item');
        assert.equal(tree.root.children[2].kind, 'pointer');
    });

    it('reports empty and duplicate bindings without throwing', () => {
        const tree = createLiveWatchTree([
            {
                expression: ''
            },
            {
                expression: 'motor.speed'
            },
            {
                expression: ' motor.speed '
            }
        ]);

        assert.deepEqual(tree.diagnostics, [
            'Live Watch binding expression is empty.',
            'Live Watch binding expression is duplicated: motor.speed'
        ]);
        assert.equal(tree.root.children.length, 1);
    });

    it('updates a matching node immutably', () => {
        const tree = createLiveWatchTree([
            {
                expression: 'pid.output',
                format: 'float'
            }
        ]);

        const updatedRoot = updateLiveWatchNode(tree.root, {
            expression: 'pid.output',
            state: 'ready',
            raw: '1.25',
            formatted: '1.25',
            typeName: 'float'
        });

        assert.notEqual(updatedRoot, tree.root);
        assert.equal(tree.root.children[0].state, 'pending');
        assert.equal(updatedRoot.children[0].state, 'ready');
        assert.equal(updatedRoot.children[0].value?.raw, '1.25');
        assert.equal(updatedRoot.children[0].value?.format, 'float');
        assert.equal(updatedRoot.children[0].typeName, 'float');
    });

    it('returns the same root when no node matches an update', () => {
        const tree = createLiveWatchTree([
            {
                expression: 'pid.output'
            }
        ]);

        const updatedRoot = updateLiveWatchNode(tree.root, {
            expression: 'missing',
            raw: '0'
        });

        assert.equal(updatedRoot, tree.root);
    });

    it('creates child nodes for fields, arrays, and pointers', () => {
        const tree = createLiveWatchTree([
            {
                expression: 'controller'
            }
        ]);
        const parent: LiveWatchNode = tree.root.children[0];

        const field = createChildNode(parent, 'state', 'field');
        const arrayItem = createChildNode(parent, '0', 'array-item');
        const pointer = createChildNode(parent, 'next', 'pointer');

        assert.equal(field.expression, 'controller.state');
        assert.equal(arrayItem.expression, 'controller[0]');
        assert.equal(pointer.expression, 'controller->next');
        assert.equal(field.state, 'pending');
        assert.deepEqual(pointer.children, []);
    });
});
