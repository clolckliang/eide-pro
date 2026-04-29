import { strict as assert } from 'assert';
import { describe, it } from 'mocha';

const {
    analyzeCortexMFault
} = require('../../../debug/fault/CortexMFaultAnalyzer') as typeof import('../../../debug/fault/CortexMFaultAnalyzer');

describe('CortexMFaultAnalyzer', () => {
    it('reports no active status bits for an empty snapshot', () => {
        const report = analyzeCortexMFault({});

        assert.equal(report.architecture, 'cortex-m');
        assert.equal(report.requiresManualReview, false);
        assert.equal(report.summary, 'No active Cortex-M fault status bits were detected.');
        assert.deepEqual(report.findings.map((finding) => finding.code), ['fault-no-active-status-bits']);
    });

    it('decodes CFSR MemManage, BusFault, and UsageFault bits', () => {
        const report = analyzeCortexMFault({
            cfsr: (1 << 1) | (1 << 9) | (1 << 25)
        });

        assert.equal(report.requiresManualReview, true);
        assert.equal(report.summary, 'Detected 3 fault finding(s) and 0 warning finding(s).');
        assert.deepEqual(report.findings.map((finding) => finding.code), [
            'memmanage-daccviol',
            'busfault-preciserr',
            'usagefault-divbyzero'
        ]);
    });

    it('decodes HFSR forced hardfault status', () => {
        const report = analyzeCortexMFault({
            hfsr: 1 << 30
        });

        assert.deepEqual(report.findings.map((finding) => finding.code), ['hardfault-forced']);
        assert.equal(report.findings[0].register, 'HFSR');
        assert.equal(report.findings[0].bit, 30);
    });

    it('reports valid fault addresses when provided', () => {
        const report = analyzeCortexMFault({
            cfsr: (1 << 7) | (1 << 15),
            mmfar: 0x20000004,
            bfar: 0x08001234
        });

        assert.deepEqual(report.findings.map((finding) => finding.code), [
            'memmanage-mmfar-valid',
            'busfault-bfar-valid'
        ]);
        assert.equal(report.findings[0].severity, 'info');
        assert.equal(report.findings[0].message, 'MMFAR contains 0x20000004.');
        assert.equal(report.findings[1].message, 'BFAR contains 0x08001234.');
    });

    it('warns when address-valid bits are set without address values', () => {
        const report = analyzeCortexMFault({
            cfsr: (1 << 7) | (1 << 15)
        });

        assert.equal(report.requiresManualReview, true);
        assert.deepEqual(report.findings.map((finding) => finding.severity), ['warning', 'warning']);
        assert.equal(report.summary, 'Detected 0 fault finding(s) and 2 warning finding(s).');
    });
});
