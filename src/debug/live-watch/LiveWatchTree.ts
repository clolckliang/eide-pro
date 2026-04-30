export type LiveWatchNodeKind =
    | 'root'
    | 'variable'
    | 'field'
    | 'array-item'
    | 'pointer'
    | 'unknown';

export type LiveWatchValueFormat =
    | 'default'
    | 'decimal'
    | 'hex'
    | 'float'
    | 'bool'
    | 'string';

export type LiveWatchNodeState = 'pending' | 'ready' | 'unavailable' | 'error';

export interface LiveWatchVariableBinding {
    readonly expression: string;
    readonly label?: string;
    readonly format?: LiveWatchValueFormat;
}

export interface LiveWatchValue {
    readonly raw: string;
    readonly formatted?: string;
    readonly format?: LiveWatchValueFormat;
}

export interface LiveWatchNode {
    readonly id: string;
    readonly expression: string;
    readonly label: string;
    readonly kind: LiveWatchNodeKind;
    readonly state: LiveWatchNodeState;
    readonly typeName?: string;
    readonly value?: LiveWatchValue;
    readonly format?: LiveWatchValueFormat;
    readonly expandable: boolean;
    readonly children: readonly LiveWatchNode[];
}

export interface LiveWatchTree {
    readonly root: LiveWatchNode;
    readonly diagnostics: readonly string[];
}

export interface LiveWatchNodeUpdate {
    readonly expression: string;
    readonly state?: LiveWatchNodeState;
    readonly raw?: string;
    readonly formatted?: string;
    readonly format?: LiveWatchValueFormat;
    readonly typeName?: string;
    readonly expandable?: boolean;
    readonly children?: readonly LiveWatchNode[];
}

export function createLiveWatchTree(bindings: readonly LiveWatchVariableBinding[]): LiveWatchTree {
    const diagnostics: string[] = [];
    const seenExpressions = new Set<string>();
    const children: LiveWatchNode[] = [];

    for (const binding of bindings) {
        const expression = binding.expression.trim();

        if (expression === '') {
            diagnostics.push('Live Watch binding expression is empty.');
            continue;
        }

        if (seenExpressions.has(expression)) {
            diagnostics.push(`Live Watch binding expression is duplicated: ${expression}`);
            continue;
        }

        seenExpressions.add(expression);
        children.push(createBindingNode(binding, children.length));
    }

    return {
        root: {
            id: 'live-watch-root',
            expression: '',
            label: 'Live Watch',
            kind: 'root',
            state: 'ready',
            expandable: children.length > 0,
            children
        },
        diagnostics
    };
}

export function updateLiveWatchNode(root: LiveWatchNode, update: LiveWatchNodeUpdate): LiveWatchNode {
    if (root.expression === update.expression) {
        return applyUpdate(root, update);
    }

    let changed = false;
    const children = root.children.map((child) => {
        const updatedChild = updateLiveWatchNode(child, update);

        if (updatedChild !== child) {
            changed = true;
        }

        return updatedChild;
    });

    if (!changed) {
        return root;
    }

    return {
        ...root,
        children
    };
}

export function createChildNode(
    parent: LiveWatchNode,
    label: string,
    kind: LiveWatchNodeKind,
    expression?: string
): LiveWatchNode {
    const childExpression = expression ?? createChildExpression(parent.expression, label, kind);

    return {
        id: createNodeId(childExpression),
        expression: childExpression,
        label,
        kind,
        state: 'pending',
        format: parent.format,
        expandable: false,
        children: []
    };
}

function createBindingNode(binding: LiveWatchVariableBinding, index: number): LiveWatchNode {
    const expression = binding.expression.trim();

    return {
        id: createNodeId(expression, index),
        expression,
        label: binding.label ?? expression,
        kind: inferNodeKind(expression),
        state: 'pending',
        format: binding.format ?? 'default',
        expandable: false,
        children: []
    };
}

function applyUpdate(node: LiveWatchNode, update: LiveWatchNodeUpdate): LiveWatchNode {
    const format = update.format ?? node.format;

    return {
        ...node,
        state: update.state ?? node.state,
        typeName: update.typeName ?? node.typeName,
        value: update.raw === undefined && update.formatted === undefined
            ? node.value
            : {
                raw: update.raw ?? node.value?.raw ?? '',
                formatted: update.formatted ?? update.raw ?? node.value?.formatted,
                format
            },
        format,
        expandable: update.expandable ?? (update.children !== undefined && update.children.length > 0),
        children: update.children ?? node.children
    };
}

function inferNodeKind(expression: string): LiveWatchNodeKind {
    if (expression.includes('->')) {
        return 'pointer';
    }

    if (/\[[^\]]+\]$/.test(expression)) {
        return 'array-item';
    }

    if (expression.includes('.')) {
        return 'field';
    }

    return 'variable';
}

function createChildExpression(parentExpression: string, label: string, kind: LiveWatchNodeKind): string {
    if (kind === 'array-item') {
        return `${parentExpression}[${label}]`;
    }

    if (kind === 'pointer') {
        return `${parentExpression}->${label}`;
    }

    return `${parentExpression}.${label}`;
}

function createNodeId(expression: string, fallbackIndex?: number): string {
    const normalized = expression
        .trim()
        .replace(/[^A-Za-z0-9_]+/g, '-')
        .replace(/^-+|-+$/g, '');

    if (normalized === '') {
        return fallbackIndex === undefined ? 'live-watch-node' : `live-watch-node-${fallbackIndex}`;
    }

    return `live-watch-${normalized}`;
}
