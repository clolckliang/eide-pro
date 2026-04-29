import { strict as assert } from 'assert';
import { describe, it } from 'mocha';
import { NormalizedProjectModel } from '../../../core/project/NormalizedProjectModel';

const { ExportManager } = require('../../../core/export/ExportManager') as typeof import('../../../core/export/ExportManager');
const {
    CMakeExporter,
    createCMakeLists
} = require('../../../exporters/cmake/CMakeExporter') as typeof import('../../../exporters/cmake/CMakeExporter');

describe('CMakeExporter', () => {
    it('generates an in-memory CMakeLists artifact for a normalized target', async () => {
        const exporter = new CMakeExporter();

        const result = await exporter.exportProject(createModel(), '/out');

        assert.equal(result.exporterId, 'cmake');
        assert.equal(result.status, 'success');
        assert.equal(result.outputRoot, '/out');
        assert.deepEqual(result.generatedFiles, ['CMakeLists.txt']);
        assert.equal(result.artifacts?.length, 1);
        assert.equal(result.artifacts?.[0].path, 'CMakeLists.txt');
        assertIncludes(result.artifacts?.[0].content ?? '', /project\(Demo_Project LANGUAGES C CXX ASM\)/);
        assertIncludes(result.artifacts?.[0].content ?? '', /add_executable\(Demo_Project/);
        assertIncludes(result.artifacts?.[0].content ?? '', /"src\/main.c"/);
        assertIncludes(result.artifacts?.[0].content ?? '', /"src\/app.cpp"/);
        assertIncludes(result.artifacts?.[0].content ?? '', /target_include_directories\(Demo_Project/);
        assertIncludes(result.artifacts?.[0].content ?? '', /"include"/);
        assertIncludes(result.artifacts?.[0].content ?? '', /target_compile_definitions\(Demo_Project/);
        assertIncludes(result.artifacts?.[0].content ?? '', /"USE_HAL"/);
        assertIncludes(result.artifacts?.[0].content ?? '', /"-Tlinker\/stm32.ld"/);
    });

    it('can be registered through ExportManager', async () => {
        const manager = new ExportManager();

        manager.register(new CMakeExporter());

        const result = await manager.exportProject('cmake', createModel(), '/out');

        assert.equal(result.exporterId, 'cmake');
        assert.deepEqual(result.generatedFiles, ['CMakeLists.txt']);
    });

    it('reports manual review when toolchain-specific CMake details are not generated', async () => {
        const exporter = new CMakeExporter();
        const model = {
            ...createModel(),
            toolchainFamily: 'iar' as const
        };

        const result = await exporter.exportProject(model, '/out');

        assert.equal(result.status, 'partial');
        assert.equal(result.diagnostics.length, 1);
        assert.equal(result.diagnostics[0].code, 'cmake-toolchain-review');
        assert.equal(result.diagnostics[0].level, 'manual-review');
    });

    it('reports a failed result when no normalized target exists', async () => {
        const exporter = new CMakeExporter();
        const model = {
            ...createModel(),
            targets: []
        };

        const result = await exporter.exportProject(model, '/out');

        assert.equal(result.status, 'failed');
        assert.equal(result.diagnostics[0].code, 'cmake-no-targets');
        assertIncludes(result.artifacts?.[0].content ?? '', /No target data was available/);
    });

    it('creates stable CMake text without writing files', () => {
        const content = createCMakeLists(createModel());
        const executableBlock = extractCommandBlock(content, 'add_executable');

        assertIncludes(content, /cmake_minimum_required\(VERSION 3.20\)/);
        assert.equal(executableBlock.includes('linker/stm32.ld'), false);
        assert.equal(content.endsWith('\n'), true);
    });

    it('omits empty scoped CMake commands', () => {
        const model = createModel();
        const minimalModel: NormalizedProjectModel = {
            ...model,
            targets: [
                {
                    ...model.targets[0],
                    includePaths: [],
                    defines: [],
                    libraries: [],
                    cFlags: [],
                    cppFlags: [],
                    asmFlags: [],
                    linkerFlags: [],
                    linkerScript: undefined
                }
            ]
        };

        const content = createCMakeLists(minimalModel);

        assert.equal(content.includes('target_include_directories'), false);
        assert.equal(content.includes('target_compile_definitions'), false);
        assert.equal(content.includes('target_compile_options'), false);
        assert.equal(content.includes('target_link_options'), false);
        assert.equal(content.includes('target_link_libraries'), false);
    });
});

function assertIncludes(value: string, pattern: RegExp): void {
    assert.equal(pattern.test(value), true);
}

function extractCommandBlock(content: string, command: string): string {
    const start = content.indexOf(`${command}(`);
    assert.notEqual(start, -1);

    const end = content.indexOf('\n)\n', start);
    assert.notEqual(end, -1);

    return content.slice(start, end);
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
                libraries: ['m', 'c'],
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
