import { strict as assert } from 'assert';
import { describe, it } from 'mocha';
import { NormalizedProjectModel } from '../../../core/project/NormalizedProjectModel';

const { ExportManager } = require('../../../core/export/ExportManager') as typeof import('../../../core/export/ExportManager');
const {
    MakefileExporter,
    createMakefile
} = require('../../../exporters/makefile/MakefileExporter') as typeof import('../../../exporters/makefile/MakefileExporter');

describe('MakefileExporter', () => {
    it('generates an in-memory Makefile artifact for a normalized target', async () => {
        const exporter = new MakefileExporter();

        const result = await exporter.exportProject(createModel(), '/out');

        assert.equal(result.exporterId, 'makefile');
        assert.equal(result.status, 'success');
        assert.equal(result.outputRoot, '/out');
        assert.deepEqual(result.generatedFiles, ['Makefile']);
        assert.equal(result.artifacts?.length, 1);
        assert.equal(result.artifacts?.[0].path, 'Makefile');
        assertIncludes(result.artifacts?.[0].content ?? '', /PROJECT_NAME := Demo Project/);
        assertIncludes(result.artifacts?.[0].content ?? '', /SOURCES := \\/);
        assertIncludes(result.artifacts?.[0].content ?? '', /src\/main.c/);
        assertIncludes(result.artifacts?.[0].content ?? '', /startup.s/);
        assertIncludes(result.artifacts?.[0].content ?? '', /INCLUDES := \\/);
        assertIncludes(result.artifacts?.[0].content ?? '', /-Iinclude/);
        assertIncludes(result.artifacts?.[0].content ?? '', /DEFINES := \\/);
        assertIncludes(result.artifacts?.[0].content ?? '', /-DUSE_HAL/);
        assertIncludes(result.artifacts?.[0].content ?? '', /LIBS := \\/);
        assertIncludes(result.artifacts?.[0].content ?? '', /-lm/);
        assertIncludes(result.artifacts?.[0].content ?? '', /-Tlinker\/stm32.ld/);
    });

    it('can be registered through ExportManager', async () => {
        const manager = new ExportManager();

        manager.register(new MakefileExporter());

        const result = await manager.exportProject('makefile', createModel(), '/out');

        assert.equal(result.exporterId, 'makefile');
        assert.deepEqual(result.generatedFiles, ['Makefile']);
    });

    it('reports manual review for non-gcc toolchains', async () => {
        const exporter = new MakefileExporter();
        const model = {
            ...createModel(),
            toolchainFamily: 'armclang' as const
        };

        const result = await exporter.exportProject(model, '/out');

        assert.equal(result.status, 'partial');
        assert.equal(result.diagnostics.length, 1);
        assert.equal(result.diagnostics[0].code, 'makefile-toolchain-review');
        assert.equal(result.diagnostics[0].level, 'manual-review');
    });

    it('reports a failed result when no normalized target exists', async () => {
        const exporter = new MakefileExporter();
        const model = {
            ...createModel(),
            targets: []
        };

        const result = await exporter.exportProject(model, '/out');

        assert.equal(result.status, 'failed');
        assert.equal(result.diagnostics[0].code, 'makefile-no-targets');
        assertIncludes(result.artifacts?.[0].content ?? '', /No target data was available/);
    });

    it('creates stable Makefile text without writing files', () => {
        const content = createMakefile(createModel());

        assertIncludes(content, /all: \$\(OUTPUT\)/);
        assertIncludes(content, /\.PHONY: all clean/);
        assert.equal(content.includes('linker/stm32.ld \\\n'), false);
        assert.equal(content.endsWith('\n'), true);
    });
});

function assertIncludes(value: string, pattern: RegExp): void {
    assert.equal(pattern.test(value), true);
}

function createModel(): NormalizedProjectModel {
    return {
        name: 'Demo Project',
        root: '/workspace/demo',
        toolchainFamily: 'gcc',
        targets: [
            {
                name: 'Debug',
                sourceFiles: [
                    {
                        path: 'src/main.c',
                        language: 'c'
                    },
                    {
                        path: 'src/app.cpp',
                        language: 'cpp'
                    },
                    {
                        path: 'startup.s',
                        language: 'asm'
                    },
                    {
                        path: 'linker/stm32.ld',
                        language: 'linker'
                    }
                ],
                includePaths: ['include', 'drivers/include'],
                defines: ['USE_HAL', 'STM32F103xB'],
                libraries: ['m', '-lc'],
                linkerScript: 'linker/stm32.ld',
                startupFile: 'startup.s',
                cFlags: ['-ffunction-sections'],
                cppFlags: ['-fno-exceptions'],
                asmFlags: ['-x', 'assembler-with-cpp'],
                linkerFlags: ['-Wl,--gc-sections']
            }
        ],
        diagnostics: []
    };
}
