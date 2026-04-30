/*
    MIT License

    Copyright (c) 2019 github0null

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.
*/

import * as vscode from 'vscode';
import * as yaml from 'yaml';
import * as yml from 'yaml';

import {
    CppToolsApi, Version, CustomConfigurationProvider, getCppToolsApi,
    SourceFileConfigurationItem, WorkspaceBrowseConfiguration
} from 'vscode-cpptools';

import { File } from '../../lib/node-utility/File';
import { AbstractProject } from '../EIDEProject';
import { GlobalEvent } from '../GlobalEvents';
import { SettingManager } from '../SettingManager';
import { ArrayDelRepetition } from '../../lib/node-utility/Utility';
import { getGccSystemSearchList, isGccFamilyToolchain } from '../utility';

// Interface to avoid circular dependency
interface IProjectDataProvider {
    traverseProjectsAsync(fn: (prj: AbstractProject, index: number) => Promise<boolean | undefined>): Promise<void>;
    traverseProjects(fn: (prj: AbstractProject, index: number) => boolean | undefined): void;
    getActiveProject(): AbstractProject | undefined;
    getProjectByUid(uid: string): AbstractProject | undefined;
}

export class CppConfigProvider implements CustomConfigurationProvider {

    name: string = 'eide';
    extensionId: string = 'cl.eide';

    private cppToolsApi: CppToolsApi | undefined;
    private cppToolsOut: vscode.OutputChannel;
    private isRegisteredCpptoolsProvider: boolean = false;

    // Map<sourePath, ProjectUid[]>
    private _sourceWhereFroms: Map<string, string[]> = new Map();

    private dataProvider: IProjectDataProvider;

    constructor(dataProvider: IProjectDataProvider, context: vscode.ExtensionContext) {
        this.dataProvider = dataProvider;
        this.cppToolsOut = vscode.window.createOutputChannel('eide-cpptools-log');
        context.subscriptions.push(this.cppToolsOut);
    }

    async registerCpptoolsProvider(prj: AbstractProject) {

        // notify cpptools update when project config changed
        prj.on('cppConfigChanged', () => {
            if (this.cppToolsApi) {
                if (this.cppToolsApi.notifyReady) {
                    this.cppToolsApi.notifyReady(this);
                } else {
                    this.cppToolsApi.didChangeCustomConfiguration(this);
                    this.cppToolsApi.didChangeCustomBrowseConfiguration(this);
                }
            }
        });

        // active cpptools
        {
            const cpptoolsId = "ms-vscode.cpptools";
            const extension = vscode.extensions.getExtension(cpptoolsId);
            if (extension) {
                if (!extension.isActive) {
                    try {
                        GlobalEvent.log_info(`Active extension: '${cpptoolsId}'`);
                        await extension.activate();
                    } catch (error) {
                        GlobalEvent.log_warn(error);
                    }
                }
            } else {
                GlobalEvent.log_warn(`The extension '${cpptoolsId}' is not enabled or installed !`);
            }
        }

        // get cpptools api if we have not get
        if (!this.cppToolsApi) {
            this.cppToolsApi = await getCppToolsApi(Version.v5);
            if (!this.cppToolsApi) {
                const msg = `Can't get cpptools api, please active c/c++ extension, otherwise, the c/c++ intellisence config cannot be provided !`;
                this.cppToolsOut.appendLine(`[error] ${msg}`);
                return;
            }
        }

        // register cpptools provider, skip if already registered
        if (this.cppToolsApi && !this.isRegisteredCpptoolsProvider) {

            this.cppToolsApi.registerCustomConfigurationProvider(this);
            this.cppToolsOut.appendLine(`[init] register CustomConfigurationProvider done !\r\n`);

            // update cppConfig now
            prj.forceUpdateCpptoolsConfig();

            // set flag
            this.isRegisteredCpptoolsProvider = true;
        }
    }

    notifyCpptoolsRefresh() {

        if (this.cppToolsApi) {
            if (this.cppToolsApi.notifyReady) {
                this.cppToolsApi.notifyReady(this);
            } else {
                this.cppToolsApi.didChangeCustomConfiguration(this);
                this.cppToolsApi.didChangeCustomBrowseConfiguration(this);
            }
        }
    }

    async canProvideConfiguration(uri: vscode.Uri, token?: vscode.CancellationToken | undefined): Promise<boolean> {

        this.cppToolsOut.appendLine(`[source] cpptools request provideConfigurations for '${uri.fsPath}'`);

        const providerList: string[] = [];

        await this.dataProvider.traverseProjectsAsync(async (prj) => {

            const result = await prj.canProvideConfiguration(uri, token);
            if (result) {
                providerList.push(prj.getUid());
            }

            return false; // don't break loop
        });

        if (providerList.length > 0) {
            this._sourceWhereFroms.set(uri.fsPath, providerList);
            return true;
        } else {
            this._sourceWhereFroms.delete(uri.fsPath);
            return false;
        }
    }

    async provideConfigurations(uris: vscode.Uri[], token?: vscode.CancellationToken | undefined): Promise<SourceFileConfigurationItem[]> {

        let result: SourceFileConfigurationItem[] = [];

        const activePrjUid = this.dataProvider.getActiveProject()?.getUid();

        for (const uri of uris) {

            const prjList = this._sourceWhereFroms.get(uri.fsPath);
            if (prjList == undefined || prjList.length == 0) continue;

            let proj: AbstractProject | undefined;
            if (activePrjUid) {
                const pidx = prjList.findIndex(uid => uid == activePrjUid);
                if (pidx != -1) {
                    proj = this.dataProvider.getProjectByUid(prjList[pidx]);
                }
            } else {
                proj = this.dataProvider.getProjectByUid(prjList[0]);
            }

            if (proj) {
                GlobalEvent.log_info(`[cpptools] Providing config for: ${uri.fsPath} (Project: ${proj.getUid()})`);
                result = result.concat(await proj.provideConfigurations([uri], token));
            } else {
                GlobalEvent.log_warn(`[cpptools] Failed to find project for: ${uri.fsPath}`);
            }
        }

        this.cppToolsOut.appendLine(`[source] provideConfigurations request finished, found ${result.length} items`);
        this.cppToolsOut.appendLine(yml.stringify(result));

        return result;
    }

    async canProvideBrowseConfigurationsPerFolder(token?: vscode.CancellationToken | undefined): Promise<boolean> {
        let result = false;
        await this.dataProvider.traverseProjectsAsync(async (prj) => {
            result = await prj.canProvideBrowseConfigurationsPerFolder(token);
            return result;
        });
        return result;
    }

    async provideFolderBrowseConfiguration(uri: vscode.Uri, token?: vscode.CancellationToken | undefined): Promise<WorkspaceBrowseConfiguration | null> {
        let result: WorkspaceBrowseConfiguration | null = null;
        await this.dataProvider.traverseProjectsAsync(async (prj) => {
            result = await prj.provideFolderBrowseConfiguration(uri, token);
            if (result !== null) {
                GlobalEvent.log_info(`[cpptools] Found folder browse configuration for '${uri.fsPath}' in project ${prj.getUid()}`);
            }
            return result !== null;
        });
        this.cppToolsOut.appendLine(`[folder] provideFolderBrowseConfiguration for '${uri.fsPath}'`);
        this.cppToolsOut.appendLine(yml.stringify(result));
        return result;
    }

    /**
     * @note we not support
    */
    canProvideBrowseConfiguration(token?: vscode.CancellationToken | undefined): Thenable<boolean> {
        return new Promise((resolve) => {
            resolve(false);
        });
    }

    /**
     * @note we not support
    */
    provideBrowseConfiguration(token?: vscode.CancellationToken | undefined): Thenable<WorkspaceBrowseConfiguration | null> {
        return new Promise((resolve) => {
            resolve(null);
        });
    }

    dispose() {
        this.dataProvider.traverseProjects((prj) => {
            prj.dispose();
            return undefined;
        });
    }

    // ----------------------------------------
    //  clangd config provider
    // ----------------------------------------

    async registerClangdProvider(prj: AbstractProject) {

        if (this.cppToolsApi)
            return; // 如果 cpptools 激活了，则禁用 clangd，防止两个冲突

        prj.on('cppConfigChanged', () => {

            if (!SettingManager.instance().isEnableClangdConfigGenerator()) {
                GlobalEvent.log_info(`[clangd] Config generator is disabled by user settings.`);
                return;
            }

            // ----------------------
            // setup clangd config
            // ----------------------
            try {
                const projectUid = prj.getUid();
                GlobalEvent.log_info(`[clangd] Updating .clangd for project: ${projectUid}`);

                let cfg: any = {};
                const fclangd = File.fromArray([prj.getProjectRoot().path, '.clangd']);

                // Read existing config if it exists
                if (fclangd.IsFile()) {
                    try {
                        const content = fclangd.Read();
                        cfg = yaml.parse(content) || {};
                        GlobalEvent.log_info(`[clangd] Loaded existing .clangd configuration.`);
                    } catch (e) {
                        GlobalEvent.log_warn(`[clangd] Failed to parse existing .clangd: ${e}. Recreating.`);
                        cfg = {};
                    }
                }

                // Initialize basic structures
                if (!cfg['CompileFlags']) cfg['CompileFlags'] = {};
                if (!cfg['CompileFlags']['Add']) cfg['CompileFlags']['Add'] = [];
                if (!cfg['CompileFlags']['Remove']) cfg['CompileFlags']['Remove'] = [];

                // Indexer settings
                if (!cfg['Index']) cfg['Index'] = {};
                if (cfg['Index']['Background'] === undefined) cfg['Index']['Background'] = 'Build';

                // Diagnostics settings
                if (!cfg['Diagnostics']) cfg['Diagnostics'] = {};
                if (cfg['Diagnostics']['UnusedIncludes'] === undefined) cfg['Diagnostics']['UnusedIncludes'] = 'Strict';
                if (cfg['Diagnostics']['MissingIncludes'] === undefined) cfg['Diagnostics']['MissingIncludes'] = 'Strict';

                // Inlay hints (very useful for embedded dev)
                if (!cfg['InlayHints']) cfg['InlayHints'] = {};
                if (cfg['InlayHints']['Enabled'] === undefined) cfg['InlayHints']['Enabled'] = true;
                if (cfg['InlayHints']['ParameterNames'] === undefined) cfg['InlayHints']['ParameterNames'] = true;
                if (cfg['InlayHints']['DeducedTypes'] === undefined) cfg['InlayHints']['DeducedTypes'] = true;

                // Set compilation database path
                cfg['CompileFlags']['CompilationDatabase'] = './' + File.ToUnixPath(prj.getOutputDir());

                const toolchain = prj.getToolchain();
                const gccLikePath = toolchain.getGccFamilyCompilerPathForCpptools('c');

                if (gccLikePath) { // clangd 仅兼容gcc的编译器

                    GlobalEvent.log_info(`[clangd] Toolchain: ${toolchain.name}, Compiler: ${gccLikePath}`);

                    cfg['CompileFlags']['Compiler'] = gccLikePath;
                    let clangdCompileFlags = <string[]>(cfg['CompileFlags']['Add']);
                    const cpptoolsConfig = prj.getCpptoolsConfig();
                    const compilerArgs = cpptoolsConfig.cppCompilerArgs || [];

                    // 1. Handle system headers for GCC family
                    if (isGccFamilyToolchain(toolchain.name)) {
                        const tRoot = toolchain.getToolchainDir().path;
                        // Clean old toolchain-related includes if any
                        clangdCompileFlags = clangdCompileFlags.filter(p => !File.isSubPathOf(tRoot, p.startsWith('-I') ? p.substring(2) : p));

                        const sysHeaders = getGccSystemSearchList(File.ToLocalPath(gccLikePath), ['-xc++'].concat(compilerArgs));
                        if (sysHeaders && sysHeaders.length > 0) {
                            GlobalEvent.log_info(`[clangd] Found ${sysHeaders.length} system headers via compiler.`);
                            sysHeaders.forEach(p => {
                                const flag = `-I${File.normalize(p)}`;
                                if (!clangdCompileFlags.includes(flag)) {
                                    clangdCompileFlags.push(flag);
                                }
                            });
                        }
                    } else if (toolchain.name == 'LLVM_ARM') {
                        GlobalEvent.log_info(`[clangd] Native LLVM support enabled.`);
                    } else {
                        // Fallback generic GCC-like layout
                        const tPath = toolchain.getToolchainDir().path;
                        clangdCompileFlags.push(`-I${tPath}/include`);
                        clangdCompileFlags.push(`-I${tPath}/include/libcxx`);
                    }

                    // 2. Add user includes from project (prioritize project includes)
                    const userIncludes = cpptoolsConfig.includePath || [];
                    userIncludes.forEach(path => {
                        const flag = `-I${path}`;
                        if (!clangdCompileFlags.includes(flag)) {
                            clangdCompileFlags.push(flag);
                        }
                    });

                    // 3. Add user defines
                    const userDefines = cpptoolsConfig.defines || [];
                    userDefines.forEach(def => {
                        const flag = `-D${def}`;
                        if (!clangdCompileFlags.includes(flag)) {
                            clangdCompileFlags.push(flag);
                        }
                    });

                    // 4. Add compiler specific arguments
                    compilerArgs.forEach(arg => {
                        if (!clangdCompileFlags.includes(arg)) {
                            clangdCompileFlags.push(arg);
                        }
                    });

                    // Deduplicate results
                    cfg['CompileFlags']['Add'] = ArrayDelRepetition(clangdCompileFlags);
                    GlobalEvent.log_info(`[clangd] Configured with ${cfg['CompileFlags']['Add'].length} compiler flags.`);
                }
                // 其他不受 clangd 支持的编译器（如 AC5, SDCC）尝试提取头文件和定义进行软支持
                else if (toolchain.name == 'AC5' || toolchain.name == 'SDCC' || toolchain.name == 'GNU_SDCC_MCS51') {

                    GlobalEvent.log_info(`[clangd] Compatibility mode for ${toolchain.name}`);

                    const builderOpts = prj.getBuilderOptions();
                    const prjConfig = prj.GetConfiguration();
                    const compilerFlags: string[] = cfg['CompileFlags']['Add'] || [];

                    // Extract system includes
                    toolchain.getSystemIncludeList(builderOpts).forEach(p => {
                        const flag = `-I"${p}"`;
                        if (!compilerFlags.includes(flag)) compilerFlags.push(flag);
                    });

                    // Extract internal defines
                    toolchain.getInternalDefines(<any>prjConfig.config.toolchainConfig, builderOpts).forEach(d => {
                        const flag = `-D"${d.name}=${d.value}"`;
                        if (!compilerFlags.includes(flag)) compilerFlags.push(flag);
                    });

                    cfg['CompileFlags']['Add'] = ArrayDelRepetition(compilerFlags);

                    // Disable diagnostics for these compilers as they may produce many false positives in clangd
                    if (cfg['Diagnostics'].Suppress === undefined) {
                        cfg['Diagnostics'].Suppress = ['*'];
                    }
                    GlobalEvent.log_info(`[clangd] Suppressed diagnostics for incompatible toolchain.`);
                } else {
                    GlobalEvent.log_warn(`[clangd] Unsupported toolchain '${toolchain.name}' for full clangd support.`);
                }

                // Write the result back to .clangd
                fclangd.Write(yaml.stringify(cfg));
                GlobalEvent.log_info(`[clangd] Configuration successfully written to .clangd file.`);

            } catch (error) {
                GlobalEvent.log_error(`[clangd] Exception while generating config: ${error}`);
            }
        });

        prj.forceUpdateCpptoolsConfig();
        GlobalEvent.log_info(`[clangd] Provider listener registered for ${prj.getUid()}`);
    }
}
