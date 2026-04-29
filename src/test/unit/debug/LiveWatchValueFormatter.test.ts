import { strict as assert } from 'assert';
import { describe, it } from 'mocha';

const {
    formatLiveWatchValue
} = require('../../../debug/live-watch/LiveWatchValueFormatter') as typeof import('../../../debug/live-watch/LiveWatchValueFormatter');

describe('LiveWatchValueFormatter', () => {
    it('formats decimal values', () => {
        assert.deepEqual(formatLiveWatchValue('42.9', 'decimal'), {
            raw: '42.9',
            formatted: '42',
            format: 'decimal'
        });
    });

    it('formats hex values', () => {
        assert.deepEqual(formatLiveWatchValue('255', 'hex'), {
            raw: '255',
            formatted: '0xFF',
            format: 'hex'
        });
    });

    it('formats float values', () => {
        assert.deepEqual(formatLiveWatchValue('3.25', 'float'), {
            raw: '3.25',
            formatted: '3.25',
            format: 'float'
        });
    });

    it('formats bool values from numeric and string input', () => {
        assert.deepEqual(formatLiveWatchValue('0', 'bool'), {
            raw: '0',
            formatted: 'false',
            format: 'bool'
        });
        assert.deepEqual(formatLiveWatchValue('7', 'bool'), {
            raw: '7',
            formatted: 'true',
            format: 'bool'
        });
        assert.deepEqual(formatLiveWatchValue('TRUE', 'bool'), {
            raw: 'TRUE',
            formatted: 'true',
            format: 'bool'
        });
    });

    it('formats quoted strings without changing raw', () => {
        assert.deepEqual(formatLiveWatchValue('"ready"', 'string'), {
            raw: '"ready"',
            formatted: 'ready',
            format: 'string'
        });
    });

    it('preserves invalid numeric input without throwing', () => {
        assert.deepEqual(formatLiveWatchValue('not-a-number', 'hex'), {
            raw: 'not-a-number',
            formatted: 'not-a-number',
            format: 'hex'
        });
    });

    it('preserves raw value for default format', () => {
        assert.deepEqual(formatLiveWatchValue('0x2A', 'default'), {
            raw: '0x2A',
            formatted: '0x2A',
            format: 'default'
        });
    });
});
