import { EideProjectContext } from '../../core/project/EideProjectContext';
import { createEideProjectContextFromLegacyProject, LegacyProjectLike } from '../../legacy/LegacyProjectContextAdapter';

export type LegacyProjectGetter = () => LegacyProjectLike | undefined;

export interface ActiveProjectContextProviderOptions {
    readonly getLegacyProject: LegacyProjectGetter;
}

export class ActiveProjectContextProvider {
    private readonly getLegacyProject: LegacyProjectGetter;

    constructor(options: ActiveProjectContextProviderOptions) {
        this.getLegacyProject = options.getLegacyProject;
    }

    getActiveContext(): EideProjectContext | undefined {
        const legacyProject = this.getLegacyProject();

        if (legacyProject === undefined) {
            return undefined;
        }

        return createEideProjectContextFromLegacyProject(legacyProject);
    }
}
