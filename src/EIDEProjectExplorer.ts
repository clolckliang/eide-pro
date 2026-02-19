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

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
*/

import * as vscode from 'vscode';
import * as events from 'events';
import * as fs from 'fs';
import * as NodePath from 'path';
import * as child_process from 'child_process';
import * as os from 'os';
import * as yaml from 'yaml';
import * as ini from 'ini';
import * as jsonc_parser from 'jsonc-parser';

import { File } from '../lib/node-utility/File';
import { ResManager } from './ResManager';
import { GlobalEvent } from './GlobalEvents';
import { AbstractProject, CheckError, DataChangeType, VirtualSource, SourceFileOptions, EIDE_FILE_OPTION_VERSION } from './EIDEProject';
import { ToolchainName, ToolchainManager } from './ToolchainManager';
import {
    BuilderOptions,
    CreateOptions, VirtualFolder, VirtualFile, ImportOptions,
    ProjectTargetInfo, ProjectConfigData, ProjectType, ProjectConfiguration, ProjectBaseApi, MAPPED_KEYS_IN_TARGET_INFO
} from './EIDETypeDefine';
import {
    PackInfo, ComponentFileItem, DeviceInfo,
    getComponentKeyDescription, ArmBaseCompileData, ArmBaseCompileConfigModel, ARMStorageLayout,
    RiscvCompileData, AnyGccCompileData,
    getRamRomName,
    getRamRomRange
} from "./EIDEProjectModules";
import { WorkspaceManager } from './WorkspaceManager';
import {
    can_not_close_project, project_is_opened, project_load_failed,
    continue_text, cancel_text, project_exist_txt,
    project_record_read_failed, pack_info, compile_config, set_device_hint,
    switch_workspace_hint, add_include_path, add_define, project_dependence,
    view_str$pack$installed_component, not_support_no_arm_project,
    install_this_pack, export_keil_xml_ok, export_keil_xml_failed,
    invalid_project_path,
    uploadConfig_desc, add_lib_path, view_str$pack$components,
    view_str$project$title, view_str$project$excludeFolder, view_str$project$excludeFile,
    view_str$pack$install_component_failed, view_str$pack$remove_component_failed,
    view_str$compile$selectToolchain, view_str$compile$selectFlasher, view_str$project$needRefresh, view_str$project$fileNotExisted,
    WARNING, view_str$project$cmsis_components, view_str$project$other_settings, view_str$settings$outFolderName,
    view_str$dialog$add_to_source_folder, view_str$project$sel_target, view_str$project$folder_type_fs,
    view_str$project$folder_type_virtual, view_str$project$sel_folder_type,
    view_str$project$add_source,
    view_str$settings$prj_name,
    view_str$operation$import_done,
    view_str$operation$import_failed,
    view_str$operation$create_prj_done,
    view_str$settings$prjEnv,
    view_str$prompt$unresolved_deps,
    view_str$prompt$prj_location,
    view_str$prompt$src_folder_must_be_a_child_of_root,
    view_str$prompt$removeSrcDir,
    view_str$project$folder_type_virtual_desc,
    view_str$project$folder_type_fs_desc,
    view_str$msg$err_ewt_hash,
    view_str$msg$err_ept_hash,
    view_str$prompt$eclipse_imp_warning,
    view_str$prompt$need_reload_project,
    view_str$prompt$needReloadToUpdateEnv,
    getLocalLanguageType,
    LanguageIndexs,
    txt_yes,
    txt_no,
    remove_this_item,
    view_str$prompt$filesOptionsComment,
    view_str$virual_doc_provider_banner,
    view_str$operation$cmake_no_compile_commands,
    view_str$operation$cmake_generating,
    view_str$operation$cmake_generate_failed,
    view_str$operation$cmake_not_found,
    view_str$operation$cmake_refresh_done,
    txt_jump2settings
} from './StringTable';
import { CodeBuilder, BuildOptions } from './CodeBuilder';
import { ExceptionToMessage, newMessage } from './Message';
import { SettingManager } from './SettingManager';
import { HexUploaderManager, HexUploaderType, JLinkOptions, JLinkProtocolType, OpenOCDFlashOptions, PyOCDFlashOptions } from './HexUploader';
import { SevenZipper, CompressOption } from './Compress';
import { DependenceManager } from './DependenceManager';
import { ArrayDelRepetition } from '../lib/node-utility/Utility';
import {
    copyObject, downloadFileWithProgress,
    runShellCommand, redirectHost, readGithubRepoFolder, FileCache,
    genGithubHash, md5, toArray, newMarkdownString, newFileTooltipString, FileTooltipInfo, escapeXml,
    readGithubRepoTxtFile, downloadFile, notifyReloadWindow, formatPath, execInternalCommand,
    copyAndMakeObjectKeysToLowerCase,
    sortPaths,
    getGccBinutilsVersion,
    compareVersion,
    getGccSystemSearchList,
    openocd_getConfigList,
    pyocd_getTargetList,
    generateDotnetProgramCmd,
    isGccFamilyToolchain,
    parseCliArgs
} from './utility';
import { concatSystemEnvPath, DeleteDir, exeSuffix, kill, osType, DeleteAllChildren, userhome, getGlobalState } from './Platform';
import { KeilARMOption, KeilC51Option, KeilParser, KeilRteDependence, C51Parser, ARMParser } from './KeilXmlParser';
import { VirtualDocument } from './VirtualDocsProvider';
import { ResInstaller } from './ResInstaller';
import { ExeCmd, ExecutableOption, ExeFile } from '../lib/node-utility/Executable';
import { CmdLineHandler } from './CmdLineHandler';
import { WebPanelManager } from './WebPanelManager';
import * as yml from 'yaml';
import { GitFileInfo } from './WebInterface/GithubInterface';
import {
    CppToolsApi, Version, CustomConfigurationProvider, getCppToolsApi,
    SourceFileConfigurationItem, WorkspaceBrowseConfiguration
} from 'vscode-cpptools';
import * as eclipseParser from './EclipseProjectParser';
import { isArray } from 'util';
import { parseIarCompilerLog, CompilerDiagnostics, parseGccCompilerLog, parseArmccCompilerLog, parseKeilc51CompilerLog, parseSdccCompilerLog, parseCosmicStm8CompilerLog } from './ProblemMatcher';
import * as iarParser from './IarProjectParser';
import * as cmakeParser from './CmakeProjectParser';
import * as ArmCpuUtils from './ArmCpuUtils';
import { ShellFlasherIndexItem } from './WebInterface/WebInterface';
import { jsonc } from 'jsonc';
import { SimpleUIConfig, SimpleUIConfigData_input, SimpleUIConfigData_options, SimpleUIConfigData_text, SimpleUIConfigData_table, SimpleUIConfigData_boolean, SimpleUIConfigData_divider, SimpleUIConfigData_tag } from "./SimpleUIDef";
import { StatusBarManager } from './StatusBarManager';
import { doMigration, detectProject } from './EIDEProjectMigration';
import {
    ItemClickInfo,
    ModifiableDepInfo,
    ProjectDataProvider,
    ProjTreeItem,
    TreeItemType,
    VirtualFileInfo,
    VirtualFolderInfo
} from './ProjectExplorer/ProjectTree';
import {
    ModifiableYamlConfigProvider,
    ProjectAttrModifier,
    ProjectExcSourceModifier,
    VFolderSourcePathsModifier
} from './ProjectExplorer/YamlConfigProviders';

interface BuildCommandInfo {
    title: string;
    command: string;
    program?: string;
    order?: number;
    ignoreFailed?: boolean;
}

interface ImporterProjectInfo {
    name: string;
    target?: string;
    incList: string[];
    defineList: string[];
    files: VirtualFolder;
    excludeList?: string[] | { [targetName: string]: string[] };
}

class PathCompletionItem extends vscode.CompletionItem {

    file: File;

    constructor(f: File) {

        super(f.name);

        this.file = f;

        if (f.IsExist()) {
            this.kind = f.IsDir() ? vscode.CompletionItemKind.Folder : vscode.CompletionItemKind.File;
        }

        this.detail = f.path;
        this.insertText = f.name;
    }
}

export class ProjectExplorer implements CustomConfigurationProvider {

    private readonly vFolderNameMatcher = /^\w[\w\t \-:@\.]*$/;

    private view: vscode.TreeView<ProjTreeItem>;
    private dataProvider: ProjectDataProvider;

    private _event: events.EventEmitter;
    private cppcheck_diag: vscode.DiagnosticCollection;
    private cppcheck_out: vscode.OutputChannel;

    private cppToolsApi: CppToolsApi | undefined;
    private cppToolsOut: vscode.OutputChannel;

    private compiler_diags: Map<string, vscode.DiagnosticCollection>;

    private autosaveTimer: NodeJS.Timeout | undefined;

    private isRevealed: boolean = false; // 用于标记，初始化后是否已触发了展开首个树视图的操作

    constructor(context: vscode.ExtensionContext) {

        this._event = new events.EventEmitter();
        this.compiler_diags = new Map();

        this.dataProvider = new ProjectDataProvider(context);
        this.cppcheck_diag = vscode.languages.createDiagnosticCollection('cppcheck');

        this.view = vscode.window.createTreeView('cl.eide.view.projects', {
            treeDataProvider: this.dataProvider,
            dragAndDropController: this.dataProvider,
            canSelectMany: true,
        });
        context.subscriptions.push(this.view);

        // 当主要的几个根视图初始化后，触发展开树视图
        this.dataProvider.on('rootItems_inited', () => {
            if (this.isRevealed == false) {
                this.isRevealed = true;
                const proj = this.dataProvider.getActiveProject();
                // 当工作区有多个项目的时候，不进行展开操作
                if (proj && this.dataProvider.getProjectCount() == 1) {
                    const item = this.dataProvider.treeCache.getTreeItem(proj, TreeItemType.PROJECT);
                    if (item) {
                        this.view.reveal(item, {
                            select: false,
                            focus: false,
                            expand: false
                        });
                    }
                }
            }
        });

        // item click event
        context.subscriptions.push(vscode.commands.registerCommand(ProjTreeItem.ITEM_CLICK_EVENT, (item) => this.OnTreeItemClick(item)));

        // cmake refresh
        context.subscriptions.push(vscode.commands.registerCommand('_cl.eide.project.cmake.refresh', (item) => this.dataProvider.RefreshCmakeProject(item)));

        // create vsc output channel
        this.cppcheck_out = vscode.window.createOutputChannel('eide-static-check-log');
        this.cppToolsOut = vscode.window.createOutputChannel('eide-cpptools-log');

        // register doc event
        context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((doc) => {
            this.YamlConfigProvider_notifyDocSaved(doc);
        }));
        context.subscriptions.push(vscode.workspace.onDidCloseTextDocument((doc) => {
            this.YamlConfigProvider_notifyDocClosed(doc);
        }));

        // register yaml config provider
        {
            const providerList: ModifiableYamlConfigProvider[] = [
                new VFolderSourcePathsModifier(),
                new ProjectAttrModifier(),
                new ProjectExcSourceModifier()
            ];

            for (const provider of providerList) {
                this.registerModifiableYamlConfigProvider(provider.id, provider);
            }
        }

        // register path completion item provider
        context.subscriptions.push(
            vscode.languages.registerCompletionItemProvider({ scheme: 'file', pattern: '**/*.eide.*.{yml,yaml}' }, this.newPathStringCompletionItemProvider(), '/', '\\'));

        // register task end event callback
        context.subscriptions.push(
            vscode.tasks.onDidEndTask((t) => {
                if (['eide.flasher', 'eide.builder'].includes(t.execution.task.source)) {
                    this.dataProvider.updateStatusBarForActiveProjects();
                }
            }));

        // register project hook
        GlobalEvent.on('project.opened', (prj) => this.onProjectOpened(prj));
        GlobalEvent.on('project.closed', (uid) => this.onProjectClosed(uid));
        GlobalEvent.on('project.activeStatusChanged', (uid) => this.notifyCpptoolsRefresh());

        this.on('request_open_project', (fsPath: string) => this.dataProvider.OpenProject(fsPath));
        this.on('request_create_project', (option: CreateOptions) => this.dataProvider.CreateProject(option));
        this.on('request_create_from_template', (option) => this.dataProvider.CreateFromTemplate(option));
        this.on('request_import_project', (option) => this.dataProvider.ImportProject(option));
    }

    onDispose() {
        this.dataProvider.onDispose();
    }

    loadWorkspace(workspaceState: vscode.Memento) {
        this.dataProvider.LoadWorkspaceProject(workspaceState);
    }

    enableAutoSave(enable: boolean) {
        if (enable) {
            if (this.autosaveTimer) {
                this.autosaveTimer.refresh();
            } else {
                this.autosaveTimer = setInterval(() => this.SaveAll(), 3 * 60 * 1000);
            }
        } else {
            if (this.autosaveTimer) {
                clearInterval(this.autosaveTimer);
                this.autosaveTimer = undefined;
            }
        }
    }

    newPathStringCompletionItemProvider(): vscode.CompletionItemProvider<PathCompletionItem> {
        return {
            provideCompletionItems: (document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext):
                vscode.ProviderResult<PathCompletionItem[] | vscode.CompletionList<PathCompletionItem>> => {

                let proj: AbstractProject | undefined;

                for (const provider of this.yamlCfgProviderList.values()) {
                    proj = provider.getSourceProjectByFileName(NodePath.basename(document.fileName));
                    if (proj) {
                        break;
                    }
                }

                if (proj == undefined) {
                    return;
                }

                const fullrange = document.getWordRangeAtPosition(position, /[^\s"]+|"[^"]+"/);
                if (fullrange) {

                    const txt = document.getText(new vscode.Range(fullrange.start, position)).trim()
                        .replace(/^(\/|\\)+/, '')
                        .replace(/(\/|\\)+$/, '');

                    const p = new File(proj.toAbsolutePath(txt));
                    if (p.IsDir()) {
                        return p.GetList(undefined, undefined).map(f => new PathCompletionItem(f));
                    }
                }
            }
        };
    }

    // -----------------------------------------
    //  cpptools intellisense provider
    // -----------------------------------------

    name: string = 'eide';

    extensionId: string = 'cl.eide';

    private isRegisteredCpptoolsProvider: boolean = false;

    private async registerCpptoolsProvider(prj: AbstractProject) {

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

    // Map<sourePath, ProjectUid[]>
    private _sourceWhereFroms: Map<string, string[]> = new Map();

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

        const activePrjUid = this.getActiveProject()?.getUid();

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

    private async registerClangdProvider(prj: AbstractProject) {

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

    // -----------------------------------------
    //  Project Explorer 
    // -----------------------------------------

    private on(event: 'request_open_project', listener: (fsPath: string) => void): void;
    private on(event: 'request_create_project', listener: (option: CreateOptions) => void): void;
    private on(event: 'request_create_from_template', listener: (option: CreateOptions) => void): void;
    private on(event: 'request_import_project', listener: (option: ImportOptions) => void): void;
    private on(event: any, listener: (arg?: any) => void): void {
        this._event.on(event, listener);
    }

    emit(event: 'request_open_project', fsPath: string): void;
    emit(event: 'request_create_project', option: CreateOptions): void;
    emit(event: 'request_create_from_template', option: CreateOptions): void;
    emit(event: 'request_import_project', option: ImportOptions): void;
    emit(event: any, arg?: any): void {
        this._event.emit(event, arg);
    }

    getProjectByTreeItem(prjItem?: ProjTreeItem): AbstractProject | undefined {
        return prjItem instanceof ProjTreeItem ?
            this.dataProvider.GetProjectByIndex(prjItem.val.projectIndex) :
            this.getActiveProject();
    }

    getActiveProject(): AbstractProject | undefined {
        return this.dataProvider.getActiveProject();
    }

    getProjectCount(): number {
        return this.dataProvider.getProjectCount();
    }

    Refresh() {
        this.dataProvider.clearTreeViewCache();
        this.dataProvider.UpdateView();
    }

    RefreshKeilProject(item: ProjTreeItem) {
        this.dataProvider.RefreshKeilProject(item);
    }

    Close(item: ProjTreeItem) {
        const uid = this.dataProvider.Close(item.val.projectIndex);
        GlobalEvent.emit('project.closed', uid);
    }

    SaveAll() {
        this.dataProvider.SaveAll();
    }

    // -------

    openLibsGeneratorConfig(prjItem?: ProjTreeItem) {

        const proj = this.getProjectByTreeItem(prjItem);
        if (proj == undefined) {
            GlobalEvent.emit('msg', newMessage('Warning', 'No activated project !'));
            return;
        }

        const optFile = proj.getLibsGeneratorCfgFile();
        vscode.window.showTextDocument(vscode.Uri.parse(optFile.ToUri()), { preview: true });
    }

    private async onProjectOpened(prj: AbstractProject) {

        await this.registerCpptoolsProvider(prj);

        await this.registerClangdProvider(prj);

        this.updateCompilerDiagsAfterBuild(prj);

        prj.on('projectFileChanged', () => this.onProjectFileChanged(prj));

        // Register Keil project watcher if this is a Keil-sourced project
        this.tryRegisterKeilWatcher(prj);
    }

    private tryRegisterKeilWatcher(prj: AbstractProject) {
        const miscInfo = prj.GetConfiguration().config.miscInfo;

        // 1. Try to get from config
        let keilProjectPath: string | undefined;

        if (miscInfo) {
            if ((<any>miscInfo).mdk_project_path) {
                keilProjectPath = (<any>miscInfo).mdk_project_path;
            } else if ((<any>miscInfo).source_project && (<any>miscInfo).source_project.type === 'mdk') {
                keilProjectPath = prj.ToAbsolutePath((<any>miscInfo).source_project.path);
            }
        }

        // 2. If not found in config, try auto-discover
        if (!keilProjectPath) {
            const root = prj.getProjectRoot();
            const uvFiles = root.GetList([/\.uvproj[x]?$/i], File.EXCLUDE_ALL_FILTER);
            if (uvFiles.length === 1) {
                keilProjectPath = uvFiles[0].path;
                console.log(`[EIDE] Auto-discovered Keil project file: ${keilProjectPath}`);
            }
        }

        if (keilProjectPath && new File(keilProjectPath).IsFile()) {
            this.dataProvider.registerKeilWatcherForProject(prj, keilProjectPath);
        }
    }

    private __autosaveDisableTimeoutTimer: NodeJS.Timeout | undefined;
    private async onProjectFileChanged(prj: AbstractProject) {

        const nam = prj.getProjectName();
        const uid = prj.getUid();
        const wsf = prj.getWorkspaceFile();

        //
        // disable autosave
        //
        this.enableAutoSave(false);

        if (this.__autosaveDisableTimeoutTimer) {
            this.__autosaveDisableTimeoutTimer.refresh();
        } else {
            this.__autosaveDisableTimeoutTimer = setTimeout((_this: ProjectExplorer) => {
                _this.__autosaveDisableTimeoutTimer = undefined;
                _this.enableAutoSave(true);
            }, 5 * 60 * 1000, this);
        }

        //
        // do something
        //
        const msg = view_str$prompt$need_reload_project.replace('{}', prj.getProjectName());
        const ans = await vscode.window.showInformationMessage(msg, 'Yes', 'No');
        if (ans == 'Yes') {
            await this.reloadProject(uid, wsf);
        }

        if (this.__autosaveDisableTimeoutTimer) {
            clearTimeout(this.__autosaveDisableTimeoutTimer);
            this.__autosaveDisableTimeoutTimer = undefined;
        }

        //
        // enable auto save
        //
        this.enableAutoSave(true);
    }

    private async reloadProject(uid: string, workspaceFile: File): Promise<boolean> {

        const idx = this.dataProvider.getIndexByProjectUid(uid);
        if (idx == -1) {
            GlobalEvent.emit('msg', newMessage('Error', `Project '${uid}' is not actived !`));
            return false;
        }

        this.dataProvider.Close(idx);

        return new Promise((resolve) => {
            setTimeout(async () => {
                try {
                    await this.dataProvider.OpenProject(workspaceFile.path, true);
                    this.Refresh();
                    resolve(true);
                } catch (error) {
                    GlobalEvent.emit('error', error);
                    resolve(false);
                }
            }, 500);
        });
    }

    private async onProjectClosed(uid: string | undefined) {

        if (!uid) return;

        // clear vscode diags
        if (this.compiler_diags.has(uid)) {
            this.compiler_diags.get(uid)?.clear();
        }
    }

    private async createTarget(prj: AbstractProject) {

        const targetName = await vscode.window.showInputBox({
            placeHolder: 'Input a target name',
            ignoreFocusOut: true,
            validateInput: (val: string) => {
                if (val.length > 25) { return `string is too long !, length must < 25, current is ${val.length}`; }
                if (!/^[\w\-]+$/.test(val)) { return `string can only contain word, number '-' or '_' !`; }
                return undefined;
            }
        });

        if (targetName) {

            if (prj.getTargets().includes(targetName)) {
                GlobalEvent.emit('msg', newMessage('Warning', `Target '${targetName}' is existed !`));
                return;
            }

            prj.switchTarget(targetName);
        }
    }

    private async deleteTarget(prj: AbstractProject) {

        const selTarget = await vscode.window.showQuickPick(prj.getTargets(), { placeHolder: 'Select a target to delete' });
        if (selTarget === undefined) { return; }

        const curTarget = prj.getCurrentTarget();
        if (selTarget === curTarget) {
            GlobalEvent.emit('msg', newMessage('Warning', `Target '${curTarget}' is actived !, can't remove it !`));
            return;
        }

        const opt_str = await vscode.window.showInformationMessage(
            `Target '${selTarget}' will be deleted !, Are you sure ?`,
            'Yes', 'No'
        );

        /* if user canceled, exit */
        if (opt_str != 'Yes') { return; }

        prj.deleteTarget(selTarget);
    }

    switchTarget(prjItem?: ProjTreeItem) {

        const prj = prjItem
            ? this.dataProvider.GetProjectByIndex(prjItem.val.projectIndex)
            : this.getActiveProject();
        if (!prj) { // not active project
            GlobalEvent.emit('msg', newMessage('Info', `No active project !`));
            return;
        }

        const resManager = ResManager.GetInstance();
        const pickBox = vscode.window.createQuickPick();
        pickBox.title = view_str$project$sel_target;
        pickBox.placeholder = view_str$project$sel_target;
        pickBox.items = prj.getTargets().map<vscode.QuickPickItem>((name: string) => { return { label: name }; });
        pickBox.buttons = [
            {
                iconPath: {
                    dark: vscode.Uri.parse(resManager.GetIconByName('Add_16xMD.svg').ToUri()),
                    light: vscode.Uri.parse(resManager.GetIconByName('Add_16xMD.svg').ToUri())
                },
                tooltip: 'Create Target'
            },
            {
                iconPath: {
                    dark: vscode.Uri.parse(resManager.GetIconByName('trash_dark.svg').ToUri()),
                    light: vscode.Uri.parse(resManager.GetIconByName('trash_light.svg').ToUri())
                },
                tooltip: 'Delete Target'
            }
        ];

        pickBox.onDidTriggerButton((e) => {

            // create target
            if (e.tooltip === pickBox.buttons[0].tooltip) {
                this.createTarget(prj);
            }

            // delete target
            if (e.tooltip === pickBox.buttons[1].tooltip) {
                this.deleteTarget(prj);
            }

            pickBox.hide();
            pickBox.dispose();
        });

        let curItem: vscode.QuickPickItem | undefined;

        pickBox.onDidChangeSelection((items: readonly vscode.QuickPickItem[]) => {
            curItem = items.length > 0 ? items[0] : undefined;
        });

        pickBox.onDidAccept(() => {

            if (curItem !== undefined) {
                const targetName = curItem.label;
                // switch target
                if (targetName) {
                    prj.switchTarget(targetName);
                }
            }

            pickBox.hide();
            pickBox.dispose();
        });

        pickBox.show();
    }

    async showQuickPickAndSwitchActiveProject() {

        const selections: vscode.QuickPickItem[] = [];

        this.dataProvider.foreachProject((proj) => {
            selections.push(<any>{
                uid: proj.getUid(),
                label: proj.getProjectName(),
                description: `uid: ${proj.getUid()}`,
                detail: `loc: ${proj.getWorkspaceFile().path}`
            });
        });

        if (selections.length > 0) {

            const result: any = await vscode.window.showQuickPick(selections, {
                title: `Switch Active Project`,
                canPickMany: false,
            });

            if (result) {
                const idx = this.dataProvider.getIndexByProjectUid(result.uid);
                if (idx != -1) {
                    const acvtiveProj = this.dataProvider.getActiveProject();
                    if (acvtiveProj && result.uid == acvtiveProj.getUid()) return;
                    this.dataProvider.setActiveProject(idx);
                }
            }
        }
    }

    clearCppcheckDiagnostic(): void {
        this.cppcheck_diag.clear();
    }

    openHistoryRecords() {

        const records: vscode.QuickPickItem[] = this.dataProvider
            .getRecords()
            .map((record) => {
                return <vscode.QuickPickItem>{
                    label: NodePath.basename(record, '.code-workspace'),
                    detail: record
                };
            });

        vscode.window.showQuickPick(records.reverse(), {
            canPickMany: false,
            placeHolder: `Found ${records.length} results, select one to open`,
            matchOnDescription: false,
            matchOnDetail: true,
            ignoreFocusOut: false
        }).then((item: vscode.QuickPickItem | undefined) => {
            if (item !== undefined && item.detail) {
                this.dataProvider.OpenProject(item.detail);
            }
        });
    }

    clearAllHistoryRecords() {
        this.dataProvider.clearAllRecords();
    }

    notifyUpdateOutputFolder(prj: AbstractProject) {
        const item = this.dataProvider.treeCache.getTreeItem(prj, TreeItemType.OUTPUT_FOLDER);
        if (item) {
            this.dataProvider.UpdateView(item);
        }
    }

    saveProject(prjItem?: ProjTreeItem) {

        const prj = this.getProjectByTreeItem(prjItem);

        if (prj === undefined) {
            GlobalEvent.emit('msg', newMessage('Warning', 'No active project !'));
            return;
        }

        prj.Save();
    }

    private _buildLock: boolean = false;
    BuildSolution(prjItem?: ProjTreeItem, options?: BuildOptions) {

        try {

            const prj = this.getProjectByTreeItem(prjItem);

            if (prj === undefined) {
                GlobalEvent.emit('msg', newMessage('Warning', 'No active project !'));
                return;
            }

            if (this._buildLock) {
                GlobalEvent.emit('msg', newMessage('Warning', 'build busy !, please wait !'));
                return;
            }

            this._buildLock = true;

            // save project before build
            prj.Save(true);

            const codeBuilder = CodeBuilder.NewBuilder(prj);
            const toolchain = prj.getToolchain().name;

            // build launched event
            codeBuilder.on('launched', () => {
                if (this.compiler_diags.has(prj.getUid())) {
                    this.compiler_diags.get(prj.getUid())?.clear();
                }
                const buildbar = StatusBarManager.getInstance().get('build');
                if (buildbar) {
                    buildbar.text = `$(loading~spin) Building`;
                }
            });

            // build finish event
            codeBuilder.on('finished', (done) => {
                prj.notifyUpdateSourceRefs(toolchain);
                this.notifyUpdateOutputFolder(prj);
                this.updateCompilerDiagsAfterBuild(prj);
                if (options?.flashAfterBuild && done) this.UploadToDevice(prjItem);
                this.dataProvider.updateStatusBarForActiveProjects();
            });

            // start build
            codeBuilder.build(options);

            setTimeout(() => {
                this._buildLock = false;
            }, 500);

        } catch (error) {
            GlobalEvent.emit('error', error);
        }
    }

    private updateCompilerDiagsAfterBuild(prj: AbstractProject) {

        let diag_res: CompilerDiagnostics | undefined;

        try {

            const logFile = File.fromArray([prj.getOutputFolder().path, 'compiler.log']);

            switch (prj.getToolchain().name) {
                case 'IAR_ARM':
                case 'IAR_STM8':
                    diag_res = parseIarCompilerLog(prj, logFile);
                    break;
                case 'Keil_C51':
                    diag_res = parseKeilc51CompilerLog(prj, logFile);
                    break;
                case 'AC5':
                    diag_res = parseArmccCompilerLog(prj, logFile);
                    break;
                case 'SDCC':
                case 'GNU_SDCC_MCS51':
                    diag_res = parseSdccCompilerLog(prj, logFile);
                    break;
                case 'COSMIC_STM8':
                    diag_res = parseCosmicStm8CompilerLog(prj, logFile);
                    break;
                default:
                    diag_res = parseGccCompilerLog(prj, logFile);
                    break;
            }

        } catch (error) {
            GlobalEvent.log_warn(error);
        }

        if (diag_res) {

            const uid = prj.getUid();

            let cc_diags: vscode.DiagnosticCollection;

            if (this.compiler_diags.has(uid)) {
                cc_diags = <any>this.compiler_diags.get(uid);
            } else {
                cc_diags = vscode.languages.createDiagnosticCollection(prj.getProjectName());
                this.compiler_diags.set(uid, cc_diags);
            }

            for (const path in diag_res) {
                const uri = vscode.Uri.file(path);
                cc_diags.set(uri, diag_res[path]);
            }
        }
    }

    buildWorkspace(rebuild?: boolean) {

        if (this.dataProvider.getProjectCount() == 0) {
            GlobalEvent.emit('msg', newMessage('Warning', 'No project is opened !'));
            return;
        }

        const cmdList: BuildCommandInfo[] = [];

        this.dataProvider.foreachProject((project, index) => {

            const projectName = project.GetConfiguration().config.name;

            const buildCfg: BuildCommandInfo = {
                title: `build '${projectName}'`,
                command: ''
            };

            /* get project order */
            const envConfig = project.getProjectRawEnv();
            const targetName = project.getCurrentTarget().toLowerCase();
            if (envConfig) {
                /////////////////////////////
                // prj build order
                let cfgName = 'EIDE_BUILD_ORDER';
                // parse global config
                if (envConfig[cfgName]) {
                    buildCfg.order = parseInt(envConfig[cfgName]);
                }
                // parse target config
                if (envConfig[targetName] &&
                    envConfig[targetName][cfgName]) {
                    buildCfg.order = parseInt(envConfig[targetName][cfgName]);
                }
                /////////////////////////////
                // ignore if failed ?
                cfgName = 'EIDE_BUILD_SKIP_IF_FAILED';
                // parse global config
                if (envConfig[cfgName]) {
                    buildCfg.ignoreFailed = (parseInt(envConfig[cfgName])) === 1;
                }
                // parse target config
                if (envConfig[targetName] &&
                    envConfig[targetName][cfgName]) {
                    buildCfg.ignoreFailed = (parseInt(envConfig[targetName][cfgName])) === 1;
                }
            }

            // make default order is 100
            if (buildCfg.order == undefined ||
                buildCfg.order == null ||
                isNaN(buildCfg.order)) {
                buildCfg.order = 100;
            }

            /* gen command */
            const builder = CodeBuilder.NewBuilder(project);
            const cmdLine = builder.genBuildCommand({ not_rebuild: !rebuild }, true);
            if (cmdLine) {
                buildCfg.command = cmdLine || '';
                cmdList.push(buildCfg);
            }
        });

        /* gen params file */
        const paramsFile = File.fromArray([os.tmpdir(), `eide-ws-params.tmp`]);
        paramsFile.Write(JSON.stringify(cmdList));

        /* launch */
        const commandLine = generateDotnetProgramCmd(
            ResManager.instance().getUnifyBuilderExe(), ['-r', paramsFile.path]);
        runShellCommand('build workspace', commandLine);
    }

    openWorkspaceConfig() {
        try {
            const wsFile = WorkspaceManager.getInstance().getWorkspaceFile();
            if (wsFile == undefined) { throw new Error('No workspace opened !'); }
            const uri = vscode.Uri.parse(wsFile.ToUri());
            vscode.window.showTextDocument(uri, { preview: true });
        } catch (error) {
            GlobalEvent.emit('msg', ExceptionToMessage(error, 'Warning'));
        }
    }

    BuildClean(prjItem?: ProjTreeItem) {

        const prj = this.getProjectByTreeItem(prjItem);

        if (prj === undefined) {
            GlobalEvent.emit('msg', newMessage('Warning', 'No active project !'));
            return;
        }

        const outDir = prj.ToAbsolutePath(prj.getOutputDir());
        if (os.platform() == 'win32') {
            runShellCommand('clean', `cmd /E:ON /C del /S /Q "${outDir}"`);
        } else {
            if (outDir == '/' || outDir == userhome()) {
                GlobalEvent.emit('msg', newMessage('Error', `Cannot delete ${outDir} !`));
            } else {
                runShellCommand('clean', `rm -rf -v "${outDir}"`);
            }
        }

        setTimeout(() => {
            this.notifyUpdateOutputFolder(prj);
        }, 1500);
    }

    private _uploadLock: boolean = false;
    async UploadToDevice(prjItem?: ProjTreeItem, eraseAll?: boolean) {

        const prj = this.getProjectByTreeItem(prjItem);

        if (prj === undefined) {
            GlobalEvent.emit('msg', newMessage('Warning', 'No active project !'));
            return;
        }

        if (this._uploadLock) {
            GlobalEvent.emit('msg', newMessage('Warning', 'upload busy !, please wait !'));
            return;
        }

        this._uploadLock = true;
        const uploader = HexUploaderManager.getInstance().createUploader(prj);

        try {
            await uploader.upload(eraseAll);
        } catch (error) {
            GlobalEvent.emit('error', error);
        }

        this._uploadLock = false;
    }

    compileSingleFile(item: ProjTreeItem) {

        const project = this.getProjectByTreeItem(item);
        if (!project)
            return;
        if (!(item.val.value instanceof File))
            return;

        try {
            const srcPath = item.val.value.path;
            const dbinfo = project.getSourceCompileDatabase(srcPath);
            if (dbinfo) {
                runShellCommand(`compile: ${NodePath.basename(srcPath)}`, dbinfo.command, {
                    useTerminal: true,
                    cwd: dbinfo.directory
                });
            } else {
                throw Error(`No compile commands for this file: ${srcPath}`);
            }
        } catch (error) {
            GlobalEvent.emit('msg', ExceptionToMessage(error, 'Warning'));
        }
    }

    ExportKeilXml(prjItem: ProjTreeItem) {
        try {
            const prj = this.getProjectByTreeItem(prjItem);
            if (!prj)
                return;

            const matchList: ToolchainName[] = [];

            ToolchainManager.getInstance().getToolchainNameList('ARM')
                .forEach(n => matchList.push(n)); // for Keil Arm
            matchList.push(`Keil_C51`); // for keil C51

            // limit toolchain
            if (!matchList.includes(prj.getToolchain().name)) {
                GlobalEvent.emit('msg', newMessage('Warning', `Not support for toolchain '${prj.getToolchain().name}' !`));
                return;
            }

            const xmlFile = prj.ExportToKeilProject();

            if (xmlFile) {
                GlobalEvent.emit('msg', newMessage('Info', export_keil_xml_ok + prj.toRelativePath(xmlFile.path)));
            } else {
                GlobalEvent.emit('msg', newMessage('Warning', export_keil_xml_failed));
            }
        } catch (error) {
            GlobalEvent.emit('msg', ExceptionToMessage(error, 'Warning'));
        }
    }

    private installLocked: boolean = false;
    InstallKeilPackage(prjIndex: number) {

        if (this.installLocked) {
            GlobalEvent.emit('msg', {
                type: 'Warning',
                contentType: 'string',
                content: 'Busy !, Please wait for the current operation to complete !'
            });
            return;
        }

        this.installLocked = true;
        const prj = this.dataProvider.GetProjectByIndex(prjIndex);

        if (prj.GetConfiguration().config.type !== 'ARM') { // only for ARM project
            GlobalEvent.emit('msg', {
                type: 'Warning',
                contentType: 'string',
                content: not_support_no_arm_project
            });
            this.installLocked = false;
            return;
        }

        if (prj.GetPackManager().GetPack()) {
            GlobalEvent.emit('msg', {
                type: 'Warning',
                contentType: 'string',
                content: 'You should uninstall old package before install a new one !'
            });
            this.installLocked = false;
            return;
        }

        vscode.window.withProgress<void>({
            location: vscode.ProgressLocation.Notification,
            title: `Installing cmsis package`
        }, async (progress): Promise<void> => {

            const resolve = () => {
                this.installLocked = false;
            };

            try {

                progress.report({ message: 'preparing ...' });

                let packFile: File;

                const insType = await vscode.window.showQuickPick<vscode.QuickPickItem>([
                    {
                        label: 'From Repo',
                        detail: 'Download cmsis pack from the repository and install'
                    },
                    {
                        label: 'From Disk',
                        detail: 'Select cmsis pack file from your computer and install'
                    }
                ], {
                    placeHolder: `Select an installation type. Press 'Esc' to exit`,
                    canPickMany: false,
                    ignoreFocusOut: true
                });

                if (insType === undefined) { // canceled, exit
                    resolve();
                    return;
                }

                // download from internet
                if (insType.label == 'From Repo') {

                    progress.report({ message: 'waiting download task done ...' });

                    const res = await this.startDownloadCmsisPack();

                    if (res === undefined) { // canceled, exit
                        resolve();
                        return;
                    }

                    if (res instanceof Error) {
                        GlobalEvent.emit('msg', ExceptionToMessage(res, 'Warning'));
                        resolve();
                        return;
                    }

                    packFile = res;
                }

                // from disk
                else {
                    const urls = await vscode.window.showOpenDialog({
                        defaultUri: vscode.Uri.file(prj.GetRootDir().path),
                        canSelectFolders: false,
                        canSelectFiles: true,
                        openLabel: install_this_pack,
                        filters: {
                            'Cmsis Package': ['pack']
                        }
                    });

                    if (urls === undefined) { // canceled, exit
                        resolve();
                        return;
                    }

                    packFile = new File(urls[0].fsPath);
                }

                await prj.InstallPack(packFile, (_progress, msg) => {
                    progress.report({
                        increment: _progress ? 12 : undefined,
                        message: msg
                    });
                });

                resolve();

            } catch (error) {
                GlobalEvent.emit('msg', ExceptionToMessage(error, 'Warning'));
                resolve();
            }
        });
    }

    private async startDownloadCmsisPack(): Promise<File | Error | undefined> {

        // URL: https://api.github.com/repos/github0null/eide-cmsis-pack/contents/packages
        const repoUrl = redirectHost('api.github.com/repos/' + SettingManager.GetInstance().getCmsisPackRepositoryUrl());

        return await vscode.window.withProgress<File | Error | undefined>({
            location: vscode.ProgressLocation.Notification,
            title: `Download cmsis package`
        }, async (progress, cancelToken) => {

            progress.report({ message: `reading package list ...` });

            const pkgList = await readGithubRepoFolder(repoUrl);
            if (pkgList instanceof Error) {
                return pkgList;
            }

            progress.report({ message: `waiting cmsis package selection ...` });

            const itemList: vscode.QuickPickItem[] = pkgList
                .filter((inf) => inf.type == 'file')
                .map((fileInfo) => {
                    return {
                        label: fileInfo.name,
                        detail: `Size: ${(fileInfo.size / 1000000).toFixed(1)} MB, Sha: ${fileInfo.sha}`,
                        val: fileInfo
                    };
                });

            const item: any = await vscode.window.showQuickPick(itemList, {
                placeHolder: `Found ${pkgList.length} packages, select one to install. Press 'Esc' to exit`,
                canPickMany: false,
                ignoreFocusOut: true,
                matchOnDescription: true
            });

            if (item == undefined) { // user canceled
                return undefined;
            }

            try {

                const gitFileInfo: GitFileInfo = item.val;
                let packageFile: File | undefined;

                const resManager = ResManager.GetInstance();
                const packDir = File.fromArray([resManager.getEideHomeFolder().path, 'pack', 'cmsis']);
                packDir.CreateDir(true);

                // read cache
                const cache = new FileCache(packDir);
                packageFile = cache.get(gitFileInfo.name, gitFileInfo.sha);
                if (packageFile) { // found cache, use it
                    return packageFile;
                }

                // download it
                progress.report({ message: `initializing download '${gitFileInfo.name}' ...` });

                if (gitFileInfo.download_url == undefined) {
                    return new Error(`Can't download '${gitFileInfo.name}', not download url found !`);
                }

                const url = redirectHost(gitFileInfo.download_url);
                const buff = await downloadFileWithProgress(url, gitFileInfo.name, progress, cancelToken);

                if (buff == undefined) { // canceled
                    return undefined;
                }

                if (buff instanceof Error) {
                    return buff;
                }

                // save file
                packageFile = File.fromArray([packDir.path, gitFileInfo.name]);
                fs.writeFileSync(packageFile.path, buff);

                // add to cache
                const sha = genGithubHash(buff);
                cache.add(packageFile.name, sha);
                cache.save();

                return packageFile;

            } catch (error) {
                return error;
            }
        });
    }

    async ExportMakefile(prjItem?: ProjTreeItem) {

        const prj = this.getProjectByTreeItem(prjItem);

        if (prj === undefined) {
            GlobalEvent.emit('msg', newMessage('Error', 'No active project !'));
            return;
        }
        if (this._buildLock) {
            GlobalEvent.emit('msg', newMessage('Error', 'builder busy !, please wait !'));
            return;
        }

        // gen command line
        prj.Save(true);
        const builder = CodeBuilder.NewBuilder(prj);
        const cmdLine = builder.genBuildCommand({ otherArgs: ['--out-makefile', '--dry-run'] });
        if (cmdLine === undefined) {
            GlobalEvent.emit('msg', newMessage('Error', `Fail to generate build command`));
            return;
        }

        // do export

        vscode.window.withProgress({
            title: `Export Makefile`,
            location: vscode.ProgressLocation.Notification
        }, (progress, cancel) => {
            return new Promise<boolean>((resolve) => {
                const proc = new ExeCmd();
                const errLines: string[] = [`Execute: ${cmdLine}`];
                proc.on('launch', () => {
                    progress.report({ message: 'Running ...' });
                    GlobalEvent.log_info(`Export Makefile: ${cmdLine}`);
                });
                proc.on('line', str => {
                    errLines.push(str);
                    progress.report({ message: str });
                });
                proc.on('close', exitInfo => {
                    if (exitInfo.code == 0) {
                        progress.report({ message: 'All Done.' });
                        setTimeout(() => resolve(true), 1000);
                    } else {
                        resolve(false);
                        GlobalEvent.emit('msg', newMessage('Error', `Fail to export Makefile, code=${exitInfo.code}`));
                        if (errLines.length > 0) {
                            GlobalEvent.log_warn(errLines.slice(-100).join(os.EOL));
                        }
                    }
                });
                cancel?.onCancellationRequested(_ => {
                    if (!kill(<number>proc.pid())) {
                        GlobalEvent.emit('msg', newMessage('Error', `Can not kill process: ${proc.pid()} !`));
                    }
                });
                proc.Run(<string>cmdLine, undefined, { cwd: prj.getProjectRoot().path });
            });
        });
    }

    private exportLocked: boolean = false;
    async ExportProjectTemplate(prjItem?: ProjTreeItem, isWorkspace?: boolean) {

        if (this.exportLocked) {
            GlobalEvent.emit('msg', {
                type: 'Warning',
                contentType: 'string',
                content: 'Busy, please try again later !'
            });
            return;
        }

        this.exportLocked = true;

        try {
            let templateName = isWorkspace ? WorkspaceManager.getInstance().getWorkspaceRoot()?.name : undefined;
            let rootDir = isWorkspace ? WorkspaceManager.getInstance().getWorkspaceRoot() : undefined;
            let tmp_suffix = isWorkspace ? 'ewt' : 'ept';
            let resIgnoreList: string[] = [];

            const defExcludeList: string[] = [
                '*.eide-template',
                '*.log',
                '*.ept',
                `${AbstractProject.EIDE_DIR}${File.sep}*.db3`,
                `${AbstractProject.EIDE_DIR}${File.sep}*.dat`,
            ];

            if (SettingManager.instance().isEnableClangdConfigGenerator())
                defExcludeList.push('.clangd');

            // if this is a project, prehandle it
            let prj: AbstractProject | undefined;
            if (prjItem && isWorkspace == undefined) {
                prj = this.dataProvider.GetProjectByIndex(prjItem.val.projectIndex);
                const prjConfig = prj.GetConfiguration().config;
                rootDir = prj.GetRootDir();
                templateName = prjConfig.name;
                tmp_suffix = 'ept';
                const prjOutFolder = File.normalize(prj.GetConfiguration().config.outDir);
                defExcludeList.push(`${prjOutFolder}`, `${prjOutFolder}${File.sep}*`);
                resIgnoreList = prj.readIgnoreList();
            }

            /* invalid root folder, exit */
            if (rootDir == undefined) {
                this.exportLocked = false;
                return;
            }

            const prjRootDir = <File>rootDir;
            const distDir = <File>rootDir;
            const tFile: File = File.fromArray([distDir.path, `${templateName}.${tmp_suffix}`]);

            // delete old template file
            if (tFile.IsFile()) {
                fs.unlinkSync(tFile.path);
            }

            const option: CompressOption = {
                zipType: '7z',
                fileName: tFile.name,
                excludeList: ArrayDelRepetition(defExcludeList.concat(resIgnoreList))
            };

            const compresser = new SevenZipper(ResManager.GetInstance().Get7zDir());

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: isWorkspace ? `Packing workspace` : `Packing project`,
                cancellable: false
            }, async (progress, __): Promise<Error | null> => {

                progress.report({ message: 'zipping ...' });

                const err = await compresser.Zip(prjRootDir, option, distDir);
                if (err) {
                    GlobalEvent.emit('msg', ExceptionToMessage(err, 'Warning'));
                } else {
                    progress.report({ message: 'export done !' });
                }

                await new Promise(resolve => setTimeout(resolve, 1500));
                return err;
            });

            if (prj) { // save prj
                prj.Save();
            }

        } catch (error) {
            GlobalEvent.emit('msg', ExceptionToMessage(error, 'Warning'));
        }

        this.exportLocked = false;
    }

    async ShowProjectVariables(item: ProjTreeItem) {

        const prj = this.dataProvider.GetProjectByIndex(item.val.projectIndex);
        const prjVars = prj.getProjectVariables();

        const vars: { [k: string]: string }[] = [];

        const cfg: SimpleUIConfig = {
            title: 'Project Variables',
            ref_id: `<project-variables>:${prj.getUid()}`,
            readonly: true,
            btns: {
                submit: {
                    title: '',
                    hidden: true
                },
                reset: {
                    title: '',
                    hidden: true
                }
            },
            items: {
                vars: {
                    type: 'table',
                    attrs: {},
                    name: '',
                    data: <SimpleUIConfigData_table>{
                        value: vars,
                        default: vars,
                    }
                }
            }
        };

        for (const key in prjVars) {
            vars.push({
                Name: key,
                Value: prjVars[key] || ''
            });
        }

        WebPanelManager.instance().showSimpleConfigUI(cfg, async () => {
            // nothing todo
        });
    }

    async AddSrcDir(item: ProjTreeItem) {

        const prj = this.dataProvider.GetProjectByIndex(item.val.projectIndex);

        const folderType = await vscode.window.showQuickPick<vscode.QuickPickItem>(
            [
                {
                    label: view_str$project$folder_type_virtual,
                    detail: view_str$project$folder_type_virtual_desc
                },
                {
                    label: view_str$project$folder_type_fs,
                    detail: view_str$project$folder_type_fs_desc
                }
            ],
            {
                placeHolder: view_str$project$sel_folder_type
            });

        if (folderType === undefined) {
            return;
        }

        // add folder from filesystem
        if (folderType.label === view_str$project$folder_type_fs) {

            const folderList = await vscode.window.showOpenDialog({
                canSelectMany: true,
                canSelectFiles: false,
                canSelectFolders: true,
                openLabel: view_str$dialog$add_to_source_folder,
                defaultUri: vscode.Uri.file(prj.GetRootDir().path),
            });

            if (folderList && folderList.length > 0) {

                for (const folderUri of folderList) {

                    const folderPath = folderUri.fsPath;
                    const rePath = prj.ToRelativePath(folderPath);

                    // if can't calculate repath, skip
                    if (rePath === undefined || rePath.trim() === '') {
                        GlobalEvent.emit('msg', newMessage('Warning', `Can't calculate relative path for '${folderPath}' !`));
                        continue;
                    }

                    if (rePath === '.' || rePath.split('/').every(p => p == '..')) { // ignore these folders
                        GlobalEvent.emit('msg', newMessage('Warning', `source folder can not be '${rePath}' !`));
                        continue;
                    }

                    prj.GetConfiguration().AddSrcDir(folderPath);
                }
            }
        }

        // add root virtual folder
        else {

            const folderName = await vscode.window.showInputBox({
                placeHolder: 'Input a folder name',
                ignoreFocusOut: true,
                validateInput: (input) => {
                    if (!this.vFolderNameMatcher.test(input)) {
                        return `must match '${this.vFolderNameMatcher.source}'`;
                    }
                }
            });

            if (folderName) {
                prj.getVirtualSourceManager().addFolder(folderName);
            }
        }
    }

    async RemoveSrcDir(item: ProjTreeItem) {

        if (!(item.val.obj instanceof File)) {
            return;
        }

        const srcDir = item.val.obj;

        const answer = await vscode.window.showInformationMessage(view_str$prompt$removeSrcDir.replace('{}', srcDir.path), txt_yes, txt_no);
        if (answer == txt_yes) {
            const prj = this.dataProvider.GetProjectByIndex(item.val.projectIndex);
            prj.GetConfiguration().RemoveSrcDir(srcDir.path);
        }
    }

    async refreshSrcRoot(item: ProjTreeItem) {

        const prj = this.dataProvider.GetProjectByIndex(item.val.projectIndex);

        switch (item.type) {
            case TreeItemType.OUTPUT_FOLDER:
                this.notifyUpdateOutputFolder(prj);
                break;
            case TreeItemType.V_FOLDER_ROOT:
                prj.refreshSourceRoot((<VirtualFolderInfo>item.val.obj).path);
                break;
            default:
                if (typeof item.val.value === 'string') {
                    prj.refreshSourceRoot(<string>item.val.value);
                }
                break;
        }
    }

    // virtual source

    async Virtual_folderAddFile(item: ProjTreeItem) {

        const project = this.dataProvider.GetProjectByIndex(item.val.projectIndex);
        const curFolder = <VirtualFolderInfo>item.val.obj;

        const fileUriList = await vscode.window.showOpenDialog({
            canSelectMany: true,
            canSelectFiles: true,
            canSelectFolders: false,
            openLabel: view_str$project$add_source,
            defaultUri: vscode.Uri.file(project.GetRootDir().path),
            filters: {
                'c/c++': ['c', 'cpp', 'cxx', 'cc', 'c++', 'h', 'hxx', 'hpp', 'inc'],
                'c/c++ source': ['c', 'cpp', 'cxx', 'cc', 'c++'],
                'c/c++ header': ['h', 'hxx', 'hpp', 'inc'],
                'asm': ['s', 'asm', 'a51'],
                'lib': ['lib', 'a', 'o', 'obj'],
                'any (*.*)': ['*']
            }
        });

        if (fileUriList === undefined) {
            return;
        }

        project.getVirtualSourceManager().addFiles(
            curFolder.path,
            fileUriList.map((uri) => uri.fsPath)
        );
    }

    async Virtual_folderAdd(item: ProjTreeItem) {

        const project = this.dataProvider.GetProjectByIndex(item.val.projectIndex);
        const curFolder = <VirtualFolderInfo>item.val.obj;

        const folderName = await vscode.window.showInputBox({
            placeHolder: 'Input a folder name',
            ignoreFocusOut: true,
            validateInput: (input) => {
                if (!this.vFolderNameMatcher.test(input)) {
                    return `must match '${this.vFolderNameMatcher.source}'`;
                }
            }
        });

        if (folderName) {
            project.getVirtualSourceManager().addFolder(folderName, curFolder.path);
        }
    }

    async Virtual_removeFolder(item: ProjTreeItem, items: ProjTreeItem[]) {
        if (items == undefined) items = [item];

        for (const folderItem of items) {
            const project = this.dataProvider.GetProjectByIndex(folderItem.val.projectIndex);
            const curFolder = <VirtualFolderInfo>folderItem.val.obj;

            const answer = await vscode.window.showInformationMessage(view_str$prompt$removeSrcDir.replace('{}', curFolder.path), txt_yes, txt_no);
            if (answer == txt_yes) {
                project.getVirtualSourceManager().removeFolder(curFolder.path);
            }
        }
    }

    async Virtual_renameFolder(item: ProjTreeItem) {

        const project = this.dataProvider.GetProjectByIndex(item.val.projectIndex);
        const curFolder = <VirtualFolderInfo>item.val.obj;

        const folderName = await vscode.window.showInputBox({
            prompt: 'Input the new name',
            ignoreFocusOut: true,
            value: curFolder.vFolder.name,
            validateInput: (input) => {
                if (!this.vFolderNameMatcher.test(input)) { return `must match '${this.vFolderNameMatcher.source}'`; }
                return undefined;
            }
        });

        if (folderName) {
            project.getVirtualSourceManager().renameFolder(curFolder.path, folderName);
        }
    }

    async Virtual_removeFile(item: ProjTreeItem, items: ProjTreeItem[]) {
        if (items == undefined) items = [item];

        for (const fileItem of items) {
            const project = this.dataProvider.GetProjectByIndex(fileItem.val.projectIndex);
            const curFile = <VirtualFileInfo>fileItem.val.obj;
            project.getVirtualSourceManager().removeFile(curFile.path);
        }
    }

    // filesystem folder

    async fs_folderAddFile(item: ProjTreeItem) {

        const folderPath = item.val.obj.path;

        const fName = await vscode.window.showInputBox({
            placeHolder: 'Input a file name',
            ignoreFocusOut: true
        });

        if (fName) {
            try {
                const filePath = folderPath + File.sep + fName;
                if (!File.IsFile(filePath)) { fs.writeFileSync(filePath, ''); }
            } catch (error) {
                GlobalEvent.emit('msg', ExceptionToMessage(error, 'Warning'));
            }
        }
    }

    async fs_folderAdd(item: ProjTreeItem) {

        const folderPath = item.val.obj.path;

        const folderName = await vscode.window.showInputBox({
            placeHolder: 'Input a folder name',
            ignoreFocusOut: true
        });

        if (folderName) {
            try {
                fs.mkdirSync(folderPath + File.sep + folderName);
            } catch (error) {
                GlobalEvent.emit('msg', ExceptionToMessage(error, 'Warning'));
            }
        }
    }

    private async modifyExtraCompilerArgs_forFile(project: AbstractProject, item: ProjTreeItem) {
        const isChinese = getLocalLanguageType() == LanguageIndexs.Chinese;

        let fspath: string | undefined;
        let virtpath: string | undefined;

        if (item.type === TreeItemType.V_FILE_ITEM) {
            virtpath = (<VirtualFileInfo>item.val.obj).path;
        }

        if (item.val.value instanceof File) { // if value is a file, use it
            fspath = project.toRelativePath(item.val.value.path);
        }

        if (!fspath)
            return;

        const extraArgs = project.getSourceExtraArgsCfg();
        if (!extraArgs)
            return;

        const argsMap = project.getExtraArgsForSource(fspath, virtpath, extraArgs);
        const absPattern = project.getExtraArgsAbsPatternForSource(fspath, virtpath, extraArgs);
        const ccOptions = absPattern ? (argsMap[absPattern] || '') : '';

        // merge all inherited args
        let inheritedArgs: string = '';
        for (const key in argsMap) {
            const val = argsMap[key]?.trim();
            if (key != absPattern && val) {
                inheritedArgs = `${inheritedArgs} ${val}`;
            }
        }
        inheritedArgs = inheritedArgs.trim();

        const ui_cfg: SimpleUIConfig = {
            ref_id: `<file-options>:${fspath}`,
            title: isChinese
                ? `修改编译选项（文件：${NodePath.basename(fspath)}）`
                : `Modify Compiler Options (file: ${NodePath.basename(fspath)})`,
            items: {},
        };

        // option: isAlwaysInBuild
        let isAlwaysInBuild = false;
        if (extraArgs.alwaysBuildSourceFiles)
            isAlwaysInBuild = extraArgs.alwaysBuildSourceFiles
                .findIndex(p => project.comparePath(p, <string>fspath)) !== -1;
        ui_cfg.items['always_in_build'] = {
            type: 'bool',
            attrs: {},
            name: isChinese ? '总是编译该文件' : 'Always In Build',
            data: <SimpleUIConfigData_boolean>{
                value: isAlwaysInBuild,
                default: isAlwaysInBuild,
            }
        };

        if (inheritedArgs) { // 继承于其他匹配模式
            ui_cfg.items['inherit'] = {
                type: 'input',
                attrs: { readonly: true },
                name: isChinese
                    ? `继承于其他匹配模式的选项（详见 'files.options.yml' 文件）`
                    : `Inherited Options (from other pattern, check your 'files.options.yml' file for details !)`,
                data: <SimpleUIConfigData_input>{
                    value: inheritedArgs,
                    default: inheritedArgs
                }
            };
        }

        ui_cfg.items['args'] = {
            type: 'input',
            attrs: {},
            name: isChinese ? '附加编译选项' : 'Append Compiler Options',
            data: <SimpleUIConfigData_input>{
                placeHolder: [
                    `For Append   Options. e.g. " -Os -flto " ...`,
                    `For Replace  Options. e.g. " $<replace:-O1/-O2> " ...`,
                    `For Override Options. e.g. " $<override:-I./include -g -O2 -flto> " ...`,
                ].join(os.EOL),
                value: ccOptions,
                default: ccOptions,
            },
        };

        try {
            const db = project.getSourceCompileDatabase(fspath);
            if (db) {
                ui_cfg.items['current_commands'] = {
                    type: 'input',
                    attrs: { readonly: true },
                    name: isChinese ? `当前编译命令` : `Current Compiler Commands`,
                    data: <SimpleUIConfigData_input>{
                        value: db.command,
                        default: db.command
                    }
                };
            }
        } catch (error) {
            // nothing todo
        }

        // option: memoryAssign
        //   Only for AC5 and AC6 Compiler
        const supportMemeoryAssignment = project.supportArmccMemeoryAssignment();
        if (supportMemeoryAssignment) {

            ui_cfg.items['mem_assign_divider'] = {
                type: 'divider',
                attrs: {},
                name: '',
                data: <SimpleUIConfigData_divider>{}
            };

            ui_cfg.items['mem_assign_tag'] = {
                type: 'text',
                attrs: { style: 'font-weight: bold;' },
                name: '',
                data: <SimpleUIConfigData_text>{
                    subType: 'raw',
                    value: isChinese ? `存储器分配` : `Memory Assignment`
                }
            };

            const toolchainName = project.getToolchain().name;
            if (toolchainName === 'AC6') {
                ui_cfg.items['lto_tip'] = {
                    type: 'text',
                    attrs: {},
                    name: 'LTO_note',
                    data: <SimpleUIConfigData_text>{
                        value: isChinese
                            ? '请注意：如果启用了LTO，则存储器分配选项会失效。'
                            : 'Notice: The memory assignment options will not take effect if you enable the LTO. '
                    }
                };
            }

            const toolchainConfig = project.GetConfiguration<ArmBaseCompileData>().config.toolchainConfig;
            const ramLayout = toolchainConfig.storageLayout.RAM;
            const romLayout = toolchainConfig.storageLayout.ROM;

            // Use for config enum. 
            const roList: string[] = ['default'];
            const rwList: string[] = ['default'];

            // Use for config enum Description. 
            const roListDesc: string[] = ['default'];
            const rwListDesc: string[] = ['default'];
            romLayout.forEach((value) => {
                roList.push(getRamRomName(value));
                roListDesc.push(`${getRamRomName(value)} (${getRamRomRange(value)})`);
            });

            ramLayout.forEach((value) => {
                roList.push(getRamRomName(value));
                roListDesc.push(`${getRamRomName(value)} (${getRamRomRange(value)})`);

                rwList.push(getRamRomName(value));
                rwListDesc.push(`${getRamRomName(value)} (${getRamRomRange(value)})`);
            });

            // Find file memory assignment.
            let memoryAssign = undefined;
            if (extraArgs.memoryAssign) {
                for (const filePath in extraArgs.memoryAssign) {
                    if (virtpath && project.comparePath(filePath, <string>virtpath)) {
                        // If item is virtual path, compare with virtual path first.
                        memoryAssign = extraArgs.memoryAssign[filePath];
                        break;
                    } else if (project.comparePath(filePath, <string>fspath)) {
                        // Don't have virtual path, compare with real file path.
                        memoryAssign = extraArgs.memoryAssign[filePath];
                        break;
                    }
                }
            }

            // Show in GUI config. 
            let roValue = 0;
            let rwValue = 0;
            let ziValue = 0;

            if (memoryAssign) {
                if (memoryAssign.RO) {
                    // Assign the RO memory.
                    roValue = roList.indexOf(memoryAssign.RO);
                    // No found, may it contains illegal vaule. Set it default.
                    roValue = roValue === -1 ? 0 : roValue;
                }
                if (memoryAssign.RW) {
                    rwValue = rwList.indexOf(memoryAssign.RW);
                    // No found, may it contains illegal vaule. Set it default.
                    rwValue = rwValue === -1 ? 0 : rwValue;
                }
                if (memoryAssign.ZI) {
                    ziValue = rwList.indexOf(memoryAssign.ZI);
                    // No found, may it contains illegal vaule. Set it default.
                    ziValue = ziValue === -1 ? 0 : ziValue;
                }
            }


            ui_cfg.items['ro_data_assign'] = {
                type: 'options',
                attrs: { style: 'width: 300px;' },
                name: isChinese ? '常量/代码分配' : 'Code / Const Data Assignment',
                data: <SimpleUIConfigData_options>{
                    value: roValue,
                    default: 0,
                    enum: roList,
                    enumDescriptions: roListDesc,
                }
            };

            ui_cfg.items['zi_data_assign'] = {
                type: 'options',
                attrs: { style: 'width: 300px;' },
                name: isChinese ? 'ZI数据分配' : 'Zero Initialized Data Assignment',
                data: <SimpleUIConfigData_options>{
                    value: ziValue,
                    default: 0,
                    enum: rwList,
                    enumDescriptions: rwListDesc,
                }
            };

            ui_cfg.items['rw_data_assign'] = {
                type: 'options',
                attrs: { style: 'width: 300px;' },
                name: isChinese ? '其他数据分配' : 'Other Data Assignment',
                data: <SimpleUIConfigData_options>{
                    value: rwValue,
                    default: 0,
                    enum: rwList,
                    enumDescriptions: rwListDesc,
                }
            };
        }

        WebPanelManager.instance().showSimpleConfigUI(ui_cfg, async (new_cfg) => {

            const nArgs = (<SimpleUIConfigData_input>new_cfg.items['args'].data).value.replace(/\r\n|\n/g, ' ').trim();

            let pattern: string;

            if (virtpath) {
                pattern = virtpath;
            } else {
                pattern = project.toRelativePath(<string>fspath)
                    .replace(/\.\.\//g, '')
                    .replace(/\.\//g, '');
            }

            let category: string = 'files';
            const fileOptions: any = extraArgs;

            if (virtpath) {
                category = 'virtualPathFiles';
            }

            if (!fileOptions[category])
                fileOptions[category] = {};

            if (nArgs) {
                fileOptions[category][pattern] = nArgs;
            } else {
                if (fileOptions[category][pattern] != undefined)
                    delete fileOptions[category][pattern];
            }

            // option: always in build
            const isAlwaysInBuild = (<SimpleUIConfigData_boolean>new_cfg.items['always_in_build'].data).value;
            let alwaysBuildSourceFiles: string[] = fileOptions.alwaysBuildSourceFiles || [];
            if (isAlwaysInBuild) {
                alwaysBuildSourceFiles.push(<string>fspath);
            } else {
                const idx = alwaysBuildSourceFiles.findIndex(p => project.comparePath(p, <string>fspath));
                if (idx !== -1) {
                    alwaysBuildSourceFiles.splice(idx, 1);
                }
            }
            alwaysBuildSourceFiles = ArrayDelRepetition(alwaysBuildSourceFiles);
            fileOptions.alwaysBuildSourceFiles = alwaysBuildSourceFiles.length > 0 ? alwaysBuildSourceFiles : undefined;

            // option: memoryAssign
            //   Only for AC5 and AC6 Compiler
            if (supportMemeoryAssignment) {
                const memoryAssign = extraArgs.memoryAssign || {};

                let new_cfg_item = <SimpleUIConfigData_options>new_cfg.items['ro_data_assign'].data;
                const roAssign = new_cfg_item.value;
                if (roAssign) {
                    // Create item when it not exist. 
                    memoryAssign[pattern] = memoryAssign[pattern] || {};
                    memoryAssign[pattern].RO = new_cfg_item.enum[roAssign];
                } else {
                    // If RO assign is empty, remove it.
                    if (memoryAssign[pattern] && memoryAssign[pattern].RO) {
                        delete memoryAssign[pattern].RO;
                    }
                }

                new_cfg_item = <SimpleUIConfigData_options>new_cfg.items['zi_data_assign'].data;
                const ziAssign = new_cfg_item.value;
                if (ziAssign) {
                    // Create item when it not exist. 
                    memoryAssign[pattern] = memoryAssign[pattern] || {};
                    memoryAssign[pattern].ZI = new_cfg_item.enum[ziAssign];
                } else {
                    // If ZI assign is empty, remove it.
                    if (memoryAssign[pattern] && memoryAssign[pattern].ZI) {
                        delete memoryAssign[pattern].ZI;
                    }
                }

                new_cfg_item = <SimpleUIConfigData_options>new_cfg.items['rw_data_assign'].data;
                const rwAssign = new_cfg_item.value;
                if (rwAssign) {
                    // Create item when it not exist. 
                    memoryAssign[pattern] = memoryAssign[pattern] || {};
                    memoryAssign[pattern].RW = new_cfg_item.enum[rwAssign];
                } else {
                    // If RW assign is empty, remove it.
                    if (memoryAssign[pattern] && memoryAssign[pattern].RW) {
                        delete memoryAssign[pattern].RW;
                    }
                }

                if (memoryAssign[pattern] && Object.keys(memoryAssign[pattern]).length === 0) {
                    delete memoryAssign[pattern]; // remove empty assign
                }

                if (extraArgs.memoryAssign === undefined && Object.keys(memoryAssign).length > 0) {
                    // Create memoryAssign when it not exist and has assigned memory.
                    extraArgs.memoryAssign = memoryAssign;
                }

                if (extraArgs.memoryAssign && Object.keys(extraArgs.memoryAssign).length === 0) {
                    // Remove memoryAssign when it is empty.
                    delete extraArgs.memoryAssign;
                }
            }

            project.setSourceExtraArgsCfg(extraArgs);
            project.onSourceCompilerOptionsChanged();

            // update explorer
            if (virtpath) {
                project.getVirtualSourceManager().notifyUpdateFile(<string>virtpath);
            } else {
                project.getNormalSourceManager().notifyUpdateFile(project.toAbsolutePath(<string>fspath));
            }
        });
    }

    private async modifyExtraCompilerArgs_forFolder(project: AbstractProject, item: ProjTreeItem) {

        let folderpath: string | undefined;
        let isVirtpath: boolean | undefined;
        const isChinese = getLocalLanguageType() == LanguageIndexs.Chinese;

        if (item.type == TreeItemType.V_FOLDER ||
            item.type == TreeItemType.V_FOLDER_ROOT) {
            folderpath = (<VirtualFileInfo>item.val.obj).path;
            isVirtpath = true;
        }

        if (item.val.obj instanceof File) { // if value is a file, use it
            folderpath = project.toRelativePath(item.val.obj.path);
        }

        if (!folderpath)
            return;

        const extraArgs = project.getSourceExtraArgsCfg();
        if (!extraArgs)
            return;

        const argsMap = project.getExtraArgsForFolder(folderpath, isVirtpath, extraArgs);
        const absPattern = project.getExtraArgsAbsPatternForFolder(folderpath, isVirtpath, extraArgs);
        const ccOptions = absPattern ? (argsMap[absPattern] || '') : '';

        // merge all inherited args
        let inheritedOptions: string = '';
        for (const key in argsMap) {
            const val = argsMap[key]?.trim();
            if (key != absPattern && val) {
                inheritedOptions = `${inheritedOptions} ${val}`;
            }
        }
        inheritedOptions = inheritedOptions.trim();

        const ui_cfg: SimpleUIConfig = {
            ref_id: `<folder-options>:${folderpath}`,
            title: isChinese
                ? `修改编译选项（目录：${NodePath.basename(folderpath)}）`
                : `Modify Compiler Options (dir: ${NodePath.basename(folderpath)})`,
            items: {},
        };

        if (inheritedOptions) { // 继承于其他匹配模式
            ui_cfg.items['inherit'] = {
                type: 'input',
                attrs: { readonly: true },
                name: isChinese
                    ? `继承于其他匹配模式的选项（详见 'files.options.yml' 文件）`
                    : `Inherited Options (from other pattern, check your 'files.options.yml' file for details !)`,
                data: <SimpleUIConfigData_input>{
                    value: inheritedOptions,
                    default: inheritedOptions
                }
            };
        }

        ui_cfg.items['args'] = {
            type: 'input',
            attrs: {},
            name: isChinese ? '附加编译选项' : 'Append Compiler Options',
            data: <SimpleUIConfigData_input>{
                placeHolder: [
                    `For Append   Options. e.g. " -Os -flto " ...`,
                    `For Replace  Options. e.g. " $<replace:-O1/-O2> " ...`,
                    `For Override Options. e.g. " $<override:-I./include -g -O2 -flto> " ...`,
                ].join(os.EOL),
                value: ccOptions,
                default: ccOptions,
            },
        };

        const isRecursived = absPattern ? absPattern.endsWith('/**') : false;

        ui_cfg.items['recursive'] = {
            type: 'bool',
            attrs: {},
            name: isChinese ? '递归应用到所有子目录和文件' : 'Recurse All Children',
            data: <SimpleUIConfigData_boolean>{
                value: isRecursived,
                default: isRecursived,
            },
        };

        WebPanelManager.instance().showSimpleConfigUI(ui_cfg, async (new_cfg) => {

            const nArgs = (<SimpleUIConfigData_input>new_cfg.items['args'].data).value.replace(/\r\n|\n/g, ' ').trim();
            const isRecursive = (<SimpleUIConfigData_boolean>new_cfg.items['recursive'].data).value;

            let pattern: string;

            if (isVirtpath) {
                pattern = <string>folderpath;
            } else {
                pattern = project.toRelativePath(<string>folderpath).replace(/\.\.\//g, '').replace(/\.\//g, '');
            }

            let category: string = 'files';
            const argsConf: any = extraArgs;

            if (isVirtpath) {
                category = 'virtualPathFiles';
            }

            if (!argsConf[category])
                argsConf[category] = {};

            if (absPattern)
                delete argsConf[category][absPattern];

            if (nArgs) {
                argsConf[category][pattern + (isRecursive ? '/**' : '/*')] = nArgs;
            } else {
                for (const suffix of ['', '/*', '/**']) { // clear all
                    if (argsConf[category][pattern + suffix] != undefined)
                        delete argsConf[category][pattern + suffix];
                }
            }

            project.setSourceExtraArgsCfg(extraArgs);
            project.onSourceCompilerOptionsChanged();

            // update explorer
            if (isVirtpath) {
                project.getVirtualSourceManager().notifyUpdateFolder(<string>folderpath);
            } else {
                project.getNormalSourceManager().notifyUpdateFolder(project.toAbsolutePath(<string>folderpath));
            }
        });
    }

    async modifyExtraCompilerArgs(type: 'file' | 'folder', item: ProjTreeItem) {

        const project = this.getProjectByTreeItem(item);
        if (!project)
            return;

        if (type == 'file') {
            this.modifyExtraCompilerArgs_forFile(project, item);
        }
        else { // folder
            this.modifyExtraCompilerArgs_forFolder(project, item);
        }
    }

    private async showDisassemblyForElf(elfPath: string, prj: AbstractProject) {

        try {

            const toolchainName = prj.getToolchain().name;

            // prepare command
            let exeFile: File;
            let cmds: string[];

            const dasmFile = File.fromArray([prj.getOutputFolder().path, `${NodePath.basename(elfPath)}.edasm`]);
            if (dasmFile.IsFile()) { // force del tmp file
                try { fs.unlinkSync(dasmFile.path); } catch (error) { }
            }

            if (isGccFamilyToolchain(toolchainName)) { // gcc
                const toolchain = ToolchainManager.getInstance().getToolchainByName(toolchainName);
                if (!toolchain) throw Error(`Can't get toolchain '${toolchainName}'`);
                const toolPrefix = toolchain.getToolchainPrefix ? toolchain.getToolchainPrefix() : '';
                exeFile = File.fromArray([prj.getToolchain().getToolchainDir().path, 'bin', `${toolPrefix}objdump${exeSuffix()}`]);
                if (!exeFile.IsFile()) throw Error(`Not found '${exeFile.name}' !`);
                cmds = ['-S', '-l', elfPath, '>', dasmFile.path];
                // https://interrupt.memfault.com/blog/gnu-binutils#new-feature-visualize-jumps
                const binutilsVer = getGccBinutilsVersion(exeFile.dir, toolPrefix, 'objdump');
                if (binutilsVer && compareVersion(binutilsVer, '2.34') > 0) {
                    cmds = ['--visualize-jumps'].concat(cmds);
                }
            }
            else if (toolchainName.startsWith('AC')) { // armcc
                exeFile = File.fromArray([prj.getToolchain().getToolchainDir().path, 'bin', `fromelf${exeSuffix()}`]);
                if (!exeFile.IsFile()) throw Error(`Not found '${exeFile.name}' !`);
                cmds = ['-c', elfPath, '--output', dasmFile.path];
            }
            else if (toolchainName == 'LLVM_ARM') {
                exeFile = File.from(prj.getToolchain().getToolchainDir().path, 'bin', `llvm-objdump${exeSuffix()}`);
                if (!exeFile.IsFile()) throw Error(`Not found '${exeFile.name}' !`);
                cmds = ['-S', '-l', elfPath, '>', dasmFile.path];
            }
            else if (toolchainName == 'GNU_SDCC_MCS51') {
                exeFile = File.from(prj.getToolchain().getToolchainDir().path, 'bin', `i51-elf-objdump${exeSuffix()}`);
                if (!exeFile.IsFile()) throw Error(`Not found '${exeFile.name}' !`);
                cmds = ['-S', '-l', elfPath, '>', dasmFile.path];
            }
            else {
                throw new Error(`Not support showDisassemblyForElf for toolchain: '${toolchainName}' !`);
            }

            // do disassembly code
            const err = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Disassemble program',
                cancellable: false,
            }, async (progress): Promise<Error | undefined> => {
                try {
                    progress.report({ message: elfPath });
                    await new Promise((resolve) => { setTimeout(() => resolve(undefined), 500); });

                    // run
                    const cmdLine = CmdLineHandler.getCommandLine(exeFile.path, cmds, false);
                    child_process.execSync(cmdLine, { encoding: 'ascii' });

                    progress.report({ message: 'Done !' });
                    await new Promise((resolve) => { setTimeout(() => resolve(undefined), 500); });
                } catch (error) {
                    return error;
                }
            });

            if (err) { throw err; }

            // check result file
            if (!dasmFile.IsFile()) {
                throw new Error(`Not found disassembly result file: '${dasmFile.path}' !`);
            }

            // show
            vscode.window.showTextDocument(vscode.Uri.file(dasmFile.path), {
                preview: true,
                viewColumn: vscode.ViewColumn.Two
            });

        } catch (error) {
            GlobalEvent.emit('msg', ExceptionToMessage(error, 'Warning'));
        }
    }

    async showDisassembly(uri: vscode.Uri, prj?: AbstractProject) {

        try {

            // check condition
            const activePrj = prj || this.dataProvider.getActiveProject();
            if (!activePrj)
                throw new Error('Not found active project !');

            let srcPath = uri.fsPath;

            // prehandle src name
            if (/\.(?:elf|axf)\.info$/i.test(srcPath)) { // it's axf.info readonly doc
                srcPath = NodePath.dirname(srcPath) + NodePath.sep + NodePath.basename(srcPath, '.info');
            }

            if (/\.(?:elf|axf)$/i.test(srcPath)) { // it's an executable file, use it
                await this.showDisassemblyForElf(srcPath, activePrj);
                return;
            }

            // get obj file
            const objPath = activePrj.getSourceObjectPath(srcPath);

            if (typeof objPath != 'string') {
                throw new Error(`Not found any reference for this source file !, [path]: '${srcPath}'`);
            }

            if (!File.IsFile(objPath)) {
                throw new Error(`Object file is not existed !, [path]: '${objPath}'`);
            }

            // prepare command
            let exeFile: File;
            let cmds: string[];

            const tmpFile = File.fromArray([os.tmpdir(), `${NodePath.basename(srcPath)}.edasm`]);
            if (tmpFile.IsFile()) { // force del tmp file
                try { fs.unlinkSync(tmpFile.path); } catch (error) { }
            }

            const toolchainName = activePrj.getToolchain().name;

            if (isGccFamilyToolchain(toolchainName)) { // gcc
                const toolchain = ToolchainManager.getInstance().getToolchainByName(toolchainName);
                if (!toolchain) throw new Error(`Can't get toolchain '${toolchainName}'`);
                const toolPrefix = toolchain.getToolchainPrefix ? toolchain.getToolchainPrefix() : '';
                exeFile = File.fromArray([activePrj.getToolchain().getToolchainDir().path, 'bin', `${toolPrefix}objdump${exeSuffix()}`]);
                if (!exeFile.IsFile()) throw Error(`Not found '${exeFile.name}' !`);
                cmds = ['-S', '-l', objPath, '>', tmpFile.path];
                // https://interrupt.memfault.com/blog/gnu-binutils#new-feature-visualize-jumps
                const binutilsVer = getGccBinutilsVersion(exeFile.dir, toolPrefix, 'objdump');
                if (binutilsVer && compareVersion(binutilsVer, '2.34') > 0) {
                    cmds = ['--visualize-jumps'].concat(cmds);
                }
            }
            else if (toolchainName.startsWith('AC')) { // armcc
                exeFile = File.fromArray([activePrj.getToolchain().getToolchainDir().path, 'bin', `fromelf${exeSuffix()}`]);
                if (!exeFile.IsFile()) throw Error(`Not found '${exeFile.name}' !`);
                cmds = ['-c', objPath, '--output', tmpFile.path];
            }
            else if (toolchainName == 'LLVM_ARM') {
                exeFile = File.from(activePrj.getToolchain().getToolchainDir().path, 'bin', `llvm-objdump${exeSuffix()}`);
                if (!exeFile.IsFile()) throw Error(`Not found '${exeFile.name}' !`);
                cmds = ['-S', '-l', objPath, '>', tmpFile.path];
            }
            else if (toolchainName.includes('SDCC')) {
                const objFile = File.from(objPath);
                const outAsmPath = NodePath.join(objFile.dir, objFile.noSuffixName + '.asm');
                vscode.window.showTextDocument(vscode.Uri.file(outAsmPath), { preview: true });
                return;
            }
            else { // Not support
                throw new Error(`Not support showDisassembly for toolchain: '${toolchainName}' !`);
            }

            // do disassembly code
            const cmdLine = CmdLineHandler.getCommandLine(exeFile.path, cmds, false);
            child_process.execSync(cmdLine, { encoding: 'ascii' });

            // check result file
            if (!tmpFile.IsFile()) {
                throw new Error(`Not found disassembly result file: '${tmpFile.path}' !`);
            }

            // parse result
            const asmLines = tmpFile.Read().split(/\r\n|\n/);
            const asmFile = `${srcPath}.edasm`;
            const asmFileUri = vscode.Uri.parse(VirtualDocument.instance().getUriByPath(asmFile));

            if (tmpFile.IsFile()) { // del tmp file
                try { fs.unlinkSync(tmpFile.path); } catch (error) { }
            }

            // try jump to target line in asm
            let selection: vscode.Range | undefined;

            if (vscode.window.activeTextEditor &&
                vscode.window.activeTextEditor.document.uri.toString() == uri.toString()) {

                // for gcc toolchain
                // jump to example: 
                //          c:/xxx/xxx\sourceName.c:123
                //
                if (isGccFamilyToolchain(toolchainName) || toolchainName == 'LLVM_ARM') {

                    const activeTextEditor = vscode.window.activeTextEditor;
                    const curLine = activeTextEditor.selection.start.line;

                    const safeName = NodePath.basename(srcPath)
                        .replace(/\./g, String.raw`\.`)
                        .replace(/\(/g, String.raw`\(`).replace(/\)/g, String.raw`\)`)
                        .replace(/\[/g, String.raw`\[`).replace(/\]/g, String.raw`\]`)
                        .replace(/\{/g, String.raw`\{`).replace(/\}/g, String.raw`\}`)
                        .replace(/\^/g, String.raw`\^`).replace(/\$/g, String.raw`\$`)
                        .replace(/\*/g, String.raw`\*`)
                        .replace(/\+/g, String.raw`\+`)
                        .replace(/\?/g, String.raw`\?`)
                        .replace(/\|/g, String.raw`\|`);

                    const lmatcher = new RegExp(`.+\\b${safeName}:\\d+\\b`);
                    const tMatcher = new RegExp(`.+\\b${safeName}:${curLine + 1}\\b`);

                    for (let idx = 0; idx < asmLines.length; idx++) {
                        const line = asmLines[idx];
                        if (lmatcher.test(line)) {
                            // found target line
                            if (selection == undefined && tMatcher.test(line)) {
                                const pos = new vscode.Position(idx + 1, 0);
                                selection = new vscode.Range(pos, pos);
                            }
                            // clear line number content
                            asmLines[idx] = '';
                        }
                    }
                }

                // for armcc toolchain
                // jump to example: 
                //          ** Section #4 'i.delay' (SHT_PROGBITS) [SHF_ALLOC + SHF_EXECINSTR]
                //
                else if (toolchainName.startsWith('AC')) {
                    const matcher = /^\s*\*\* Section #\d+ 'i\./;
                    for (let idx = 0; idx < asmLines.length; idx++) {
                        const line = asmLines[idx];
                        if (matcher.test(line)) {
                            const pos = new vscode.Position(idx, 0);
                            selection = new vscode.Range(pos, pos);
                            break; // found it, exit
                        }
                    }
                }
            }

            // show
            VirtualDocument.instance().updateDocument(asmFile, asmLines.join('\n'));
            vscode.window.showTextDocument(asmFileUri, {
                preview: true,
                viewColumn: vscode.ViewColumn.Two,
                selection: selection
            });

        } catch (error) {
            GlobalEvent.emit('msg', ExceptionToMessage(error, 'Warning'));
        }
    }

    async showCmsisConfigWizard(uri: vscode.Uri) {
        WebPanelManager.instance().showCmsisConfigWizard(uri);
    }

    async cppcheckFile(uri: vscode.Uri) {

        // !!! COMMING SOON !!!

        /* const path: any = SettingManager.GetInstance().getCppcheckerExe();
        if (!path) {
            const done = await ResInstaller.instance().setOrInstallTools('cppcheck', `Not found 'cppcheck${exeSuffix()}' !`);
            if (!done) { return; }
        }

        const exeFile = new File(path);
        if (!exeFile.IsFile()) {
            const done = await ResInstaller.instance().setOrInstallTools('cppcheck', `Not found 'cppcheck${exeSuffix()}' ! [path]: ${exeFile.path}`);
            if (!done) { return; }
        }

        const activePrj = this.dataProvider.getActiveProject();
        if (!activePrj) {
            GlobalEvent.emit('msg', newMessage('Warning', 'No actived project !'));
            return;
        }


        const cmds: string[] = [
            `${exeFile.path}`,
            `--enable=warning`,
            `--enable=performance`,
            `--enable=portability`
        ];

        runShellCommand('cppcheck-file', cmds.join(' ')); */
    }

    async cppcheckProject(item?: ProjTreeItem) {

        const path: any = SettingManager.GetInstance().getCppcheckerExe();
        if (!path) {
            await ResInstaller.instance().setOrInstallTools('cppcheck', `Not found 'cppcheck${exeSuffix()}' !`);
            return;
        }

        const exeFile = new File(path);
        if (!exeFile.IsFile()) {
            await ResInstaller.instance().setOrInstallTools('cppcheck', `Not found 'cppcheck${exeSuffix()}', [path]: '${exeFile.path}'`);
            return;
        }

        const cppcheck_has_platform = (plat: string): boolean => {
            return File.IsFile(`${exeFile.dir}/platforms/${plat}.xml`);
        };
        const cppcheck_has_cfg = (cfgname: string): boolean => {
            return File.IsFile(`${exeFile.dir}/cfg/${cfgname}.cfg`);
        };

        const prj = this.getProjectByTreeItem(item);
        if (!prj) {
            GlobalEvent.emit('msg', newMessage('Warning', 'Not found project by this item !'));
            return;
        }

        const confTmpFile = File.fromArray([prj.getWsFile().dir, 'conf.cppcheck']);
        if (!confTmpFile.IsFile()) { /* if not found cppcheck conf template, create it ! */
            try {
                const tmpPath = ResManager.GetInstance().GetAppDataDir().path + File.sep + 'cppcheck.xml';
                fs.copyFileSync(tmpPath, confTmpFile.path);
            } catch (error) {
                GlobalEvent.emit('error', error);
                return;
            }
        }

        /* prepare cppcheck */
        const cmds: string[] = [];
        const confRootDir: File = File.fromArray([prj.ToAbsolutePath(prj.getOutputRoot()), '.cppcheck']);
        const confFile: File = File.fromArray([confRootDir.path, 'tmp.cppcheck']);
        confRootDir.CreateDir(true);
        let cppcheckConf: string = confTmpFile.Read();

        /* get project source info */
        const toolchain = prj.getToolchain();
        const prjConfig = prj.GetConfiguration();
        const depMerge = prjConfig.GetAllMergeDep();
        const builderOpts = prjConfig.toolchainConfigModel.getOptions();
        const defMacros: string[] = ['__VSCODE_CPPTOOL']; /* it's for internal force include header */
        const defList: string[] = defMacros.concat(depMerge.defineList);
        depMerge.incList = ArrayDelRepetition(depMerge.incList.concat(prj.getSourceIncludeList()));
        const includeList: string[] = depMerge.incList.map(p => prj.resolveEnvVar(p)).map(p => File.ToUnixPath(confRootDir.ToRelativePath(p) || p));
        const intrHeader: string[] | undefined = toolchain.getForceIncludeHeaders();

        const getSourceList = (project: AbstractProject): string[] => {

            const srcList: string[] = [];
            const fGoups = project.getFileGroups();
            const srcFilter = AbstractProject.cppfileFilter;

            for (const group of fGoups) {
                // skip disabled group
                if (group.disabled) continue;
                for (const source of group.files) {
                    // skip disabled file
                    if (source.disabled) continue;
                    // skip non-source and asm file
                    if (!srcFilter.test(source.file.path)) continue;
                    const rePath = confRootDir.ToRelativePath(source.file.path);
                    srcList.push(rePath || source.file.path);
                }
            }

            return srcList;
        };

        /* set cppcheck conf */
        const is8bit = prjConfig.config.type == 'C51';
        const cfgList: string[] = ['gnu'];

        if (['Keil_C51'].includes(toolchain.name)) {
            GlobalEvent.emit('msg', newMessage('Warning', `We don't support cppcheck for '${toolchain.name}' !`));
            return;
        }

        toolchain.getInternalDefines(<any>prjConfig.config.toolchainConfig, builderOpts).forEach(d => {
            if (d.type === 'var')
                defList.push(`${d.name}=${d.value}`);
        });

        if (toolchain.name == 'ANY_GCC' && toolchain.getToolchainPrefix) {
            const prefix = toolchain.getToolchainPrefix();
            if (/avr/i.test(prefix)) { // it's avr compiler
                cfgList.push('avr');
            } else if (prefix == '') { // it's local compiler
                cfgList.push('std');
            }
        }

        const fixedDefList = defList.map((str) => str.replace(/"/g, '&quot;'));

        let cppcheck_plat: string = 'unix32';
        if (is8bit) {
            if (os.platform() == 'win32' && cppcheck_has_platform('mcs51'))
                cppcheck_plat = 'mcs51';
            else
                cppcheck_plat = 'avr8';
        }

        const sourceList = getSourceList(prj);
        cppcheckConf = cppcheckConf
            .replace('${cppcheck_build_folder}', File.normalize(prj.getOutputRoot()))
            .replace('${platform}', cppcheck_plat)
            .replace('${lib_list}', cfgList.map((str) => `<library>${escapeXml(str)}</library>`).join(os.EOL + '\t\t'))
            .replace('${include_list}', includeList.map((str) => `<dir name="${escapeXml(str)}/"/>`).join(os.EOL + '\t\t'))
            .replace('${macro_list}', fixedDefList.map((str) => `<define name="${escapeXml(str)}"/>`).join(os.EOL + '\t\t'))
            .replace('${source_list}', sourceList.map((str) => `<dir name="${escapeXml(str)}"/>`).join(os.EOL + '\t\t'));

        confFile.Write(cppcheckConf);

        /* make command */

        let max_cpus = os.cpus().length;
        if (max_cpus > sourceList.length * 2) max_cpus = sourceList.length;
        if (max_cpus < 4) max_cpus = 4;
        if (max_cpus > 12) max_cpus = 12;
        cmds.push(
            '-j', max_cpus.toString(),
            `--error-exitcode=0`,
            `--report-progress`,
            `--enable=warning`,
            `--enable=performance`,
            `--enable=portability`,
            `--project=${confFile.path}`,
            `--relative-paths=${prj.getWsFile().dir}`
        );

        if (intrHeader && intrHeader.length > 0) {
            for (const path of intrHeader) {
                cmds.push(`--include=${path}`);
            }
        }

        /* launch process */

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Checking Project',
            cancellable: true
        }, (progress, cancel): Thenable<void> => {

            return new Promise((_resolve) => {

                let isResolved = false;
                const resolve = (data: any | undefined) => {
                    if (isResolved) return;
                    isResolved = true;
                    _resolve(data);
                };

                const process = new ExeCmd();
                const opts: ExecutableOption = {
                    encoding: 'utf8',
                    shell: ResManager.GetInstance().getCMDPath(),
                    env: concatSystemEnvPath([exeFile.dir, `${exeFile.dir}${File.sep}cfg`])
                };

                // user want cancel operations
                cancel.onCancellationRequested(() => {
                    const pid = process.pid();
                    if (pid) { kill(pid); }
                });

                // user canceled, but process not launch, so we need
                // kill process after it launched
                process.on('launch', () => {
                    if (cancel.isCancellationRequested) {
                        const pid = process.pid();
                        if (pid) { kill(pid); }
                    }
                });

                // parse cppcheck progress
                // example: '29/37 files checked 96% done'
                const progMatcher = /^\d+\/\d+\s+files\s+checked\s+(\d+)%/i;
                let prev_prog: number = 0;
                process.on('line', (line) => {
                    const mRes = progMatcher.exec(line);
                    if (mRes && mRes.length > 1) {
                        const cur_prog = parseInt(mRes[1]);
                        progress.report({ message: line, increment: cur_prog - prev_prog });
                        prev_prog = cur_prog;
                    }
                    else if (line.startsWith('Checking') || line.startsWith('checking')) {
                        return; // ignore other progress info
                    }
                    else { // other msg ? output to panel
                        this.cppcheck_out.appendLine(line);
                    }
                });

                const pattern = {
                    "regexp": "^(.+):(\\d+):(\\d+):\\s+(\\w+):\\s+(.*)$",
                    "file": 1,
                    "line": 2,
                    "column": 3,
                    "severity": 4,
                    "message": 5
                };

                const toVscServerity = (str: string): vscode.DiagnosticSeverity => {
                    if (str.startsWith('err')) return vscode.DiagnosticSeverity.Error;
                    if (str.startsWith('warn')) return vscode.DiagnosticSeverity.Warning;
                    if (str == 'note' || str.startsWith('info')) return vscode.DiagnosticSeverity.Information;
                    return vscode.DiagnosticSeverity.Hint;
                };

                /* clear old diag and status */
                this.clearCppcheckDiagnostic();
                this.cppcheck_out.clear();

                const errMatcher = new RegExp(pattern.regexp, 'i');
                let diagnosticCnt: number = 0;
                process.on('errLine', (line) => {
                    // match gcc format error msg
                    const mRes = errMatcher.exec(line);
                    if (mRes && mRes.length > 5) {
                        diagnosticCnt += 1; /* increment cnt */
                        const fpath = prj.ToAbsolutePath(mRes[pattern.file]);
                        const uri = vscode.Uri.file(fpath);
                        const diags = Array.from(this.cppcheck_diag.get(uri) || []);
                        const line = parseInt(mRes[pattern.line]);
                        const col = parseInt(mRes[pattern.column]);
                        const col_s = col > 0 ? (col - 1) : 0;
                        const range = new vscode.Range(
                            new vscode.Position(line - 1, col_s),
                            new vscode.Position(line - 1, col_s + 10));
                        const diag = new vscode.Diagnostic(range, mRes[pattern.message], toVscServerity(mRes[pattern.severity]));
                        diag.source = 'cppcheck';
                        diags.push(diag);
                        this.cppcheck_diag.set(uri, diags);
                    }
                    // we not need log other cppcheck err msg
                });

                process.on('close', (exitInfo) => {
                    resolve(undefined);
                    if (cancel.isCancellationRequested == false) { // user not canceled 
                        if (exitInfo.code != 0) { // cppcheck launch failed
                            GlobalEvent.emit('msg', newMessage('Warning', 'Cppcheck launch failed, please check error msg on the output panel !'));
                            this.cppcheck_out.show();
                        }
                        else if (diagnosticCnt == 0) {
                            GlobalEvent.emit('msg', newMessage('Info', 'Cppcheck not found any problems !'));
                        }
                    }
                });

                process.on('error', (err) => {
                    GlobalEvent.emit('msg', ExceptionToMessage(err));
                });

                const _args: string[] = cmds.map(s => (s.includes(' ') && !s.trimStart().startsWith('"')) ? `"${s}"` : s);
                this.cppcheck_out.append(`>>> Exec cppcheck\n -> ${exeFile.name} ${_args.join(' ')}\n\n`);
                process.Run(exeFile.name, _args, opts);
            });
        });
    }

    private install_lock: boolean = false;
    async installCmsisSourcePack(item: ProjTreeItem, type: 'header' | 'lib' | 'idrv') {

        if (this.install_lock) {
            GlobalEvent.emit('msg', newMessage('Warning', 'Operation is in pending !'));
            return;
        }

        this.install_lock = true; // lock op

        try {

            const prj = this.dataProvider.GetProjectByIndex(item.val.projectIndex);
            if (prj) {
                switch (type) {
                    case 'header':
                        prj.installCmsisSourceCodePack(ResManager.GetInstance().getCMSISHeaderPacks());
                        break;
                    case 'lib':
                        prj.installCmsisLibs();
                        break;
                    case 'idrv':
                        prj.installCmsisSourceCodePack([
                            {
                                name: 'driver',
                                zippath: [ResManager.instance().GetAppDataDir().path, 'cmsis_driver_interface_v5_9_0.7z'].join(File.sep),
                                exportIncs: [
                                    'Include',
                                    'VIO/Include'
                                ]
                            }
                        ]);
                        break;
                    default:
                        break;
                }
            }

        } catch (error) {
            GlobalEvent.emit('msg', ExceptionToMessage(error, 'Warning'));
        }

        this.install_lock = false; // unlock op
    }

    setActiveProject(item: ProjTreeItem) {
        this.dataProvider.setActiveProject(item.val.projectIndex);
    }

    async UninstallKeilPackage(item: ProjTreeItem) {

        if (this.installLocked) {
            GlobalEvent.emit('msg', newMessage('Warning', `Busy !, Please wait for the current operation to complete !`));
            return;
        }

        const result = await vscode.window.showInformationMessage(
            `Do you really want to uninstall this package: '${item.val.value}' ?`,
            'Yes', 'No'
        );

        try {
            if (result === 'Yes') {
                this.installLocked = true;
                await this.dataProvider.UninstallKeilPackage(item);
                GlobalEvent.emit('msg', newMessage('Info', `package '${<string>item.val.value}' has been uninstalled`));
            }
        } catch (error) {
            GlobalEvent.emit('error', error);
        }

        this.installLocked = false;
    }

    SetDevice(prjIndex: number) {
        this.dataProvider.SetDevice(prjIndex);
    }

    ModifyCompileConfig(item: ProjTreeItem) {
        const prj = this.dataProvider.GetProjectByIndex(item.val.projectIndex);
        prj.GetConfiguration().toolchainConfigModel.ShowModifyWindow(<string>item.val.key, prj.GetRootDir());
    }

    async ModifyCompileConfig_openFile(item: ProjTreeItem) {

        const prj = this.dataProvider.GetProjectByIndex(item.val.projectIndex);
        const key = <string>item.val.key;

        if (/\b(linkerScript|scatterFile)/.test(key)) {
            const scatterFilePath = <string>item.val.value;
            const ldFileList: string[] = [];
            scatterFilePath.split(',')
                .filter(s => s.trim() != '')
                .forEach((sctPath) => {
                    ldFileList.push(sctPath);
                });
            try {
                if (ldFileList.length == 1) {
                    const fpath = prj.ToAbsolutePath(ldFileList[0]);
                    vscode.window.showTextDocument(
                        vscode.Uri.parse(File.ToUri(fpath)), { preview: true });
                } else if (ldFileList.length > 1) {
                    const sel = await vscode.window.showQuickPick(ldFileList, {
                        canPickMany: false,
                        placeHolder: `Select One To Open`
                    });
                    if (sel) {
                        const fpath = prj.ToAbsolutePath(sel);
                        vscode.window.showTextDocument(
                            vscode.Uri.parse(File.ToUri(fpath)), { preview: true });
                    }
                }
            } catch (error) {
                GlobalEvent.emit('error', error);
            }
        }
    }

    ModifyUploadConfig(item: ProjTreeItem) {
        const prj = this.dataProvider.GetProjectByIndex(item.val.projectIndex);
        const key = <string>item.val.key;
        prj.GetConfiguration().uploadConfigModel.ShowModifyWindow(key, prj.GetRootDir());
    }

    private updateSettingsView(prj: AbstractProject) {
        this.dataProvider.UpdateView(this.dataProvider.treeCache.getTreeItem(prj, TreeItemType.SETTINGS));
    }

    async ModifyOtherSettings(item: ProjTreeItem) {

        const prj = this.dataProvider.GetProjectByIndex(item.val.projectIndex);
        const key = <string>item.val.key;

        switch (key) {
            // output folder
            case 'outDir':
                {
                    const prjConfig = prj.GetConfiguration().config;
                    const oldFolderName = File.normalize(prjConfig.outDir);

                    const newName = await vscode.window.showInputBox({
                        value: oldFolderName,
                        ignoreFocusOut: true,
                        validateInput: (input: string): string | undefined => {
                            return !/^[\w-]+$/.test(input) ? `not match RegExp: /^[\\w-]+$/` : undefined;
                        }
                    });

                    if (newName && newName !== oldFolderName) {
                        prjConfig.outDir = newName;
                        this.updateSettingsView(prj);
                        prj.Save();
                    }
                }
                break;
            // project name
            case 'name':
                {
                    const prjConfig = prj.GetConfiguration().config;

                    const newName = await vscode.window.showInputBox({
                        value: prjConfig.name,
                        ignoreFocusOut: true,
                        placeHolder: 'Input new project name',
                        validateInput: (name) => AbstractProject.validateProjectName(name)
                    });

                    if (newName && newName !== prjConfig.name) {
                        prjConfig.name = newName; // update project name
                        this.dataProvider.UpdateView(); // udpate all view
                        prj.Save(true);
                        // rename workspace file
                        const wsFile = prj.getWorkspaceFile();
                        const newWsFile = File.from(wsFile.dir, `${newName}${wsFile.suffix}`);
                        fs.renameSync(wsFile.path, newWsFile.path);
                        WorkspaceManager.getInstance().openWorkspace(newWsFile);
                    }
                }
                break;
            // 'project.env'
            case 'project.env':
                {
                    vscode.window.showTextDocument(
                        vscode.Uri.parse(prj.getEnvFile().ToUri()), { preview: true });
                }
                break;
            default:
                break;
        }
    }

    async ImportSourceFromExtProject(treeItem: ProjTreeItem) {

        const prj = this.dataProvider.GetProjectByIndex(treeItem.val.projectIndex);

        try {
            //
            // select importer
            //
            const scriptRoot = File.fromArray([ResManager.GetInstance().GetBinDir().path, 'scripts']);
            const imptrFolder = File.fromArray([scriptRoot.path, 'importer']);
            const items: any[] = [];

            imptrFolder.GetList([/^(?:[^\.]+)\.(?:[^\.]+)\.js$/i])
                .forEach((imptrFile) => {
                    const m = /^(?<type>[^\.]+)\.(?<suffix>[^\.]+)\.js$/i.exec(imptrFile.name);
                    if (m && m.groups) {
                        items.push({
                            label: m.groups['type'].replace(/\-/g, ' ').replace(/_/g, ' '),
                            detail: `project file suffix: '${m.groups['suffix']}'`,
                            suffix: m.groups['suffix'],
                            file: imptrFile
                        });
                    }
                });

            const imptrType: any = await vscode.window.showQuickPick<vscode.QuickPickItem>(items, {
                placeHolder: `Select an importer`,
                canPickMany: false
            });

            if (imptrType == undefined) {
                return;
            }

            const filter: any = {};
            filter[<string>imptrType.label] = [imptrType.suffix];

            const uri = await vscode.window.showOpenDialog({
                openLabel: 'Import This File',
                canSelectFiles: true,
                filters: filter,
                defaultUri: vscode.Uri.file(prj.GetRootDir().path)
            });

            if (uri == undefined) {
                return;
            }

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Importing Resources`,
                cancellable: false
            }, async (progress, __) => {
                try {
                    //
                    // show progress message
                    //
                    progress.report({ message: `running importer ...` });
                    await new Promise((resolve) => {
                        setTimeout(() => resolve(undefined), 500);
                    });

                    //
                    // run importer
                    //
                    const prjFile = new File(uri[0].fsPath);
                    const imptrName = (<File>imptrType.file).noSuffixName;
                    const cmds = ['--std', './importer/index.js', imptrName, prjFile.path];
                    const result = child_process
                        .execFileSync(`${scriptRoot.path}/qjs${exeSuffix()}`, cmds, { cwd: scriptRoot.path })
                        .toString();

                    let prjList: ImporterProjectInfo[];
                    try {
                        prjList = JSON.parse(result);
                        if (!Array.isArray(prjList)) throw new Error('project list must be an array !');
                    } catch (error) {
                        throw new Error(`Import Error !, msg: '${result}'`);
                    }

                    //
                    // select project
                    //
                    let prjInfo: ImporterProjectInfo | undefined;

                    if (prjList.length > 0) {
                        // if have multi project, select one to import
                        if (prjList.length > 1) {
                            const itemList = prjList.map((prj) => {
                                return {
                                    id: `${prj.name}-${prj.target}`,
                                    label: prj.name,
                                    description: prj.target,
                                    detail: `${prjFile.name} -> ${prj.name}${prj.target ? (': ' + prj.target) : ''}`
                                };
                            });
                            const selectedItem = await vscode.window.showQuickPick<any>(itemList,
                                {
                                    placeHolder: `Found ${prjList.length} sub project, select one to import`,
                                    ignoreFocusOut: true,
                                    canPickMany: false
                                }
                            );
                            if (selectedItem) {
                                const index = itemList.findIndex((item) => item.id == selectedItem.id);
                                if (index != -1) {
                                    prjInfo = prjList[index];
                                }
                            }
                        }
                        // if only have one, use it
                        else {
                            prjInfo = prjList[0];
                        }
                    }

                    if (prjInfo == undefined) {
                        return;
                    }

                    // make abs path to relative path
                    const formatVirtualFolder = (vFolderRoot: VirtualFolder) => {
                        const folderStack: VirtualFolder[] = [vFolderRoot];
                        while (folderStack.length > 0) {
                            const vFolder = folderStack.pop();
                            if (vFolder) {
                                vFolder.files = vFolder.files.map((file) => {
                                    return { path: prj.toRelativePath(file.path) };
                                });
                                vFolder.folders.forEach((folder) => {
                                    folderStack.push(folder);
                                });
                            }
                        }
                    };

                    //
                    // start import project
                    //
                    const prjConf = prj.GetConfiguration();
                    prjConf.config.virtualFolder = prjInfo.files;
                    formatVirtualFolder(prjConf.config.virtualFolder);
                    const deps = prjConf.CustomDep_getDependence();
                    deps.incList = prjInfo.incList;
                    deps.libList = [];
                    deps.defineList = prjInfo.defineList;

                    //
                    // notify update
                    //
                    prj.getVirtualSourceManager().load();
                    prjConf.CustomDep_NotifyChanged();

                    //
                    // exclude source
                    //
                    if (prjInfo.excludeList) {

                        prjInfo.excludeList = Array.isArray(prjInfo.excludeList) ?
                            prjInfo.excludeList :
                            prjInfo.excludeList[prjInfo.target || 'null'];

                        if (Array.isArray(prjInfo.excludeList)) {

                            const excRePathLi = prjInfo.excludeList
                                .filter(path => path.trim() != '')
                                .map(path => prj.toRelativePath(path));

                            const realExcLi: string[] = [];

                            prj.getVirtualSourceManager().traverse((vFolderInfo) => {
                                vFolderInfo.folder.files.forEach(vFile => {
                                    if (excRePathLi.includes(vFile.path)) {
                                        const vFullPath = `${vFolderInfo.path}/${NodePath.basename(vFile.path)}`;
                                        realExcLi.push(vFullPath);
                                    }
                                });
                            });

                            realExcLi.forEach(vPath => prj.excludeSourceFile(vPath));
                        }
                    }

                    // show message and exit
                    progress.report({ message: `done !` });

                    prj.Save();

                    await new Promise((resolve) => {
                        setTimeout(() => resolve(undefined), 1000);
                    });

                } catch (error) {
                    GlobalEvent.emit('error', error);
                }
            });

        } catch (error) {
            GlobalEvent.emit('error', error);
        }
    }

    async AddIncludeDir(prjIndex: number) {

        const prj = this.dataProvider.GetProjectByIndex(prjIndex);
        const uris = await vscode.window.showOpenDialog({
            canSelectMany: true,
            canSelectFiles: false,
            canSelectFolders: true,
            openLabel: add_include_path,
            defaultUri: vscode.Uri.file(prj.GetRootDir().path)
        });

        if (uris && uris.length > 0) {
            const dupLi = prj
                .addIncludePaths(uris.map(uri => { return uri.fsPath; }))
                .map(path => prj.ToRelativePath(path) || path);
            if (dupLi.length > 0) {
                const msg = `${dupLi.length} redundant include paths (ignored): ${JSON.stringify(dupLi)}`;
                GlobalEvent.emit('msg', newMessage('Warning', msg));
            }
        }
    }

    async AddDefine(prjIndex: number) {
        const prj = this.dataProvider.GetProjectByIndex(prjIndex);
        const str = await vscode.window.showInputBox({
            placeHolder: add_define,
            ignoreFocusOut: true,
            validateInput: (_val: string): string | undefined => {
                const val = _val.trim();
                if (val !== '') {
                    const defines = val.endsWith(';') ? val : (val + ';');
                    if (!/^(?:[a-zA-Z_][\w]*(?:=[^;=]+)?;)+$/.test(defines)) {
                        return 'Format error !';
                    }
                }
                return undefined;
            }
        });
        if (str && str.trim() !== '') {
            str.split(';')
                .filter((define) => { return define.trim() !== ''; })
                .forEach((define) => {
                    prj.GetConfiguration().CustomDep_AddDefine(define);
                });
        }
    }

    async AddLibDir(prjIndex: number) {
        const prj = this.dataProvider.GetProjectByIndex(prjIndex);
        const uri = await vscode.window.showOpenDialog({
            canSelectMany: true,
            canSelectFiles: false,
            canSelectFolders: true,
            openLabel: add_lib_path,
            defaultUri: vscode.Uri.file(prj.GetRootDir().path)
        });
        if (uri && uri.length > 0) {
            prj.GetConfiguration().CustomDep_AddAllFromLibList(uri.map(_uri => { return _uri.fsPath; }));
        }
    }

    async showIncludeDir(prjIndex: number) {

        const prj = this.dataProvider.GetProjectByIndex(prjIndex);
        const pickItems: vscode.QuickPickItem[] = [];
        const includesMap: Map<string, string> = new Map();

        let includes: string[] = [];

        // add dependence include paths
        prj.GetConfiguration().getAllDepGroup().forEach((group) => {
            for (const dep of group.depList) {
                for (const incPath of dep.incList) {
                    const repath = prj.toRelativePath(incPath);
                    if (includes.includes(repath))
                        continue; // skip it existed
                    includes.push(repath);
                    includesMap.set(repath, group.groupName);
                }
            }
        });

        // add source include paths
        prj.getSourceIncludeList().forEach((incPath) => {
            const repath = prj.toRelativePath(incPath);
            includes.push(repath);
            includesMap.set(repath, 'source');
        });

        includes = sortPaths(includes, '/');

        for (const repath of includes) {

            const incPath = repath;
            const grpName = includesMap.get(repath);

            const descpLi: string[] = [];

            if (grpName && grpName != ProjectConfiguration.CUSTOM_GROUP_NAME) {
                descpLi.push(grpName);
            }

            if (File.isEnvPath(incPath)) {
                descpLi.push(`loc: ${prj.resolveEnvVar(incPath)}`);
            }

            pickItems.push({
                label: incPath,
                description: descpLi.join(', ')
            });
        }

        const item = await vscode.window.showQuickPick(pickItems, {
            placeHolder: `${pickItems.length} results, click one copy to clipboard`
        });

        if (item) {
            vscode.env.clipboard.writeText(item.label);
        }
    }

    async showLibDir(prjIndex: number) {

        const prj = this.dataProvider.GetProjectByIndex(prjIndex);
        let pickItems: vscode.QuickPickItem[] = [];
        const libMaps: Map<string, string> = new Map();

        prj.GetConfiguration().getAllDepGroup().forEach((group) => {
            for (const dep of group.depList) {
                for (const libPath of dep.libList) {
                    libMaps.set(prj.toRelativePath(libPath), group.groupName);
                }
            }
        });

        for (const keyVal of libMaps) {

            const libPath = keyVal[0];
            const grpName = keyVal[1];

            const descpLi: string[] = [];

            if (grpName != ProjectConfiguration.CUSTOM_GROUP_NAME) {
                descpLi.push(grpName);
            }

            if (File.isEnvPath(libPath)) {
                descpLi.push(`loc: ${prj.resolveEnvVar(libPath)}`);
            }

            pickItems.push({
                label: libPath,
                description: descpLi.join(', ')
            });
        }

        // sort result
        pickItems = pickItems.sort((i1, i2) => {
            if (i1.description && i2.description && i1.description != i2.description) {
                return i1.description.localeCompare(i2.description);
            } else {
                return i1.label.length - i2.label.length;
            }
        });

        const item = await vscode.window.showQuickPick(pickItems, {
            placeHolder: `${pickItems.length} results, click one copy to clipboard`
        });

        if (item) {
            vscode.env.clipboard.writeText(item.label);
        }
    }

    async showDefine(prjIndex: number) {

        const prj = this.dataProvider.GetProjectByIndex(prjIndex);
        let pickItems: vscode.QuickPickItem[] = [];
        const defineMaps: Map<string, string> = new Map();

        // add dependence macros
        prj.GetConfiguration().getAllDepGroup().forEach((group) => {
            for (const dep of group.depList) {
                for (const macro of dep.defineList) {
                    defineMaps.set(macro, group.groupName);
                }
            }
        });

        for (const keyVal of defineMaps) {
            pickItems.push({
                label: keyVal[0],
                description: keyVal[1]
            });
        }

        // sort result
        pickItems = pickItems.sort((i1, i2) => {
            if (i1.description && i2.description && i1.description != i2.description) {
                return i1.description.localeCompare(i2.description);
            } else {
                return i1.label.length - i2.label.length;
            }
        });

        const item = await vscode.window.showQuickPick(pickItems, {
            placeHolder: `${pickItems.length} results, click one copy to clipboard`
        });

        if (item) {
            vscode.env.clipboard.writeText(item.label);
        }
    }

    ExcludeSourceFile(item: ProjTreeItem, items: ProjTreeItem[]) {
        if (items == undefined) items = [item];

        for (const sourceItem of items) {
            const prj = this.dataProvider.GetProjectByIndex(sourceItem.val.projectIndex);

            // if it's a virtual file, we use virtual path
            if (sourceItem.type === TreeItemType.V_FILE_ITEM) {
                prj.excludeSourceFile((<VirtualFileInfo>sourceItem.val.obj).path);
            }

            // if it's a fs file, we use fs path
            else if (sourceItem.val.value instanceof File) {
                prj.excludeSourceFile(sourceItem.val.value.path);
            }
        }
    }

    UnexcludeSourceFile(item: ProjTreeItem, items: ProjTreeItem[]) {
        if (items == undefined) items = [item];

        for (const sourceItem of items) {
            const prj = this.dataProvider.GetProjectByIndex(sourceItem.val.projectIndex);

            if (sourceItem.type === TreeItemType.V_EXCFILE_ITEM) {
                prj.unexcludeSourceFile((<VirtualFileInfo>sourceItem.val.obj).path);
            }
            else if (sourceItem.val.value instanceof File) {
                prj.unexcludeSourceFile(sourceItem.val.value.path);
            }
        }
    }

    ExcludeFolder(item: ProjTreeItem, items: ProjTreeItem[], onlyChildren?: boolean) {
        if (items == undefined) items = [item];

        for (const folderItem of items) {
            const prj = this.dataProvider.GetProjectByIndex(folderItem.val.projectIndex);

            switch (folderItem.type) {
                // filesystem folder
                case TreeItemType.FOLDER:
                case TreeItemType.FOLDER_ROOT:
                    if (onlyChildren) {
                        const dir = <File>folderItem.val.obj;
                        dir.GetList(undefined, File.EXCLUDE_ALL_FILTER).forEach(f => {
                            prj.excludeSourceFile(f.path);
                        });
                    } else {
                        prj.excludeFolder((<File>folderItem.val.obj).path);
                    }
                    break;
                // virtual folder
                case TreeItemType.V_FOLDER:
                case TreeItemType.V_FOLDER_ROOT:
                    if (onlyChildren) {
                        const dir = <VirtualFolderInfo>folderItem.val.obj;
                        dir.vFolder.files.forEach(f => {
                            prj.excludeSourceFile(`${dir.path}/${NodePath.basename(f.path)}`);
                        });
                    } else {
                        prj.excludeFolder((<VirtualFolderInfo>folderItem.val.obj).path);
                    }
                    break;
                default:
                    break;
            }
        }
    }

    UnexcludeFolder(item: ProjTreeItem, items: ProjTreeItem[], onlyChildren?: boolean) {
        if (items == undefined) items = [item];

        for (const folderItem of items) {
            const prj = this.dataProvider.GetProjectByIndex(folderItem.val.projectIndex);

            if (onlyChildren) { // viewItem == FOLDER || viewItem == V_FOLDER || viewItem == FOLDER_ROOT || viewItem == V_FOLDER_ROOT
                switch (folderItem.type) {
                    // filesystem folder
                    case TreeItemType.FOLDER:
                    case TreeItemType.FOLDER_ROOT:
                        {
                            const dir = <File>folderItem.val.obj;
                            dir.GetList(undefined, File.EXCLUDE_ALL_FILTER).forEach(f => {
                                prj.unexcludeSourceFile(f.path);
                            });
                        }
                        break;
                    // virtual folder
                    case TreeItemType.V_FOLDER:
                    case TreeItemType.V_FOLDER_ROOT:
                        {
                            const dir = <VirtualFolderInfo>folderItem.val.obj;
                            dir.vFolder.files.forEach(f => {
                                prj.unexcludeSourceFile(`${dir.path}/${NodePath.basename(f.path)}`);
                            });
                        }
                        break;
                    default:
                        break;
                }
            }

            else { // viewItem == EXCFOLDER || viewItem == V_EXCFOLDER
                switch (folderItem.type) {
                    // filesystem folder
                    case TreeItemType.EXCFOLDER:
                        prj.unexcludeFolder((<File>folderItem.val.obj).path);
                        break;
                    // virtual folder
                    case TreeItemType.V_EXCFOLDER:
                        prj.unexcludeFolder((<VirtualFolderInfo>folderItem.val.obj).path);
                        break;
                    default:
                        break;
                }
            }
        }
    }

    async showFileInExplorer(item: ProjTreeItem) {

        let file: File | undefined;

        if (item.val.value instanceof File) { // if value is a file, use it
            file = new File(File.normalize(item.val.value.path));
        }

        if (file) {
            vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(file.path));
        }
    }

    ////////////////////////////////// modifiable yaml config implements ////////////////////////////////////////

    private yamlCfgProviderList: Map<string, ModifiableYamlConfigProvider> = new Map();

    registerModifiableYamlConfigProvider(id: string, provider: ModifiableYamlConfigProvider) {
        this.yamlCfgProviderList.set(id, provider);
    }

    private YamlConfigProvider_notifyDocSaved(doc: vscode.TextDocument) {

        const docName = NodePath.basename(doc.uri.fsPath);

        this.yamlCfgProviderList.forEach((val, key) => {
            if (docName.endsWith(`eide.${key}.yaml`)) {
                val.onYamlDocSaved(doc);
            }
        });
    }

    private YamlConfigProvider_notifyDocClosed(doc: vscode.TextDocument) {

        const docName = NodePath.basename(doc.uri.fsPath);

        this.yamlCfgProviderList.forEach((val, key) => {
            if (docName.endsWith(`eide.${key}.yaml`)) {
                val.onYamlDocClosed(doc);
            }
        });
    }

    async openYamlConfig(item: ProjTreeItem, id: string) {

        const provider = this.yamlCfgProviderList.get(id);
        if (provider == undefined) {
            throw new Error(`not found any registed config provider: '${id}'`);
        }

        // provide file
        const prj = this.dataProvider.GetProjectByIndex(item.val.projectIndex);
        const defFileName = `${prj.getUid()}.eide.${id}.yaml`;
        const res = await provider.provideYamlDocument(prj, item, defFileName);
        if (res instanceof Error) {
            GlobalEvent.emit('msg', ExceptionToMessage(res, 'Warning'));
            return;
        }

        // show file if we need
        if (res) {
            vscode.window.showTextDocument(
                vscode.Uri.file(res.path), { preview: false }
            );
        }
    }

    ///////////////////////////////////////////////////////////////////////////

    CopyItemValue(item: ProjTreeItem) {
        if (item.val.value instanceof File) {
            vscode.env.clipboard.writeText(item.val.value.path);
        } else if (typeof item.val.value == 'string') {
            vscode.env.clipboard.writeText(item.val.value);
        }
    }

    async showFilesOptions(item: ProjTreeItem) {
        const prj = this.dataProvider.GetProjectByIndex(item.val.projectIndex);
        const optFile = prj.getSourceExtraArgsCfgFile();
        vscode.window.showTextDocument(vscode.Uri.parse(optFile.ToUri()), { preview: true });
    }

    ///////////////////////////////////////////////////////////////////////////////

    async editDependenceItem(item: ProjTreeItem) {

        if (item.val.value instanceof File)
            throw new Error('editDependenceItem: Invalid context item');

        const itype = (<ModifiableDepInfo>item.val.obj).type;

        const prj = this.dataProvider.GetProjectByIndex(item.val.projectIndex);
        let newVal = await vscode.window.showInputBox({
            value: item.val.value,
            ignoreFocusOut: true,
            validateInput: (input: string): string | undefined => {
                if (input.trim() === '')
                    return 'Cannot be empty or whitespace !';
                if (itype == 'DEFINE_ITEM') {
                    if (!/^\w+(=[^\s].*)?$/i.test(input))
                        return "Cannot have whitespace on either side of '=' !";
                }
            }
        });

        if (newVal) {
            newVal = newVal.trim();
            switch (itype) {
                case 'INC_ITEM':
                    prj.GetConfiguration().CustomDep_ModifyIncDir(prj.ToAbsolutePath(<string>item.val.value), prj.ToAbsolutePath(newVal));
                    break;
                case 'DEFINE_ITEM':
                    prj.GetConfiguration().CustomDep_ModifyDefine(<string>item.val.value, newVal);
                    break;
                case 'LIB_ITEM':
                    prj.GetConfiguration().CustomDep_ModifyLib(prj.ToAbsolutePath(<string>item.val.value), prj.ToAbsolutePath(newVal));
                    break;
                default:
                    break;
            }
        }
    }

    async RemoveDependenceItem(item: ProjTreeItem) {

        if (item.val.value instanceof File)
            throw new Error('RemoveDependenceItem: Invalid context item');

        const msg = `${WARNING}: ${remove_this_item.replace('{}', item.val.value)}`;
        const choice = await vscode.window.showWarningMessage(msg, 'Yes', 'No');
        if (choice === undefined || choice === 'No')
            return undefined;

        const prj = this.dataProvider.GetProjectByIndex(item.val.projectIndex);
        switch ((<ModifiableDepInfo>item.val.obj).type) {
            case 'INC_ITEM':
                prj.GetConfiguration().CustomDep_RemoveIncDir(prj.ToAbsolutePath(item.val.value));
                break;
            case 'DEFINE_ITEM':
                prj.GetConfiguration().CustomDep_RemoveDefine(item.val.value);
                break;
            case 'LIB_ITEM':
                prj.GetConfiguration().CustomDep_RemoveLib(prj.ToAbsolutePath(item.val.value));
                break;
            default:
                break;
        }
    }

    ImportPackageDependence(item: ProjTreeItem): void {
        const prj = this.dataProvider.GetProjectByIndex(item.val.projectIndex);
        try {
            prj.InstallComponent(<string>item.val.value);
        } catch (err) {
            GlobalEvent.emit('msg', {
                type: 'Warning',
                contentType: 'string',
                content: view_str$pack$install_component_failed
            });
            GlobalEvent.emit('msg', ExceptionToMessage(err, 'Hidden'));
        }
    }

    RemovePackageDependence(item: ProjTreeItem): void {
        const prj = this.dataProvider.GetProjectByIndex(item.val.projectIndex);
        try {
            prj.UninstallComponent(<string>item.val.value);
        } catch (err) {
            GlobalEvent.emit('msg', {
                type: 'Warning',
                contentType: 'string',
                content: view_str$pack$remove_component_failed
            });
            GlobalEvent.emit('msg', ExceptionToMessage(err, 'Hidden'));
        }
    }

    async onSwitchCompileTools(item: ProjTreeItem) {

        const prj = this.dataProvider.GetProjectByIndex(item.val.projectIndex);
        const toolchianManager = ToolchainManager.getInstance();
        const pickItems: any[] = [];

        for (const name of toolchianManager.getToolchainNameList(prj.GetConfiguration().config.type)) {
            pickItems.push({
                label: toolchianManager.getToolchainDesc(name),
                value: name,
                description: name
            });
        }

        const pItem = await vscode.window.showQuickPick(pickItems, {
            canPickMany: false,
            placeHolder: view_str$compile$selectToolchain,
        });

        if (pItem == undefined) return; /* user canceled */

        if (prj.getToolchain().name !== <ToolchainName>pItem.value) {
            prj.setToolchain(<ToolchainName>pItem.value);
        }
    }

    async onSetupToolchain(item: ProjTreeItem) {

        const project = this.dataProvider.GetProjectByIndex(item.val.projectIndex);
        const setting = SettingManager.GetInstance();

        const toolchainPathSettingName = setting.trimSettingTag(project.getToolchain().settingName);
        const toolchainPath = setting.getConfiguration().get(toolchainPathSettingName) || '';

        const toolchain = project.getToolchain();
        const isChinese = getLocalLanguageType() == LanguageIndexs.Chinese;

        const cfg: SimpleUIConfig = {
            ref_id: `<toolchain-config>:${project.getUid()}`,
            title: isChinese
                ? `设置工具链 (项目：${project.getProjectName()})`
                : `Setup Toolchain (Project: ${project.getProjectName()})`,
            items: {}
        };

        if (isGccFamilyToolchain(toolchain.name) && toolchain.getToolchainPrefix) {
            const toolchainPrefix = toolchain.getToolchainPrefix() || '';
            cfg.items['prefix'] = {
                type: 'input',
                attrs: {
                    singleLine: true,
                    size: 30,
                },
                name: isChinese
                    ? '编译器前缀'
                    : 'Toolchain Prefix',
                data: <SimpleUIConfigData_input>{
                    placeHolder: 'like: arm-none-eabi-',
                    value: toolchainPrefix,
                    default: toolchainPrefix
                },
            };
        }

        // toolchain path
        cfg.items['path'] = {
            type: 'input',
            attrs: {
                singleLine: true,
            },
            name: isChinese ? '编译器根目录位置' : 'Toolchain Path',
            data: <SimpleUIConfigData_input>{
                placeHolder: 'toolchain dir, like: ${userHome}/.eide/tools/<toolchain_id>',
                value: toolchainPath,
                default: toolchainPath
            }
        };

        if (isGccFamilyToolchain(toolchain.name)) {
            cfg.items['path_note'] = {
                type: 'text',
                attrs: {},
                name: '',
                data: <SimpleUIConfigData_text>{
                    subType: 'raw',
                    value: isChinese
                        ? `提示：如果您已经将编译器 bin 目录设置到系统环境变量中，则您无需设置上述路径，重启工作区，插件将自动搜索可用的路径`
                        : `Note: If you have already set the compiler bin directory to the system environment variables, you do not need to set the above path. Restart the workspace, and the plugin will automatically search for available paths.`
                },
            };
        }

        WebPanelManager.instance().showSimpleConfigUI(cfg, async (newCfg) => {

            // update toolchain path
            setting.getConfiguration().update(
                toolchainPathSettingName, newCfg.items['path'].data.value, vscode.ConfigurationTarget.Workspace);

            // update toolchain prefix
            if (newCfg.items['prefix'])
                setting.setGccFamilyToolPrefix(
                    project.getToolchain().name, newCfg.items['prefix'].data.value);
        });
    }

    async switchUploader(item: ProjTreeItem) {

        const prj = this.dataProvider.GetProjectByIndex(item.val.projectIndex);
        const prjConfig = prj.GetConfiguration().config;

        const pickerItems: any[] = HexUploaderManager.getInstance()
            .getUploaderList(prjConfig.toolchain)
            .map<vscode.QuickPickItem>((item) => {
                return {
                    label: item.label || item.type,
                    uploader: item.type,
                    description: item.description
                };
            });

        const selection = await vscode.window.showQuickPick(pickerItems, {
            placeHolder: view_str$compile$selectFlasher
        });

        if (selection && selection.uploader !== prjConfig.uploader) {
            try {
                prj.setUploader(<HexUploaderType>selection.uploader);
            } catch (error) {
                GlobalEvent.emit('error', error);
            }
        }
    }

    async fetchShellFlasher(item: ProjTreeItem) {

        const project = this.dataProvider.GetProjectByIndex(item.val.projectIndex);
        const resManager = ResManager.GetInstance();

        const err = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Setup Shell Flasher`,
            cancellable: true
        }, async (reporter, cancel): Promise<Error | undefined> => {

            try {

                const REPO_PATH = 'github0null/eide_shell_flasher_index';

                // get index.json
                //

                if (cancel.isCancellationRequested) {
                    return;
                }

                reporter.report({ message: 'fetching index.json' });
                const idxTxt = await readGithubRepoTxtFile(REPO_PATH, 'index.json');
                if (typeof idxTxt != 'string') {
                    throw idxTxt || new Error(`Cannot read index.json`);
                }

                const idxObj = <ShellFlasherIndexItem[]>JSON.parse(idxTxt);
                const pickItems: any[] = [];

                idxObj.forEach((item, idx) => {
                    if (item.platform.includes(osType())) {
                        let detail = item.detail || `no detail`;
                        if (item.provider) detail = detail + `, provider: ${item.provider}`;
                        pickItems.push(<vscode.QuickPickItem>{
                            idx: idx,
                            label: item.name,
                            detail: detail
                        });
                    }
                });

                // select flasher
                //

                if (cancel.isCancellationRequested) {
                    return;
                }

                reporter.report({ message: 'select flasher' });
                const sel = await vscode.window.showQuickPick(pickItems, {
                    title: 'Select Flasher',
                    matchOnDescription: true,
                    matchOnDetail: true,
                    canPickMany: false,
                    ignoreFocusOut: true
                });

                if (sel == undefined) {
                    return;
                }

                // install
                //

                if (cancel.isCancellationRequested) {
                    return;
                }

                const tarFlasher = idxObj[sel.idx];

                reporter.report({ message: 'download shell scripts' });

                // download and install flasher script
                const scriptsList = await readGithubRepoFolder(`https://api.github.com/repos/${REPO_PATH}/contents/scripts/${tarFlasher.id}`);
                if (scriptsList instanceof Error) {
                    if (scriptsList.message?.trim() != 'Not Found')
                        throw scriptsList;
                } else {
                    let scriptDir = new File(project.getRootDir().path);
                    if (tarFlasher.scriptInstallDir) scriptDir = File.fromArray([scriptDir.path, tarFlasher.scriptInstallDir]);
                    scriptDir.CreateDir(true);
                    for (const scriptInfo of scriptsList) {
                        if (scriptInfo.download_url) {
                            const buff = await downloadFile(redirectHost(scriptInfo.download_url));
                            if (!(buff instanceof Buffer)) throw buff || new Error(`Cannot download '${scriptInfo.name}'`);
                            fs.writeFileSync(`${scriptDir.path}/${scriptInfo.name}`, buff);
                        }
                    }
                }

                let needReload = false;
                if (tarFlasher.resources[osType()]) {

                    if (cancel.isCancellationRequested)
                        return;

                    const res = tarFlasher.resources[osType()];

                    let installDir: File;
                    let isFirstInstall: boolean = false;

                    if (res.locationType == 'workspace')
                        installDir = File.fromArray([project.getRootDir().path, res.location]);
                    else // global
                        installDir = File.fromArray([resManager.getEideToolsInstallDir(), res.location]);

                    // if have a resource and not install, download it
                    if (res.zipType != 'none' && installDir.IsDir() == false) {

                        reporter.report({ message: 'downloading resources' });
                        const buf = await downloadFile(redirectHost(res.url));
                        if (!(buf instanceof Buffer)) throw buf || new Error('Cannot download resource');
                        const tmpPath = os.tmpdir() + File.sep + Date.now().toString();
                        fs.writeFileSync(tmpPath, buf);

                        reporter.report({ message: 'unzip resources' });
                        installDir.CreateDir(true);
                        const szip = new SevenZipper();
                        const r = szip.UnzipSync(new File(tmpPath), installDir);
                        GlobalEvent.log_info(r);

                        isFirstInstall = true;
                    }

                    if (res.setupCommand) {
                        reporter.report({ message: 'execuate setup command ...' });
                        const done = await execInternalCommand(res.setupCommand, installDir.path, cancel);
                        if (!done) {
                            if (cancel.isCancellationRequested) {
                                GlobalEvent.emit('globalLog.append', `\n----- user canceled -----\n`);
                                return;
                            } else {
                                return new Error(`Setup command failed, see detail in 'OUTPUT panel' -> 'eide.log' !`);
                            }
                        }
                    }

                    needReload = isFirstInstall && res.locationType == 'global';
                }

                if (cancel.isCancellationRequested) {
                    return;
                }

                project.GetConfiguration().uploadConfigModel.SetKeyValue('bin', tarFlasher.flashConfigTemplate.bin);
                project.GetConfiguration().uploadConfigModel.SetKeyValue('commandLine', tarFlasher.flashConfigTemplate.commandLine);
                project.GetConfiguration().uploadConfigModel.SetKeyValue('eraseChipCommand', tarFlasher.flashConfigTemplate.eraseChipCommand);

                GlobalEvent.emit('msg', newMessage('Info', `Shell flasher '${tarFlasher.id}' has been setup !`));
                if (needReload) {
                    notifyReloadWindow(view_str$prompt$needReloadToUpdateEnv);
                }

                return;

            } catch (error) {
                return error;
            }
        });

        if (err) {
            GlobalEvent.emit('msg', ExceptionToMessage(err, 'Warning'));
        }
    }

    private async genDebugConfig_internal(
        type: 'jlink' | 'openocd' | 'pyocd',
        prj: AbstractProject, old_cfgs: any[]): Promise<{ debug_config: any, override_idx: number } | undefined> {

        const _elfPath = File.ToUnixPath(prj.getOutputDir()) + '/' + `${prj.getProjectName()}.elf`;
        const _debugConfigTemplates = {
            'jlink': {
                cwd: '${workspaceRoot}',
                type: 'cortex-debug',
                request: 'launch',
                name: `${prj.getProjectCurrentTargetName()}: JLINK`,
                servertype: 'jlink',
                interface: 'swd',
                executable: _elfPath,
                runToEntryPoint: "main",
                device: ''
            },
            'openocd': {
                cwd: '${workspaceRoot}',
                type: 'cortex-debug',
                request: 'launch',
                name: `${prj.getProjectCurrentTargetName()}: OpenOCD`,
                servertype: 'openocd',
                executable: _elfPath,
                runToEntryPoint: "main",
                configFiles: [
                ]
            },
            'pyocd': {
                cwd: '${workspaceRoot}',
                type: 'cortex-debug',
                request: 'launch',
                name: `${prj.getProjectCurrentTargetName()}: pyOCD`,
                servertype: 'pyocd',
                executable: _elfPath,
                runToEntryPoint: "main",
                targetId: '<mcu-name>',
                serverArgs: []
            }
        };

        const debugConfig: any = _debugConfigTemplates[type];

        /* set gdb toolchain */
        const toolchain = prj.getToolchain();
        if (toolchain.getToolchainPrefix) {
            debugConfig.toolchainPrefix = toolchain.getToolchainPrefix().trim().replace(/-$/, '');
        } else if (debugConfig.toolchainPrefix) {
            debugConfig.toolchainPrefix = undefined;
        }

        /* set svd file */
        const device = prj.GetPackManager().getCurrentDevInfo();
        if (device && device.svdPath && debugConfig.svdFile == undefined) {
            debugConfig.svdFile = prj.ToRelativePath(device.svdPath) || device.svdPath;
        }

        const isChinese = getLocalLanguageType() == LanguageIndexs.Chinese;
        const ui: SimpleUIConfig = {
            title: (isChinese
                ? '创建 Cortex-Debug ({}) 调试配置模板'
                : 'Create Cortex-Debug ({}) Configuration Template').replace('{}', type.toUpperCase()),
            viewColumn: vscode.ViewColumn.One,
            notTakeFocus: false,
            btns: {
                'submit': {
                    title: isChinese ? '新建' : 'Create',
                    hidden: false
                },
                'reset': {
                    title: '',
                    hidden: true
                }
            },
            items: {
                'name': {
                    type: 'input',
                    name: isChinese ? '名称' : 'Name',
                    attrs: { 'singleLine': true, 'size': 60 },
                    data: <SimpleUIConfigData_input>{
                        value: debugConfig.name
                    }
                },
                'request': {
                    type: 'options',
                    name: isChinese ? '调试模式' : 'Request',
                    attrs: {},
                    data: <SimpleUIConfigData_options>{
                        value: 0,
                        default: 0,
                        enum: ['launch', 'attach'],
                        enumDescriptions: isChinese ? ['启动', '附加'] : ['launch', 'attach'],
                    }
                }
            }
        };

        let uiResultConv: (data: SimpleUIConfig, debugConfig: any) => void = (a, b) => {
            throw new Error('uiResultConv NOT IMPLEMENT !');
        };

        /* For JLink */
        if (type == 'jlink') {

            if (prj.getUploaderType() == 'JLink') {
                const jlinkUploadConf = <JLinkOptions>prj.GetConfiguration().config.uploadConfig;
                debugConfig.interface = JLinkProtocolType[jlinkUploadConf.proType].toLowerCase();
                debugConfig.device = jlinkUploadConf.cpuInfo.cpuName;
            }

            /* setup ui */
            ui.items['interface'] = {
                type: 'options',
                name: isChinese ? '接口类型' : 'Interface',
                attrs: {},
                data: <SimpleUIConfigData_options>{
                    value: debugConfig.interface == 'swd' ? 0 : 1,
                    default: 0,
                    enum: ['swd', 'jtag'],
                    enumDescriptions: ['SWD', 'JTAG'],
                }
            };
            ui.items['device'] = {
                type: 'input',
                name: isChinese ? '芯片型号' : 'Device Name',
                attrs: { 'singleLine': true, size: 30 },
                data: <SimpleUIConfigData_input>{
                    value: debugConfig.device,
                    placeHolder: 'STM32F103C8'
                },
            };
            uiResultConv = (data, outConfig) => {
                outConfig.interface = ['swd', 'jtag'][data.items['interface'].data.value];
                outConfig.device = data.items['device'].data.value;
            };
        }

        /* For OPENOCD */
        else if (type == 'openocd') {

            const toCfgPath = (typ: 'interface' | 'target', cfgname: string): string => {
                if (cfgname.trim() != '') {
                    let fpath: string = cfgname.startsWith('${workspaceFolder}/')
                        ? cfgname.replace('${workspaceFolder}/', '')
                        : `${typ}/${cfgname}`;
                    if (!fpath.endsWith('.cfg'))
                        fpath += '.cfg';
                    return fpath;
                }
                return '';
            };

            const interface_enums = [''].concat(
                openocd_getConfigList('interface', prj.getRootDir()).map(c => c.name).sort());
            const target_enums = [''].concat(
                openocd_getConfigList('target', prj.getRootDir()).map(c => c.name).sort());

            let inferface_default = 0;
            let target_default = 0;

            if (prj.getUploaderType() == 'OpenOCD') {
                const flasherConf = <OpenOCDFlashOptions>prj.GetConfiguration().config.uploadConfig;
                if (flasherConf.interface) {
                    (<any[]>debugConfig.configFiles).push(toCfgPath('interface', flasherConf.interface));
                    const idx = interface_enums.findIndex(n => n == flasherConf.interface);
                    if (idx != -1)
                        inferface_default = idx;
                }
                if (flasherConf.target) {
                    (<any[]>debugConfig.configFiles).push(toCfgPath('target', flasherConf.target));
                    const idx = target_enums.findIndex(n => n == flasherConf.target);
                    if (idx != -1)
                        target_default = idx;
                }
            }

            /* setup ui */
            ui.items['interface'] = {
                type: 'options',
                name: isChinese ? '接口' : 'Interface',
                attrs: { style: 'width: 260px;' },
                data: <SimpleUIConfigData_options>{
                    value: inferface_default,
                    default: inferface_default,
                    enum: interface_enums,
                    enumDescriptions: interface_enums.map(n => n == '' ? 'None' : n),
                }
            };
            ui.items['target'] = {
                type: 'options',
                name: isChinese ? '目标' : 'Target',
                attrs: { style: 'width: 260px;' },
                data: <SimpleUIConfigData_options>{
                    value: target_default,
                    default: target_default,
                    enum: target_enums,
                    enumDescriptions: target_enums.map(n => n == '' ? 'None' : n),
                }
            };
            uiResultConv = (data, outConfig) => {
                const cfgFiles: string[] = [];
                const i_idx = (<SimpleUIConfigData_options>data.items['interface'].data).value;
                const i_path = interface_enums[i_idx];
                if (i_path)
                    cfgFiles.push(toCfgPath('interface', i_path));
                const t_idx = (<SimpleUIConfigData_options>data.items['target'].data).value;
                const t_path = target_enums[t_idx];
                if (t_path)
                    cfgFiles.push(toCfgPath('target', t_path));
                outConfig.configFiles = cfgFiles;
            };
        }

        /* For PYOCD */
        else if (type == 'pyocd') {

            let target_idx_default = 0;
            let pyocd_config_path: string | undefined;

            if (prj.getUploaderType() == 'pyOCD') {
                const flasherConf = <PyOCDFlashOptions>prj.GetConfiguration().config.uploadConfig;
                debugConfig.targetId = flasherConf.targetName;
                if (flasherConf.config) {
                    pyocd_config_path = prj.toAbsolutePath(flasherConf.config);
                    if (File.IsFile(pyocd_config_path)) {
                        debugConfig.serverArgs = [
                            '--config', pyocd_config_path
                        ];
                    }
                }
            }

            const pyocd_targets = await vscode.window.withProgress<string[] | Error>({
                location: vscode.ProgressLocation.Notification,
                title: 'Get pyOCD Targets List'
            }, () => {
                return new Promise((resolve) => {
                    try {
                        const r = pyocd_getTargetList(prj.getRootDir(), pyocd_config_path).map(t => <string>t['name']);
                        resolve(r);
                    } catch (error) {
                        resolve(error);
                    }
                });
            });

            if (pyocd_targets instanceof Error)
                throw pyocd_targets;
            if (pyocd_targets == undefined)
                throw new Error(`pyocd_getTargetList -> target_enums is undefined`);

            const target_enums = pyocd_targets.sort();
            const idx = target_enums.findIndex(t => t == debugConfig.targetId);
            if (idx != -1)
                target_idx_default = idx;

            /* setup ui */
            ui.items['target'] = {
                type: 'options',
                name: isChinese ? '目标' : 'Target',
                attrs: { style: 'width: 260px;' },
                data: <SimpleUIConfigData_options>{
                    value: target_idx_default,
                    default: target_idx_default,
                    enum: target_enums,
                    enumDescriptions: target_enums,
                }
            };
            if (prj.getUploaderType() != 'pyOCD') {
                ui.items['config'] = {
                    type: 'input',
                    name: isChinese ? 'pyocd.yml 配置文件路径' : 'pyocd.yml Path',
                    attrs: { 'singleLine': true },
                    data: <SimpleUIConfigData_input>{
                        value: '',
                        placeHolder: './pyocd.yml'
                    },
                };
            }
            uiResultConv = (data, outConfig) => {
                const t_idx = (<SimpleUIConfigData_options>data.items['target'].data).value;
                const targetId = target_enums[t_idx];
                if (targetId)
                    outConfig.targetId = targetId;
                else
                    throw new Error(`targetId is null ! idx=${t_idx}`);
                if (data.items['config']) {
                    const _cfgPath = (<SimpleUIConfigData_input>data.items['config'].data).value;
                    if (_cfgPath) {
                        const absPath = prj.toAbsolutePath(_cfgPath);
                        outConfig.serverArgs = [
                            '--config', absPath
                        ];
                    }
                }
            };
        }

        return new Promise((resolve) => {

            WebPanelManager.instance().showSimpleConfigUI(ui,
                // on submited
                async (data, panel) => {

                    /* update configs */
                    debugConfig.name = data.items['name'].data.value;
                    debugConfig.request = ['launch', 'attach'][data.items['request'].data.value];
                    if (debugConfig.request == 'attach')
                        debugConfig.runToEntryPoint = undefined;
                    uiResultConv(data, debugConfig);

                    /* check override ? */
                    const idx = old_cfgs.findIndex(cfg => cfg.name == debugConfig.name);
                    if (idx != -1) {
                        const item = await vscode.window.showWarningMessage(
                            isChinese
                                ? `${WARNING}: 名称为 '${debugConfig.name}' 的调试配置已经存在，需要覆盖它吗？`
                                : `${WARNING}: Debugger Configuration '${debugConfig.name}' is already existed ! Override It ?`,
                            'Yes', 'No');
                        if (item === undefined || item === 'No') {
                            return 'canceled';
                        }
                    }

                    resolve({ debug_config: debugConfig, override_idx: idx });
                    setTimeout(() => panel.dispose(), 100);
                },
                // on msg
                (msg) => {
                });
        });
    }

    async genDebugConfigTemplate(item: ProjTreeItem, type: 'jlink' | 'openocd' | 'pyocd') {

        const project = this.dataProvider.GetProjectByIndex(item.val.projectIndex);
        const cfgfile = File.from(project.GetWorkspaceConfig().GetFile().dir, AbstractProject.vsCodeDir, 'launch.json');

        try {

            let cur_cfgs;
            if (cfgfile.IsFile())
                cur_cfgs = <any[]>jsonc_parser.parse(cfgfile.Read(), undefined, { allowTrailingComma: true }).configurations;
            else
                cur_cfgs = [];

            const result = await this.genDebugConfig_internal(type, project, cur_cfgs);
            if (!result) {
                return; // skip if user canceled
            }

            if (!cfgfile.IsFile()) {
                cfgfile.Write(JSON.stringify({
                    version: '0.2.0',
                    configurations: [result.debug_config]
                }, undefined, 4));
                vscode.window.showTextDocument(vscode.Uri.file(cfgfile.path), { preview: true });
                return;
            }

            /* merge debugConfig and write into launch.json */
            let edits: jsonc_parser.EditResult;
            const fmtOpts = <jsonc_parser.FormattingOptions>{ tabSize: 4, insertSpaces: true };
            const raw_cont = cfgfile.Read();
            if (result.override_idx != -1)
                edits = jsonc_parser.modify(raw_cont, ['configurations', result.override_idx], result.debug_config, { formattingOptions: fmtOpts });
            else
                edits = jsonc_parser.modify(raw_cont, ['configurations', 0], result.debug_config, { formattingOptions: fmtOpts, isArrayInsertion: true });
            cfgfile.Write(jsonc_parser.applyEdits(raw_cont, edits));

            /* show launch.json */
            const document = await vscode.workspace.openTextDocument(vscode.Uri.file(cfgfile.path));
            let cursorSel: vscode.Range | undefined;
            if (edits.length > 0) {
                const s = document.positionAt(edits[0].offset);
                const e = document.positionAt(edits[0].offset + edits[0].length);
                cursorSel = new vscode.Range(s, e);
            }
            vscode.window.showTextDocument(document, { preview: true, selection: cursorSel });
        } catch (error) {
            GlobalEvent.emit('error', error);
        }
    }

    private prev_click_info: ItemClickInfo | undefined = undefined;

    private async OnTreeItemClick(item: ProjTreeItem) {

        if (ProjTreeItem.isFileItem(item.type)) {

            const file = <File>item.val.value;

            let isPreview = true;

            if (this.prev_click_info &&
                this.prev_click_info.name === file.path &&
                this.prev_click_info.time + 260 > Date.now()) {
                isPreview = false;
            }

            // reset it
            this.prev_click_info = {
                name: file.path,
                time: Date.now()
            };

            try {

                // try to show it by eide, if failed, show it 
                // by vscode default api
                if (this.showBinaryFiles(file, isPreview))
                    return;

                if (item.val.isVirtualFile) {
                    const uri = vscode.Uri.parse(VirtualDocument.instance().getUriByPath(file.path));
                    VirtualDocument.instance().updateDocument(file.path);
                    vscode.window.showTextDocument(uri, { preview: isPreview });
                } else {
                    /* We need use 'vscode.open' command, not 'showTextDocument' API, 
                     * because API can't open bin file */
                    vscode.commands.executeCommand('vscode.open', vscode.Uri.file(file.path), { preview: isPreview });
                }

            } catch (error) {
                GlobalEvent.emit('msg', ExceptionToMessage(error, 'Warning'));
            }
        }
    }

    private showBinaryFiles(binFile: File, isPreview?: boolean): boolean | undefined {

        try {

            // if not found, exited
            if (!binFile.IsExist()) return undefined;

            const suffix = binFile.suffix.toLowerCase();

            // show armcc axf file
            if (suffix == '.axf') {

                let fromelf = File.from(`fromelf${exeSuffix()}`);
                if (SettingManager.GetInstance().getArmcc5Dir().IsDir()) {
                    fromelf = File.from(SettingManager.GetInstance().getArmcc5Dir().path, 'bin', `fromelf${exeSuffix()}`);
                } else if (SettingManager.GetInstance().getArmcc6Dir().IsDir()) {
                    fromelf = File.from(SettingManager.GetInstance().getArmcc6Dir().path, 'bin', `fromelf${exeSuffix()}`);
                }

                let cont: string;

                try {
                    if (!fromelf.IsFile())
                        throw new Error(`Not found '${fromelf.path}' !`);
                    cont = child_process
                        .execFileSync(fromelf.path, ['--text', '-v', binFile.path], { maxBuffer: 50 * 1024 * 1024 })
                        .toString();
                } catch (error) {
                    const err = <Error>error;
                    cont = `${err.name}: ${err.message}\n${err.stack}`;
                }

                const vDoc = VirtualDocument.instance();
                const docName = `${binFile.path}.info`;
                vDoc.updateDocument(docName, cont);

                const uri = vscode.Uri.parse(vDoc.getUriByPath(docName));
                vscode.window.showTextDocument(uri, { preview: isPreview });

                return true;
            }

            // show gnu elf file
            else if (suffix == '.elf') {

                let readelf: string = 'arm-none-eabi-readelf';
                let elfsize: string = 'arm-none-eabi-size';

                const activePrj = this.getActiveProject();
                if (activePrj) {
                    const toolchain = activePrj.getToolchain();
                    if (isGccFamilyToolchain(toolchain.name) && toolchain.getToolchainPrefix) {
                        readelf = [toolchain.getToolchainDir().path, 'bin', `${toolchain.getToolchainPrefix()}readelf`].join(File.sep);
                        elfsize = [toolchain.getToolchainDir().path, 'bin', `${toolchain.getToolchainPrefix()}size`].join(File.sep);
                    }
                    else if (toolchain.name == 'LLVM_ARM') {
                        readelf = [toolchain.getToolchainDir().path, 'bin', `llvm-readelf`].join(File.sep);
                        elfsize = [toolchain.getToolchainDir().path, 'bin', `llvm-size`].join(File.sep);
                    }
                    else if (toolchain.name == 'GNU_SDCC_MCS51') {
                        readelf = [toolchain.getToolchainDir().path, 'bin', `i51-elf-readelf`].join(File.sep);
                        elfsize = [toolchain.getToolchainDir().path, 'bin', `i51-elf-size`].join(File.sep);
                    }
                }

                let cont: string;

                try {
                    cont = child_process
                        .execFileSync(`${readelf}${exeSuffix()}`, ['-e', binFile.path], { maxBuffer: 50 * 1024 * 1024 })
                        .toString();
                } catch (error) {
                    const err = <Error>error;
                    cont = `${err.name}: ${err.message}\n${err.stack}`;
                }

                // show elf size
                try {
                    let tLines = child_process
                        .execFileSync(`${elfsize}${exeSuffix()}`, ['-A', binFile.path])
                        .toString().split(/\r\n|\n/g);
                    tLines = tLines.filter(s => s.trim() != '').map(s => `  ${s}`);
                    tLines.push(os.EOL);
                    tLines = [os.EOL + 'ELF Size:'].concat(tLines);
                    cont += tLines.join(os.EOL);
                } catch (error) {
                    // do nothing
                }

                const vDoc = VirtualDocument.instance();
                const docName = `${binFile.path}.info`;
                vDoc.updateDocument(docName, cont);

                const uri = vscode.Uri.parse(vDoc.getUriByPath(docName));
                vscode.window.showTextDocument(uri, { preview: isPreview });

                return true;
            }

        } catch (error) {
            GlobalEvent.emit('msg', ExceptionToMessage(error, 'Hidden'));
        }
    }
}

