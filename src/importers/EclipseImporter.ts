
import * as vscode from 'vscode';
import * as yaml from 'yaml';

import { File } from '../../lib/node-utility/File';
import { AbstractProject, SourceFileOptions, EIDE_FILE_OPTION_VERSION } from '../EIDEProject';
import {
    ImportOptions,
    ProjectTargetInfo,
    MAPPED_KEYS_IN_TARGET_INFO,
    ProjectType
} from '../EIDETypeDefine';
import {
    ArmBaseCompileData,
    RiscvCompileData,
    AnyGccCompileData
} from "../EIDEProjectModules";
import * as eclipseParser from '../EclipseProjectParser';
import { ToolchainManager } from '../ToolchainManager';
import { WorkspaceManager } from '../WorkspaceManager';
import { getGlobalState } from '../Platform';
import { copyObject } from '../utility';
import { ArrayDelRepetition } from '../../lib/node-utility/Utility';
import { view_str$operation$import_done, continue_text, cancel_text, view_str$prompt$filesOptionsComment } from '../StringTable';
import * as ArmCpuUtils from '../ArmCpuUtils';

export class EclipseImporter {

    public static async importProject(option: ImportOptions): Promise<void> {

        const ePrjInfo = await eclipseParser.parseEclipseProject(option.projectFile.path);
        const ePrjRoot = new File(option.projectFile.dir);

        let nPrjType: ProjectType = 'ANY-GCC';

        switch (ePrjInfo.type) {
            case 'arm':
                nPrjType = 'ARM';
                break;
            case 'riscv':
                nPrjType = 'RISC-V';
                break;
            case 'sdcc':
                nPrjType = 'C51';
            default:
                break;
        }

        const basePrj = AbstractProject.NewProject(getGlobalState()).createBase({
            name: ePrjInfo.name,
            projectName: ePrjInfo.name,
            type: nPrjType,
            outDir: ePrjRoot
        }, false);

        const nPrjConfig = basePrj.prjConfig.config;

        nPrjConfig.virtualFolder = ePrjInfo.virtualSource;
        nPrjConfig.outDir = 'build';

        if (ePrjInfo.sourceEntries.length > 0) {
            nPrjConfig.srcDirs = ePrjInfo.sourceEntries;
        } else {
            nPrjConfig.srcDirs = File.NotMatchFilter(ePrjRoot.GetList(File.EXCLUDE_ALL_FILTER), File.EXCLUDE_ALL_FILTER,
                [/^\./, /^(build|dist|out|bin|obj|exe|debug|release|log[s]?|ipch|docs|doc|img|image[s]?)$/i])
                .map(d => ePrjRoot.ToRelativePath(d.path) || d.path);
        }

        // init source args
        const srcOptsObj = <SourceFileOptions>{ version: EIDE_FILE_OPTION_VERSION, options: {} };
        srcOptsObj.version = EIDE_FILE_OPTION_VERSION;

        // init all target
        for (const eTarget of ePrjInfo.targets) {

            const nEideTarget: ProjectTargetInfo = {
                excludeList: eTarget.excList,
                toolchain: nPrjConfig.toolchain,
                toolchainConfig: copyObject(nPrjConfig.toolchainConfig),
                toolchainConfigMap: copyObject(nPrjConfig.toolchainConfigMap),
                uploader: nPrjConfig.uploader,
                uploadConfig: copyObject(nPrjConfig.uploadConfig),
                uploadConfigMap: copyObject(nPrjConfig.uploadConfigMap),
                builderOptions: {},
                cppPreprocessAttrs: {
                    name: 'default',
                    incList: [],
                    defineList: [],
                    libList: []
                }
            };

            nEideTarget.cppPreprocessAttrs.defineList = eTarget.builldArgs.cMacros;
            nEideTarget.cppPreprocessAttrs.incList = eTarget.builldArgs.cIncDirs;
            nEideTarget.cppPreprocessAttrs.libList = eTarget.builldArgs.linkerLibSearchDirs;

            // for arm gcc toolchain
            if (nEideTarget.toolchain == 'GCC') {

                const guessArmCpuType = (archName?: string): string | undefined => {
                    if (!archName)
                        return undefined;
                    // @note: this list is trimed, not full
                    const armCpuTypeMap: any = {
                        'cortex-m0plus': 'Cortex-M0+',
                        'cortex-m0+': 'Cortex-M0+',
                        'cortex-m23': 'Cortex-M23',
                        'cortex-m33': 'Cortex-M33',
                        'cortex-m35p': 'Cortex-M35P',
                        'cortex-m55': 'Cortex-M55',
                        'cortex-m85': 'Cortex-M85',
                        'cortex-m0': 'Cortex-M0',
                        'cortex-m3': 'Cortex-M3',
                        'cortex-m4': 'Cortex-M4',
                        'cortex-m7': 'Cortex-M7'
                    };
                    return armCpuTypeMap[archName.toLowerCase()];
                };

                const compilerOpt = <ArmBaseCompileData>nEideTarget.toolchainConfig;
                compilerOpt.cpuType = guessArmCpuType(eTarget.archName) || 'Cortex-M3';
                compilerOpt.floatingPointHardware = ArmCpuUtils.hasFpu(compilerOpt.cpuType) ? 'single' : 'none';
                compilerOpt.useCustomScatterFile = true;
                compilerOpt.scatterFilePath = eTarget.linkerScriptPath || '';
            }
            // for riscv gcc toolchain
            else if (nEideTarget.toolchain == 'RISCV_GCC') {
                const compilerOpt = <RiscvCompileData>nEideTarget.toolchainConfig;
                compilerOpt.linkerScriptPath = eTarget.linkerScriptPath || '';
            }
            // for any gcc toolchain
            else if (nEideTarget.toolchain == 'ANY_GCC') {
                const compilerOpt = <AnyGccCompileData>nEideTarget.toolchainConfig;
                compilerOpt.linkerScriptPath = eTarget.linkerScriptPath || '';
            }

            // init compiler args for target
            {
                const toolchain = ToolchainManager.getInstance().getToolchain(nPrjConfig.type, nPrjConfig.toolchain);
                const toolchainDefConf = toolchain.getDefaultConfig();

                // glob
                toolchainDefConf.global['misc-control'] = eTarget.builldArgs.globalArgs.filter(a => a.trim() != '');

                // asm
                {
                    let flags: string[] = [];
                    const asmCfg = toolchainDefConf["asm-compiler"];

                    if (asmCfg['ASM_FLAGS']) flags.push(asmCfg['ASM_FLAGS']);
                    eTarget.builldArgs.sMacros.forEach(m => flags.push(`-D${m}`));
                    eTarget.builldArgs.assemblerArgs.forEach(arg => flags.push(arg));

                    flags = flags.filter(p => p.trim() != '');
                    if (asmCfg['ASM_FLAGS'] != undefined) {
                        asmCfg['ASM_FLAGS'] = flags.join(' ');
                    } else {
                        asmCfg['misc-control'] = flags.join(' ');
                    }
                }

                // c
                {
                    let flags: string[] = [];
                    let cxxFlags: string[] = [];
                    const ccCfg = toolchainDefConf["c/cpp-compiler"];

                    if (eTarget.builldArgs.optimization)
                        ccCfg['optimization'] = eTarget.builldArgs.optimization;
                    if (eTarget.builldArgs.cLanguageStd)
                        ccCfg['language-c'] = eTarget.builldArgs.cLanguageStd;
                    if (eTarget.builldArgs.cppLanguageStd)
                        ccCfg['language-cpp'] = eTarget.builldArgs.cppLanguageStd;
                    if (eTarget.builldArgs.signedChar)
                        ccCfg['signed-char'] = true;

                    if (ccCfg['C_FLAGS'])
                        flags.push(ccCfg['C_FLAGS']);
                    if (ccCfg['CXX_FLAGS'])
                        cxxFlags.push(ccCfg['CXX_FLAGS']);

                    eTarget.builldArgs.cCompilerArgs.forEach(arg => {
                        flags.push(arg);
                        //TODO not support C++ options now
                        //cxxFlags.push(arg);
                    });

                    flags = flags.filter(p => p.trim() != '');
                    cxxFlags = cxxFlags.filter(p => p.trim() != '');
                    if (ccCfg['C_FLAGS'] != undefined) {
                        ccCfg['C_FLAGS'] = flags.join(' ');
                        ccCfg['CXX_FLAGS'] = cxxFlags.join(' ');
                    } else {
                        ccCfg['misc-control'] = flags.join(' ');
                    }
                }

                // linker
                {
                    if (!toolchainDefConf.linker) toolchainDefConf.linker = {};
                    const ldCfg = toolchainDefConf.linker;

                    const flags: string[] = eTarget.builldArgs.linkerArgs.filter(a => a.trim() != '');
                    if (ldCfg['LD_FLAGS'] != undefined) {
                        ldCfg['LD_FLAGS'] = flags.join(' ');
                        const libFlags = eTarget.builldArgs.linkerLibArgs.filter(a => a.trim() != '');
                        if (ldCfg['LIB_FLAGS'] != undefined) {
                            ldCfg['LIB_FLAGS'] = libFlags.join(' ');
                        }
                    } else {
                        ldCfg['misc-control'] = flags.join(' ');
                    }

                    // setup link order
                    if (eTarget.objsOrder.length) {
                        const linkOrder: { pattern: string, order: number }[] = [];
                        eTarget.objsOrder.forEach((e, idx) => {
                            linkOrder.push({
                                pattern: e,
                                order: idx
                            });
                        });
                        ldCfg['object-order'] = linkOrder;
                    }
                }

                nEideTarget.builderOptions[toolchain.name] = toolchainDefConf;
            }

            // setup source options
            if (eTarget.sourceArgs) {
                srcOptsObj.options[eTarget.name] = { files: {} };
                const srcOptions: any = srcOptsObj.options[eTarget.name].files;
                const srcFilters = AbstractProject.getSourceFileFilter();
                for (const fpath in eTarget.sourceArgs) {
                    const flags: string[] = [];
                    const sourceArgs = eTarget.sourceArgs[fpath];
                    if (AbstractProject.asmfileFilter.test(fpath)) {
                        sourceArgs.sIncDirs.forEach(arg => flags.push(`-I${arg}`));
                        sourceArgs.sMacros.forEach(arg => flags.push(`-D${arg}`));
                        sourceArgs.assemblerArgs.forEach(arg => flags.push(arg));
                    } else {
                        sourceArgs.cIncDirs.forEach(arg => flags.push(`-I${arg}`));
                        sourceArgs.cMacros.forEach(arg => flags.push(`-D${arg}`));
                        sourceArgs.cCompilerArgs.forEach(arg => flags.push(arg));
                    }
                    if (flags.length > 0) {
                        if (srcFilters.some(r => r.test(fpath)))
                            srcOptions[fpath] = ArrayDelRepetition(flags).join(' ');
                        else
                            srcOptions[fpath + '/*'] = ArrayDelRepetition(flags).join(' ');
                    }
                }
            }

            nPrjConfig.targets[eTarget.name] = nEideTarget;
        }

        // init current target
        const curTarget: any = nPrjConfig.targets[ePrjInfo.targets[0].name];
        nPrjConfig.mode = ePrjInfo.targets[0].name; // set current target name
        for (const name in curTarget) {
            if (name === 'cppPreprocessAttrs') {
                nPrjConfig.dependenceList = [{
                    groupName: 'custom', depList: [curTarget[name]]
                }];
                continue;
            }
            if (!MAPPED_KEYS_IN_TARGET_INFO.includes(name))
                continue;
            (<any>nPrjConfig)[name] = curTarget[name];
        }

        // save all config
        basePrj.prjConfig.Save();
        // save src options
        const optFile = File.fromArray([basePrj.rootFolder.path, AbstractProject.EIDE_DIR, `files.options.yml`]);
        optFile.Write(view_str$prompt$filesOptionsComment + yaml.stringify(srcOptsObj, { indent: 4, lineWidth: 1000 }));

        // switch project
        const selection = await vscode.window.showInformationMessage(
            view_str$operation$import_done, continue_text, cancel_text);
        if (selection === continue_text) {
            WorkspaceManager.getInstance().openWorkspace(basePrj.workspaceFile);
        }
    }
}
