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
                result = result.concat(await proj.provideConfigurations([uri], token));
            }
        }

        this.cppToolsOut.appendLine(`[source] provideConfigurations`);
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
                GlobalEvent.log_info(`ignore update .clangd, because "EIDE.Option.EnableClangdConfigGenerator" is not set`);
                return;
            }

            // ----------------------
            // setup clangd config
            // ----------------------
            try {
                let cfg: any = {};
                const fclangd = File.fromArray([prj.getProjectRoot().path, '.clangd']);
                if (fclangd.IsFile()) {
                    cfg = yaml.parse(fclangd.Read());
                }
                if (!cfg['CompileFlags']) cfg['CompileFlags'] = {};
                if (!cfg['CompileFlags']['Add']) cfg['CompileFlags']['Add'] = [];
                if (!cfg['CompileFlags']['Remove']) cfg['CompileFlags']['Remove'] = [];
                //
                cfg['CompileFlags']['CompilationDatabase'] = './' + File.ToUnixPath(prj.getOutputDir());
                const toolchain = prj.getToolchain();
                const gccLikePath = toolchain.getGccFamilyCompilerPathForCpptools('c');
                if (gccLikePath) { // clangd 仅兼容gcc的编译器
                    cfg['CompileFlags']['Compiler'] = gccLikePath;
                    let clangdCompileFlags = <string[]>(cfg['CompileFlags']['Add']);
                    const compilerArgs = prj.getCpptoolsConfig().cppCompilerArgs;
                    if (isGccFamilyToolchain(toolchain.name)) {
                        const tRoot = toolchain.getToolchainDir().path;
                        clangdCompileFlags = clangdCompileFlags.filter(p => !File.isSubPathOf(tRoot, p.substr(2)));
                        const li = getGccSystemSearchList(File.ToLocalPath(gccLikePath), ['-xc++'].concat(compilerArgs || []));
                        if (li) {
                            li.forEach(p => {
                                clangdCompileFlags.push(`-I${File.normalize(p)}`);
                            });
                        }
                    } else if (toolchain.name == 'LLVM_ARM') {
                        // nothing todo. This is llvm.
                    } else {
                        clangdCompileFlags.push(`-I${toolchain.getToolchainDir().path}/include`);
                        clangdCompileFlags.push(`-I${toolchain.getToolchainDir().path}/include/libcxx`);
                    }
                    // // add flags
                    // if (compilerArgs)
                    //     compilerArgs.forEach(arg => clangdCompileFlags.push(arg));
                    // // add user includes
                    // prj.getCpptoolsConfig().includePath
                    //     .forEach(path => clangdCompileFlags.push(`-I${path}`));
                    // // add user defines
                    // prj.getCpptoolsConfig().defines
                    //     .forEach(d => clangdCompileFlags.push(`-D${d}`));
                    // del repeat
                    cfg['CompileFlags']['Add'] = ArrayDelRepetition(clangdCompileFlags);
                }
                // 其他不受 clangd 支持的编译器要自行设置 -I -D
                else if (toolchain.name == 'AC5' || toolchain.name == 'SDCC' || toolchain.name == 'GNU_SDCC_MCS51') {
                    const builderOpts = prj.getBuilderOptions();
                    const prjConfig = prj.GetConfiguration();
                    const compilerFlags: string[] = cfg['CompileFlags']['Add'] || [];
                    toolchain.getSystemIncludeList(builderOpts)
                        .forEach(p => compilerFlags.push(`-I"${p}"`));
                    toolchain.getInternalDefines(<any>prjConfig.config.toolchainConfig, builderOpts)
                        .forEach(d => compilerFlags.push(`-D"${d.name}=${d.value}"`));
                    cfg['CompileFlags']['Add'] = ArrayDelRepetition(compilerFlags);
                    // 禁用所有诊断错误，因为 clangd 不支持这些编译器
                    cfg['Diagnostics'] = { 'Suppress': '*' };
                }
                fclangd.Write(yaml.stringify(cfg));
            } catch (error) {
                GlobalEvent.log_error(error);
            }
        });

        prj.forceUpdateCpptoolsConfig();
    }
}
