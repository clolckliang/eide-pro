
import * as vscode from 'vscode';
import * as NodePath from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { isArray } from 'util';

import { File } from '../../lib/node-utility/File';
import { AbstractProject } from '../EIDEProject';
import {
    ImportOptions,
    ProjectTargetInfo,
    MAPPED_KEYS_IN_TARGET_INFO
} from '../EIDETypeDefine';
import {
    ArmBaseCompileData,
    ArmBaseCompileConfigModel
} from "../EIDEProjectModules";
import * as iarParser from '../IarProjectParser';
import { ToolchainName, ToolchainManager } from '../ToolchainManager';
import { SettingManager } from '../SettingManager';
import { WorkspaceManager } from '../WorkspaceManager';
import { getGlobalState } from '../Platform';
import { copyObject, toArray } from '../utility';
import { view_str$operation$import_done, continue_text, cancel_text } from '../StringTable';
import * as ArmCpuUtils from '../ArmCpuUtils';

export class IarImporter {

    public static async importProject(option: ImportOptions): Promise<void> {

        if (!ToolchainManager.getInstance().isToolchainPathReady('IAR_ARM')) {
            const msg = `Your 'IAR_ARM' toolchain path is invalid, we suggest that you set it before start to import !`;
            const ans = await vscode.window.showWarningMessage(msg, `Ok`, 'Skip');
            if (ans != 'Skip') {
                if (ans == 'Ok') { // jump to setup toolchain
                    vscode.commands.executeCommand('eide.operation.install_toolchain');
                }
                return;
            }
        }

        const ewwInfo = await iarParser.parseIarWorkbench(
            new File(option.projectFile.path), SettingManager.GetInstance().getIarForArmDir());
        const ewwRoot = new File(option.projectFile.dir);

        let projectnum = 0;
        for (const _ in ewwInfo.projects) projectnum++;

        if (projectnum == 0)
            throw new Error(`Not found any project in this IAR workbench ! [path]: ${option.projectFile.path}`);

        const vscWorkspace = {
            "folders": <any[]>[]
        };

        const vscWorkspaceFile = File.fromArray([ewwRoot.path, `${ewwInfo.name}.code-workspace`]);

        const toolchainType: ToolchainName = 'IAR_ARM';

        //
        let project0workspacefile: File = <any>undefined;
        for (const path_ in ewwInfo.projects) {

            const iarproj = ewwInfo.projects[path_];
            const iarPrjRoot = new File(NodePath.dirname(path_));

            const needCreateNewDir = File.normalize(iarPrjRoot.path) == File.normalize(ewwRoot.path);
            const basePrj = AbstractProject.NewProject(getGlobalState()).createBase({
                name: iarproj.name,
                projectName: iarproj.name,
                type: 'ARM',
                outDir: iarPrjRoot
            }, needCreateNewDir);

            const prjRoot = basePrj.rootFolder;

            vscWorkspace.folders.push({
                name: iarproj.name,
                path: ewwRoot.ToRelativePath(prjRoot.path) || prjRoot.path
            });

            if (!project0workspacefile)
                project0workspacefile = basePrj.workspaceFile;

            const eidePrjCfg = basePrj.prjConfig.config;
            const eideFolder = File.fromArray([prjRoot.path, AbstractProject.EIDE_DIR]);

            // export project env
            {
                const envFile = File.fromArray([eideFolder.path, 'env.ini']);
                const envCont = [
                    `###########################################################`,
                    `#              project environment variables`,
                    `###########################################################`,
                    ``,
                ];

                iarproj.envs['PROJ_DIR'] = needCreateNewDir ? '..' : '.';

                for (const key in iarproj.envs) {
                    envCont.push(`${key} = ${iarproj.envs[key]}`);
                }

                envFile.Write(envCont.join(os.EOL));
            }

            // file groups
            eidePrjCfg.virtualFolder = iarproj.fileGroups;
            eidePrjCfg.outDir = 'build';
            basePrj.prjConfig.setToolchain(toolchainType);

            // targets
            let firstTargetName: string = '';
            for (const tname in iarproj.targets) {

                if (!firstTargetName)
                    firstTargetName = tname;

                const targetName = tname;
                const iarTarget = iarproj.targets[tname];

                const nEideTarget: ProjectTargetInfo = {
                    excludeList: iarTarget.excludeList,
                    toolchain: eidePrjCfg.toolchain,
                    toolchainConfig: copyObject(eidePrjCfg.toolchainConfig),
                    toolchainConfigMap: copyObject(eidePrjCfg.toolchainConfigMap),
                    uploader: eidePrjCfg.uploader,
                    uploadConfig: copyObject(eidePrjCfg.uploadConfig),
                    uploadConfigMap: copyObject(eidePrjCfg.uploadConfigMap),
                    cppPreprocessAttrs: {
                        name: 'default',
                        incList: [],
                        defineList: [],
                        libList: []
                    },
                    builderOptions: {},
                };
                eidePrjCfg.targets[targetName] = nEideTarget;

                nEideTarget.cppPreprocessAttrs.defineList = toArray(iarTarget.settings['ICCARM.CCDefines']);
                nEideTarget.cppPreprocessAttrs.incList = toArray(iarTarget.settings['ICCARM.CCIncludePath2']);

                //
                // compiler base config
                //
                const compilerMod = <ArmBaseCompileConfigModel>basePrj.prjConfig.toolchainConfigModel;
                const compilerOpt = <ArmBaseCompileData>nEideTarget.toolchainConfig;

                if (iarTarget.core) {
                    const expname = iarTarget.core;
                    const cpus = compilerMod.getValidCpus();
                    const idx = cpus.findIndex(n => expname == n || expname.toLowerCase().startsWith(n.toLowerCase()));
                    if (idx != -1) {
                        compilerOpt.cpuType = cpus[idx];
                    }
                }

                if (ArmCpuUtils.hasFpu(compilerOpt.cpuType)) {
                    if (iarTarget.settings['General.FPU2'] != '0') {
                        compilerOpt.floatingPointHardware =
                            ArmCpuUtils.hasFpu(compilerOpt.cpuType, true) ? 'double' : 'single';
                    }
                }

                compilerOpt.scatterFilePath = iarTarget.icfPath;

                //
                // builder options
                //
                const toolchain = ToolchainManager.getInstance().getToolchain(eidePrjCfg.type, eidePrjCfg.toolchain);
                const builderConfig = toolchain.getDefaultConfig();

                const iar2eideOptsMap = iarParser.IAR2EIDE_OPTS_MAP;

                // set iar compiler options
                for (const cfgGroupName in iar2eideOptsMap) {

                    const optsGrp = iar2eideOptsMap[cfgGroupName];

                    for (const iarsname in iar2eideOptsMap[cfgGroupName]) {

                        if (typeof iarTarget.settings[iarsname] != 'string')
                            continue;

                        const iarOptVal = <string>iarTarget.settings[iarsname];

                        for (const fieldname in optsGrp[iarsname]) {
                            const eideOptVal = optsGrp[iarsname][fieldname][iarOptVal];
                            if (eideOptVal) {
                                (<any>builderConfig)[cfgGroupName][fieldname] = eideOptVal;
                            }
                        }
                    }
                }

                // copy string options

                const optToString = (obj: string | string[]): string => {
                    if (isArray(obj)) {
                        return obj[0];
                    } else {
                        return obj;
                    }
                };

                // linker
                {
                    builderConfig.linker['LIB_FLAGS'] = toArray(iarTarget.settings['ILINK.IlinkAdditionalLibs']);

                    if (iarTarget.settings['ILINK.IlinkOverrideProgramEntryLabel'] == '1') {
                        builderConfig.linker['program-entry'] = optToString(iarTarget.settings['ILINK.IlinkProgramEntryLabel']);
                    }

                    builderConfig.linker['config-defines'] = toArray(iarTarget.settings['ILINK.IlinkConfigDefines']);

                    const extraOpts: string[] = [];

                    toArray(iarTarget.settings['ILINK.IlinkKeepSymbols'])
                        .forEach(s => extraOpts.push(`--keep ${s}`));

                    toArray(iarTarget.settings['ILINK.IlinkDefines'])
                        .forEach(s => extraOpts.push(`--define_symbol ${s}`));

                    if (iarTarget.settings['ILINK.IlinkUseExtraOptions'] == '1') {
                        toArray(iarTarget.settings['ILINK.IlinkExtraOptions'])
                            .forEach(opt => extraOpts.push(opt));
                    }

                    builderConfig.linker['misc-controls'] = extraOpts.join(' ');
                }

                // asm
                {
                    builderConfig["asm-compiler"]['defines'] = toArray(iarTarget.settings['AARM.ADefines']);

                    if (iarTarget.settings['AARM.AExtraOptionsCheckV2'] == '1') {
                        builderConfig["asm-compiler"]['misc-controls'] =
                            toArray(iarTarget.settings['AARM.AExtraOptionsV2']);
                    }
                }

                // cpp
                {
                    const extraOpts: string[] = [];

                    toArray(iarTarget.settings['ICCARM.PreInclude'])
                        .forEach(s => extraOpts.push(`--preinclude ${s}`));

                    if (iarTarget.settings['ICCARM.IExtraOptionsCheck'] == '1') {
                        toArray(iarTarget.settings['ICCARM.IExtraOptions'])
                            .forEach(s => extraOpts.push(s));
                    }

                    builderConfig["c/cpp-compiler"]['misc-controls'] = extraOpts.join(' ');
                }

                // builder tasks
                {
                    if (iarTarget.builderActions.prebuild) {
                        builderConfig.beforeBuildTasks?.push({
                            name: 'iar prebuild',
                            command: iarTarget.builderActions.prebuild,
                            stopBuildAfterFailed: true,
                        });
                    }

                    if (iarTarget.builderActions.postbuild) {
                        builderConfig.afterBuildTasks?.push({
                            name: 'iar postbuild',
                            command: iarTarget.builderActions.postbuild
                        });
                    }
                }

                nEideTarget.builderOptions[toolchainType] = builderConfig;
            }

            // init current target

            const tname = firstTargetName;
            const curTarget: any = eidePrjCfg.targets[tname];
            eidePrjCfg.mode = tname; // set current target name
            for (const key in curTarget) {
                if (key === 'cppPreprocessAttrs') {
                    eidePrjCfg.dependenceList =
                        [{ groupName: 'custom', depList: [curTarget[key]] }];
                    continue;
                }
                if (!MAPPED_KEYS_IN_TARGET_INFO.includes(key))
                    continue;
                (<any>eidePrjCfg)[key] = curTarget[key];
            }

            // save all config

            basePrj.prjConfig.Save();
        }

        // store vscode workspace
        fs.writeFileSync(vscWorkspaceFile.path, JSON.stringify(vscWorkspace, undefined, 4));

        // switch project
        const selection = await vscode.window.showInformationMessage(
            view_str$operation$import_done, continue_text, cancel_text);
        if (selection === continue_text) {
            WorkspaceManager.getInstance().openWorkspace(vscWorkspace.folders.length > 1
                ? vscWorkspaceFile
                : project0workspacefile);
        }
    }
}
