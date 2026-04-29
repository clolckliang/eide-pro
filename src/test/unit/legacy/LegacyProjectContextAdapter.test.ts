import { strict as assert } from 'assert';
import { describe, it } from 'mocha';
import { LegacyProjectLike } from '../../../legacy/LegacyProjectContextAdapter';

const {
    createEideProjectContextFromLegacyProject,
    LegacyProjectContextAdapter
} = require('../../../legacy/LegacyProjectContextAdapter') as typeof import('../../../legacy/LegacyProjectContextAdapter');

describe('LegacyProjectContextAdapter', () => {
    it('maps readable legacy project data into EideProjectContext', () => {
        const context = new LegacyProjectContextAdapter().createContext(createLegacyProject());

        assert.equal(context.projectName, 'Legacy Demo');
        assert.equal(context.projectRoot, '/workspace/demo');
        assert.equal(context.projectType, 'ARM');
        assert.equal(context.activeTarget, 'Debug');
        assert.deepEqual(context.sourceFiles, [
            'src/main.c',
            'startup.s',
            'src/app.cpp'
        ]);
        assert.deepEqual(context.includePaths, ['inc', 'drivers/inc', 'cmsis/inc']);
        assert.deepEqual(context.defines, ['USE_HAL', 'STM32F103xB', 'CMSIS']);
        assert.deepEqual(context.libraries, ['m', 'c']);
        assert.equal(context.linkerScript, 'stm32.sct');
        assert.equal(context.startupFile, 'startup.s');
        assert.deepEqual(context.toolchain, {
            name: 'AC6',
            family: 'armclang',
            installDirectory: '/tools/armclang'
        });
        assert.deepEqual(context.outputFiles, {
            executable: '/workspace/demo/build/Debug/demo.axf'
        });
        assert.deepEqual(context.flashConfig, {
            programmer: 'JLink',
            targetName: 'STM32F103C8'
        });
    });

    it('falls back to config values when public methods are missing', () => {
        const context = createEideProjectContextFromLegacyProject({
            GetConfiguration: () => ({
                config: {
                    name: 'Config Name',
                    type: 'ANY-GCC',
                    mode: 'Release',
                    cppPreprocessAttrs: {
                        incList: [],
                        libList: [],
                        defineList: []
                    }
                }
            })
        });

        assert.equal(context.projectName, 'Config Name');
        assert.equal(context.projectRoot, '');
        assert.equal(context.projectType, 'ANY-GCC');
        assert.equal(context.activeTarget, 'Release');
        assert.deepEqual(context.sourceFiles, []);
        assert.deepEqual(context.includePaths, []);
    });

    it('returns best-effort empty values when legacy methods throw', () => {
        const context = new LegacyProjectContextAdapter().createContext({
            getProjectName: () => {
                throw new Error('name unavailable');
            },
            getRootDir: () => {
                throw new Error('root unavailable');
            },
            getToolchain: () => {
                throw new Error('toolchain unavailable');
            },
            getExecutablePath: () => {
                throw new Error('output unavailable');
            }
        });

        assert.equal(context.projectName, 'unknown');
        assert.equal(context.projectRoot, '');
        assert.deepEqual(context.sourceFiles, []);
        assert.deepEqual(context.includePaths, []);
        assert.equal(context.toolchain, undefined);
        assert.deepEqual(context.outputFiles, {
            executable: undefined
        });
    });
});

function createLegacyProject(): LegacyProjectLike {
    return {
        getProjectName: () => 'Legacy Demo',
        getProjectCurrentTargetName: () => 'Debug',
        getProjectType: () => 'ARM',
        getRootDir: () => ({ path: '/workspace/demo' }),
        getExecutablePath: () => '/workspace/demo/build/Debug/demo.axf',
        getUploaderType: () => 'JLink',
        getToolchain: () => ({
            name: 'AC6',
            categoryName: 'armclang',
            modelName: 'ARM Compiler 6',
            getToolchainDir: () => ({ path: '/tools/armclang' })
        }),
        GetConfiguration: () => ({
            config: {
                name: 'Legacy Demo From Config',
                type: 'ARM',
                mode: 'Debug',
                deviceName: 'STM32F103C8',
                toolchainConfig: {
                    scatterFilePath: 'stm32.sct'
                },
                cppPreprocessAttrs: {
                    incList: ['inc', 'drivers/inc'],
                    libList: ['m'],
                    defineList: ['USE_HAL', 'STM32F103xB']
                },
                dependenceList: [
                    {
                        depList: [
                            {
                                incList: ['cmsis/inc', 'inc'],
                                libList: ['c'],
                                defineList: ['CMSIS', 'USE_HAL']
                            }
                        ]
                    }
                ],
                virtualFolder: {
                    files: [
                        { path: 'src/main.c' },
                        { path: 'include/app.h' },
                        { path: 'linker.ld' }
                    ],
                    folders: [
                        {
                            files: [
                                { path: 'startup.s' },
                                { path: 'src/app.cpp' }
                            ],
                            folders: []
                        }
                    ]
                }
            }
        })
    };
}
