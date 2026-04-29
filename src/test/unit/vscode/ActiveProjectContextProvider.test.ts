import { strict as assert } from 'assert';
import { describe, it } from 'mocha';
import type { LegacyProjectLike } from '../../../legacy/LegacyProjectContextAdapter';

const { ActiveProjectContextProvider: ProviderClass } = require('../../../vscode/project/ActiveProjectContextProvider') as typeof import('../../../vscode/project/ActiveProjectContextProvider');

describe('ActiveProjectContextProvider', () => {
    it('returns undefined when no legacy project is available', () => {
        const provider = new ProviderClass({
            getLegacyProject: () => undefined
        });

        assert.equal(provider.getActiveContext(), undefined);
    });

    it('returns EideProjectContext when legacy project is available', () => {
        const mockProject: LegacyProjectLike = {
            getProjectName: () => 'TestProject',
            getProjectCurrentTargetName: () => 'Debug',
            getProjectType: () => 'ARM',
            getRootDir: () => ({ path: '/workspace/test' }),
            getToolchain: () => ({
                name: 'GNU Arm Embedded',
                categoryName: 'gcc'
            }),
            getExecutablePath: () => '/workspace/test/build/test.elf',
            getUploaderType: () => 'jlink',
            GetConfiguration: () => ({
                config: {
                    name: 'TestProject',
                    type: 'ARM',
                    mode: 'Debug'
                }
            })
        };

        const provider = new ProviderClass({
            getLegacyProject: () => mockProject
        });

        const context = provider.getActiveContext();

        assert.notEqual(context, undefined);
        assert.equal(context!.projectName, 'TestProject');
        assert.equal(context!.projectRoot, '/workspace/test');
        assert.equal(context!.activeTarget, 'Debug');
    });

    it('uses the injected getter function', () => {
        let getterCallCount = 0;
        const mockProject: LegacyProjectLike = {
            getProjectName: () => 'GetterTest',
            getRootDir: () => ({ path: '/getter-test' }),
            GetConfiguration: () => ({ config: {} })
        };

        const provider = new ProviderClass({
            getLegacyProject: () => {
                getterCallCount++;
                return mockProject;
            }
        });

        provider.getActiveContext();
        provider.getActiveContext();

        assert.equal(getterCallCount, 2);
    });
});
