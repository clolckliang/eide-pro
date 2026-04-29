import { LiveWatchValue, LiveWatchValueFormat } from './LiveWatchTree';

export function formatLiveWatchValue(raw: string, format: LiveWatchValueFormat): LiveWatchValue {
    const formatted = formatValue(raw, format);

    return {
        raw,
        formatted,
        format
    };
}

function formatValue(raw: string, format: LiveWatchValueFormat): string {
    switch (format) {
        case 'decimal':
            return formatDecimal(raw);
        case 'hex':
            return formatHex(raw);
        case 'float':
            return formatFloat(raw);
        case 'bool':
            return formatBool(raw);
        case 'string':
            return formatString(raw);
        case 'default':
            return raw;
        default:
            return raw;
    }
}

function formatDecimal(raw: string): string {
    const value = parseNumericValue(raw);

    return value === undefined ? raw : String(Math.trunc(value));
}

function formatHex(raw: string): string {
    const value = parseNumericValue(raw);

    if (value === undefined) {
        return raw;
    }

    const integer = Math.trunc(value);
    const prefix = integer < 0 ? '-0x' : '0x';

    return `${prefix}${Math.abs(integer).toString(16).toUpperCase()}`;
}

function formatFloat(raw: string): string {
    const value = parseNumericValue(raw);

    return value === undefined ? raw : String(value);
}

function formatBool(raw: string): string {
    const value = parseNumericValue(raw);

    if (value === undefined) {
        const normalized = raw.trim().toLowerCase();

        if (normalized === 'true' || normalized === 'false') {
            return normalized;
        }

        return raw;
    }

    return value === 0 ? 'false' : 'true';
}

function formatString(raw: string): string {
    const trimmed = raw.trim();

    if (trimmed.length >= 2 && (
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
    )) {
        return trimmed.slice(1, -1);
    }

    return raw;
}

function parseNumericValue(raw: string): number | undefined {
    const normalized = raw.trim();

    if (normalized === '') {
        return undefined;
    }

    const value = /^[-+]?0x[0-9a-f]+$/i.test(normalized)
        ? Number.parseInt(normalized, 16)
        : Number(normalized);

    return Number.isFinite(value) ? value : undefined;
}
