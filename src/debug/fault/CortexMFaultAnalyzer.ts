export interface CortexMFaultSnapshot {
    readonly cfsr?: number;
    readonly hfsr?: number;
    readonly mmfar?: number;
    readonly bfar?: number;
}

export type FaultFindingSeverity = 'info' | 'warning' | 'fault';

export interface FaultFinding {
    readonly severity: FaultFindingSeverity;
    readonly code: string;
    readonly register: 'CFSR' | 'MMFSR' | 'BFSR' | 'UFSR' | 'HFSR';
    readonly bit?: number;
    readonly title: string;
    readonly message: string;
}

export interface CortexMFaultAnalysisReport {
    readonly architecture: 'cortex-m';
    readonly summary: string;
    readonly findings: readonly FaultFinding[];
    readonly requiresManualReview: boolean;
}

interface FaultBitDefinition {
    readonly register: FaultFinding['register'];
    readonly bit: number;
    readonly code: string;
    readonly title: string;
    readonly message: string;
}

const CFSR_BITS: readonly FaultBitDefinition[] = [
    {
        register: 'MMFSR',
        bit: 0,
        code: 'memmanage-iaccviol',
        title: 'Instruction access violation',
        message: 'The processor attempted to execute from an invalid or protected memory region.'
    },
    {
        register: 'MMFSR',
        bit: 1,
        code: 'memmanage-daccviol',
        title: 'Data access violation',
        message: 'The processor attempted to read or write an invalid or protected memory region.'
    },
    {
        register: 'MMFSR',
        bit: 3,
        code: 'memmanage-munstkerr',
        title: 'MemManage unstacking error',
        message: 'A MemManage fault occurred while restoring state from the exception stack frame.'
    },
    {
        register: 'MMFSR',
        bit: 4,
        code: 'memmanage-mstkerr',
        title: 'MemManage stacking error',
        message: 'A MemManage fault occurred while saving state to the exception stack frame.'
    },
    {
        register: 'MMFSR',
        bit: 5,
        code: 'memmanage-mlsperr',
        title: 'MemManage lazy state preservation error',
        message: 'A MemManage fault occurred during floating-point lazy state preservation.'
    },
    {
        register: 'BFSR',
        bit: 8,
        code: 'busfault-ibuserr',
        title: 'Instruction bus error',
        message: 'A bus fault occurred during instruction prefetch.'
    },
    {
        register: 'BFSR',
        bit: 9,
        code: 'busfault-preciserr',
        title: 'Precise data bus error',
        message: 'A precise bus fault occurred and the faulting address may be available in BFAR.'
    },
    {
        register: 'BFSR',
        bit: 10,
        code: 'busfault-impreciserr',
        title: 'Imprecise data bus error',
        message: 'An imprecise bus fault occurred; the faulting instruction may have already retired.'
    },
    {
        register: 'BFSR',
        bit: 11,
        code: 'busfault-unstkerr',
        title: 'BusFault unstacking error',
        message: 'A bus fault occurred while restoring state from the exception stack frame.'
    },
    {
        register: 'BFSR',
        bit: 12,
        code: 'busfault-stkerr',
        title: 'BusFault stacking error',
        message: 'A bus fault occurred while saving state to the exception stack frame.'
    },
    {
        register: 'BFSR',
        bit: 13,
        code: 'busfault-lsperr',
        title: 'BusFault lazy state preservation error',
        message: 'A bus fault occurred during floating-point lazy state preservation.'
    },
    {
        register: 'UFSR',
        bit: 16,
        code: 'usagefault-undefinstr',
        title: 'Undefined instruction',
        message: 'The processor attempted to execute an undefined instruction.'
    },
    {
        register: 'UFSR',
        bit: 17,
        code: 'usagefault-invstate',
        title: 'Invalid state',
        message: 'The processor attempted to execute with an invalid EPSR or instruction state.'
    },
    {
        register: 'UFSR',
        bit: 18,
        code: 'usagefault-invpc',
        title: 'Invalid exception return',
        message: 'The processor attempted an invalid exception return sequence.'
    },
    {
        register: 'UFSR',
        bit: 19,
        code: 'usagefault-nocp',
        title: 'No coprocessor',
        message: 'The processor attempted to access an unavailable coprocessor.'
    },
    {
        register: 'UFSR',
        bit: 24,
        code: 'usagefault-unaligned',
        title: 'Unaligned access',
        message: 'An unaligned memory access trapped as a UsageFault.'
    },
    {
        register: 'UFSR',
        bit: 25,
        code: 'usagefault-divbyzero',
        title: 'Divide by zero',
        message: 'An integer divide-by-zero operation trapped as a UsageFault.'
    }
];

const HFSR_BITS: readonly FaultBitDefinition[] = [
    {
        register: 'HFSR',
        bit: 1,
        code: 'hardfault-vecttbl',
        title: 'Vector table read fault',
        message: 'A fault occurred while reading from the vector table.'
    },
    {
        register: 'HFSR',
        bit: 30,
        code: 'hardfault-forced',
        title: 'Forced HardFault',
        message: 'A configurable fault escalated to HardFault.'
    },
    {
        register: 'HFSR',
        bit: 31,
        code: 'hardfault-debugevt',
        title: 'Debug event',
        message: 'A debug event is associated with the HardFault status.'
    }
];

export function analyzeCortexMFault(snapshot: CortexMFaultSnapshot): CortexMFaultAnalysisReport {
    const findings: FaultFinding[] = [
        ...decodeRegister(snapshot.cfsr, CFSR_BITS),
        ...decodeRegister(snapshot.hfsr, HFSR_BITS)
    ];

    appendAddressValidityFindings(snapshot, findings);

    if (findings.length === 0) {
        findings.push({
            severity: 'info',
            code: 'fault-no-active-status-bits',
            register: 'CFSR',
            title: 'No active fault status bits',
            message: 'No Cortex-M CFSR or HFSR fault status bits were set in the provided snapshot.'
        });
    }

    return {
        architecture: 'cortex-m',
        summary: createSummary(findings),
        findings,
        requiresManualReview: findings.some((finding) => finding.severity !== 'info')
    };
}

function decodeRegister(value: number | undefined, definitions: readonly FaultBitDefinition[]): readonly FaultFinding[] {
    if (value === undefined) {
        return [];
    }

    return definitions
        .filter((definition) => hasBit(value, definition.bit))
        .map((definition) => ({
            severity: 'fault',
            code: definition.code,
            register: definition.register,
            bit: definition.bit,
            title: definition.title,
            message: definition.message
        }));
}

function appendAddressValidityFindings(snapshot: CortexMFaultSnapshot, findings: FaultFinding[]): void {
    if (hasBit(snapshot.cfsr, 7)) {
        findings.push({
            severity: snapshot.mmfar === undefined ? 'warning' : 'info',
            code: 'memmanage-mmfar-valid',
            register: 'MMFSR',
            bit: 7,
            title: 'MemManage fault address valid',
            message: snapshot.mmfar === undefined
                ? 'MMARVALID is set, but no MMFAR value was provided.'
                : `MMFAR contains ${formatHex(snapshot.mmfar)}.`
        });
    }

    if (hasBit(snapshot.cfsr, 15)) {
        findings.push({
            severity: snapshot.bfar === undefined ? 'warning' : 'info',
            code: 'busfault-bfar-valid',
            register: 'BFSR',
            bit: 15,
            title: 'BusFault address valid',
            message: snapshot.bfar === undefined
                ? 'BFARVALID is set, but no BFAR value was provided.'
                : `BFAR contains ${formatHex(snapshot.bfar)}.`
        });
    }
}

function hasBit(value: number | undefined, bit: number): boolean {
    if (value === undefined) {
        return false;
    }

    return ((toUnsigned32(value) >>> bit) & 1) === 1;
}

function createSummary(findings: readonly FaultFinding[]): string {
    const faultCount = findings.filter((finding) => finding.severity === 'fault').length;
    const warningCount = findings.filter((finding) => finding.severity === 'warning').length;

    if (faultCount === 0 && warningCount === 0) {
        return 'No active Cortex-M fault status bits were detected.';
    }

    return `Detected ${faultCount} fault finding(s) and ${warningCount} warning finding(s).`;
}

function formatHex(value: number): string {
    return `0x${toUnsigned32(value).toString(16).toUpperCase().padStart(8, '0')}`;
}

function toUnsigned32(value: number): number {
    return value >>> 0;
}
