import { MigrationDiagnostic } from '../project/NormalizedProjectModel';

export type ImportStatus = 'success' | 'partial' | 'failed';

export interface ImportReport {
    readonly importerId: string;
    readonly status: ImportStatus;
    readonly diagnostics: readonly MigrationDiagnostic[];
}
