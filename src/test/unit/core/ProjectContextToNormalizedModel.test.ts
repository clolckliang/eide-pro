import { strict as assert } from 'assert';
import { describe, it } from 'mocha';
import { EideProjectContext } from '../../../core/project/EideProjectContext';
import {
    inferNormalizedLanguage,
    normalizeToolchainFamily,
    projectContextToNormalizedModel
} from '../../../core/project/ProjectContextToNormalizedModel';

describe('ProjectContextToNormalizedModel', () => {
    it('maps a complete project context into one normalized target', () => {
        const model = projectContextToNormalizedModel(createContext());

        assert.equal(model.name, 'Demo');
        assert.equal(model.root, '/demo');
        assert.equal(model.toolchainFamily, 'gcc');
        assert.equal(model.targets.length, 1);

        const target = model.targets[0];

        assert.equal(target.name, 'Debug');
        assert.deepEqual(target.includePaths, ['inc', 'drivers/inc']);
        assert.deepEqual(target.defines, ['USE_HAL_DRIVER', 'STM32F103xB']);
        assert.deepEqual(target.libraries, ['m']);
        assert.equal(target.linkerScript, 'linker.ld');
        assert.equal(target.startupFile, 'startup.s');
        assert.deepEqual(target.cFlags, []);
        assert.deepEqual(target.cppFlags, []);
        assert.deepEqual(target.asmFlags, []);
        assert.deepEqual(target.linkerFlags, []);
        assert.deepEqual(target.sourceFiles, [
            { path: 'src/main.c', language: 'c' },
            { path: 'src/app.cpp', language: 'cpp' },
            { path: 'startup.s', language: 'asm' }
        ]);
        assert.deepEqual(model.diagnostics, []);
    });

    it('uses default target name when active target is missing', () => {
        const model = projectContextToNormalizedModel(createContext({ activeTarget: undefined }));

        assert.equal(model.targets[0].name, 'default');
    });

    it('infers source languages from file extensions', () => {
        assert.equal(inferNormalizedLanguage('main.c'), 'c');
        assert.equal(inferNormalizedLanguage('module.cc'), 'cpp');
        assert.equal(inferNormalizedLanguage('module.cpp'), 'cpp');
        assert.equal(inferNormalizedLanguage('module.cxx'), 'cpp');
        assert.equal(inferNormalizedLanguage('module.c++'), 'cpp');
        assert.equal(inferNormalizedLanguage('startup.s'), 'asm');
        assert.equal(inferNormalizedLanguage('startup.S'), 'asm');
        assert.equal(inferNormalizedLanguage('legacy.asm'), 'asm');
        assert.equal(inferNormalizedLanguage('startup.a51'), 'asm');
        assert.equal(inferNormalizedLanguage('memory.ld'), 'linker');
        assert.equal(inferNormalizedLanguage('scatter.sct'), 'linker');
        assert.equal(inferNormalizedLanguage('iar.icf'), 'linker');
        assert.equal(inferNormalizedLanguage('cosmic.lkf'), 'linker');
        assert.equal(inferNormalizedLanguage('README.md'), 'unknown');
    });

    it('normalizes supported toolchain families', () => {
        assert.equal(normalizeToolchainFamily('GNU Arm Embedded GCC'), 'gcc');
        assert.equal(normalizeToolchainFamily('Keil ARMCC5'), 'armcc');
        assert.equal(normalizeToolchainFamily('ARMCLANG AC6'), 'armclang');
        assert.equal(normalizeToolchainFamily('IAR_ARM'), 'iar');
        assert.equal(normalizeToolchainFamily('SDCC'), 'sdcc');
        assert.equal(normalizeToolchainFamily('COSMIC STM8'), 'cosmic');
        assert.equal(normalizeToolchainFamily('LLVM clang'), 'llvm');
        assert.equal(normalizeToolchainFamily('RISC-V GNU'), 'gcc');
        assert.equal(normalizeToolchainFamily('MIPS MTI GCC'), 'gcc');
        assert.equal(normalizeToolchainFamily(''), 'unknown');
        assert.equal(normalizeToolchainFamily(undefined), 'unknown');
        assert.equal(normalizeToolchainFamily('custom-toolchain'), 'unknown');
    });

    it('adds a warning diagnostic when source files are missing', () => {
        const model = projectContextToNormalizedModel(createContext({ sourceFiles: [] }));

        assert.deepEqual(model.diagnostics, [
            {
                level: 'warning',
                code: 'no-source-files',
                message: 'Project context does not contain source files.'
            }
        ]);
    });

    it('adds a manual review diagnostic when toolchain is missing', () => {
        const model = projectContextToNormalizedModel(createContext({ toolchain: undefined }));

        assert.deepEqual(model.diagnostics, [
            {
                level: 'manual-review',
                code: 'unknown-toolchain',
                message: 'Project context does not contain a recognized toolchain family.'
            }
        ]);
    });

    it('adds both diagnostics when sources and toolchain are missing', () => {
        const model = projectContextToNormalizedModel(createContext({
            sourceFiles: [],
            toolchain: undefined
        }));

        assert.deepEqual(model.diagnostics.map((diagnostic) => diagnostic.code), [
            'no-source-files',
            'unknown-toolchain'
        ]);
    });
});

function createContext(overrides: Partial<EideProjectContext> = {}): EideProjectContext {
    return {
        projectName: 'Demo',
        projectRoot: '/demo',
        workspaceFile: '/demo/demo.code-workspace',
        projectType: 'ARM',
        activeTarget: 'Debug',
        sourceFiles: ['src/main.c', 'src/app.cpp', 'startup.s'],
        includePaths: ['inc', 'drivers/inc'],
        defines: ['USE_HAL_DRIVER', 'STM32F103xB'],
        libraries: ['m'],
        linkerScript: 'linker.ld',
        startupFile: 'startup.s',
        toolchain: {
            name: 'GNU Arm Embedded GCC'
        },
        ...overrides
    };
}
