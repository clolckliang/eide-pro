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

import { File } from '../../lib/node-utility/File';
import { ResManager } from '../ResManager';
import { GlobalEvent } from '../GlobalEvents';
import { AbstractProject, CheckError, DataChangeType, VirtualSource, SourceFileOptions, EIDE_FILE_OPTION_VERSION, NewProject } from '../EIDEProject';
import { ToolchainName, ToolchainManager } from '../ToolchainManager';
import {
    BuilderOptions,
    CreateOptions, VirtualFolder, VirtualFile, ImportOptions,
    ProjectTargetInfo, ProjectConfigData, ProjectType, ProjectConfiguration, ProjectBaseApi, MAPPED_KEYS_IN_TARGET_INFO
} from '../EIDETypeDefine';
import {
    PackInfo, ComponentFileItem, DeviceInfo,
    getComponentKeyDescription, ArmBaseCompileData, ArmBaseCompileConfigModel, ARMStorageLayout,
    RiscvCompileData, AnyGccCompileData,
    getRamRomName,
    getRamRomRange
} from "../EIDEProjectModules";
import { WorkspaceManager } from '../WorkspaceManager';
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
} from '../StringTable';
import { CodeBuilder, BuildOptions } from '../CodeBuilder';
import { ExceptionToMessage, newMessage } from '../Message';
import { SettingManager } from '../SettingManager';
import { HexUploaderManager, HexUploaderType, JLinkOptions, JLinkProtocolType, OpenOCDFlashOptions, PyOCDFlashOptions } from '../HexUploader';
import { SevenZipper, CompressOption } from '../Compress';
import { DependenceManager } from '../DependenceManager';
import { ArrayDelRepetition } from '../../lib/node-utility/Utility';
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
} from '../utility';
import { concatSystemEnvPath, DeleteDir, exeSuffix, kill, osType, DeleteAllChildren, userhome, getGlobalState } from '../Platform';
import { KeilARMOption, KeilC51Option, KeilParser, KeilRteDependence, C51Parser, ARMParser } from '../KeilXmlParser';
import { VirtualDocument } from '../VirtualDocsProvider';
import { ResInstaller } from '../ResInstaller';
import { ExeCmd, ExecutableOption, ExeFile } from '../../lib/node-utility/Executable';
import { CmdLineHandler } from '../CmdLineHandler';
import { WebPanelManager } from '../WebPanelManager';
import * as yml from 'yaml';
import { GitFileInfo } from '../WebInterface/GithubInterface';
import {
    CppToolsApi, Version, CustomConfigurationProvider, getCppToolsApi,
    SourceFileConfigurationItem, WorkspaceBrowseConfiguration
} from 'vscode-cpptools';
import * as eclipseParser from '../EclipseProjectParser';
import { isArray } from 'util';
import { parseIarCompilerLog, CompilerDiagnostics, parseGccCompilerLog, parseArmccCompilerLog, parseKeilc51CompilerLog, parseSdccCompilerLog, parseCosmicStm8CompilerLog } from '../ProblemMatcher';
import * as iarParser from '../IarProjectParser';
import * as cmakeParser from '../CmakeProjectParser';
import * as ArmCpuUtils from '../ArmCpuUtils';
import { ShellFlasherIndexItem } from '../WebInterface/WebInterface';
import { jsonc } from 'jsonc';
import { SimpleUIConfig, SimpleUIConfigData_input, SimpleUIConfigData_options, SimpleUIConfigData_text, SimpleUIConfigData_table, SimpleUIConfigData_boolean, SimpleUIConfigData_divider, SimpleUIConfigData_tag } from "../SimpleUIDef";
import { StatusBarManager } from '../StatusBarManager';
import { doMigration, detectProject } from '../EIDEProjectMigration';

export enum TreeItemType {
    SOLUTION,
    PROJECT,

    PACK,
    PACK_GROUP,
    COMPONENT_GROUP,

    DEPENDENCE,
    DEPENDENCE_GROUP,
    DEPENDENCE_SUB_GROUP,
    DEPENDENCE_GROUP_ARRAY_FIELD,
    DEPENDENCE_ITEM,

    COMPILE_CONFIGURATION,
    COMPILE_CONFIGURATION_ITEM,

    UPLOAD_OPTION,
    UPLOAD_OPTION_GROUP,
    UPLOAD_OPTION_ITEM,

    SETTINGS,
    SETTINGS_ITEM,

    //
    // item must end with '_ITEM'
    //

    ITEM,
    GROUP,

    //
    // clickable file item must end with '_FILE_ITEM'
    //

    // file system folder
    FOLDER,
    EXCFOLDER,
    FOLDER_ROOT,
    EXCFILE_ITEM,
    FILE_ITEM,

    // virtual folder
    V_FOLDER,
    V_EXCFOLDER,
    V_FOLDER_ROOT,
    V_EXCFILE_ITEM,
    V_FILE_ITEM,

    // source refs
    SRCREF_FILE_ITEM,

    // output 
    OUTPUT_FOLDER,
    OUTPUT_FILE_ITEM,

    ACTIVED_ITEM,
    ACTIVED_GROUP
}

export function getTreeItemTypeName(typ: TreeItemType): string {
    return TreeItemType[typ];
}

export type GroupRegion = 'PACK' | 'Components' | 'ComponentItem';

export interface TreeItemValue {
    label?: string;         // UI item label, if it's null, item label is '${keyAlias || key} : ${value}' or '${value}'
    key?: string;           // key name will be show in label
    keyAlias?: string;      // key's alias name will be show in label
    value: string | File;   // if TreeItem refer to a file, the value type must be 'File'
    isVirtualFile?: boolean;
    contextVal?: string;
    tooltip?: string | vscode.MarkdownString;
    icon?: string;
    obj?: any;
    childKey?: string;
    child?: string[];
    projectIndex: number;
    groupRegion?: GroupRegion;
    collapsibleState?: vscode.TreeItemCollapsibleState;
    otherCtx?: { [key: string]: string | boolean | number; };
}

export type ModifiableDepType = 'INC_GROUP' | 'INC_ITEM'
    | 'DEFINE_GROUP' | 'DEFINE_ITEM'
    | 'LIB_GROUP' | 'LIB_ITEM'
    | 'SOURCE_GROUP' | 'SOURCE_ITEM'
    | 'None';

export class ModifiableDepInfo {

    type: ModifiableDepType;

    constructor(_type: ModifiableDepType, key?: string) {
        this.type = _type;
        if (key) {
            switch (key) {
                case 'incList':
                    this.type = 'INC_GROUP';
                    break;
                case 'defineList':
                    this.type = 'DEFINE_GROUP';
                    break;
                case 'libList':
                    this.type = 'LIB_GROUP';
                    break;
                // case 'sourceList':
                //     this.type = 'SOURCE_GROUP';
                //     break;
                default:
                    this.type = 'None';
                    break;
            }
        }
    }

    GetItemDepType(): ModifiableDepInfo {
        switch (this.type) {
            case 'INC_GROUP':
                return new ModifiableDepInfo('INC_ITEM');
            case 'DEFINE_GROUP':
                return new ModifiableDepInfo('DEFINE_ITEM');
            case 'LIB_GROUP':
                return new ModifiableDepInfo('LIB_ITEM');
            case 'SOURCE_GROUP':
                return new ModifiableDepInfo('SOURCE_ITEM');
            default:
                return new ModifiableDepInfo('None');
        }
    }
}

export class ProjTreeItem extends vscode.TreeItem {

    static ITEM_CLICK_EVENT = 'ProjectView.ItemClick';

    static PROJ_ROOT_ITEM_TYPES = [
        TreeItemType.PROJECT,
        TreeItemType.PACK,
        TreeItemType.COMPILE_CONFIGURATION,
        TreeItemType.UPLOAD_OPTION,
        TreeItemType.DEPENDENCE,
        TreeItemType.SETTINGS,
    ];

    type: TreeItemType;
    val: TreeItemValue;

    constructor(type: TreeItemType, val: TreeItemValue, prjUid?: string) {

        super('', vscode.TreeItemCollapsibleState.None);

        if (val.value instanceof File) {
            this.label = val.value.name;
        } else {
            const name = val.keyAlias || val.key;
            this.label = name ? `${name} : ${val.value}` : val.value;
        }

        if (val.label) {
            this.label = val.label;
        }

        // setup unique id
        if (prjUid) {
            // tree root's id is project uid
            if (type == TreeItemType.SOLUTION) {
                this.id = prjUid;
            }
            // tree sub item's id is their type
            else if (ProjTreeItem.PROJ_ROOT_ITEM_TYPES.includes(type)) {
                this.id = `${prjUid}:${TreeItemType[type]}`;
            }
        }

        this.val = val;
        this.type = type;

        this.contextValue = this.GetContext();
        this.tooltip = this.GetTooltip();

        if (ProjTreeItem.isItem(type)) {
            this.command = {
                command: ProjTreeItem.ITEM_CLICK_EVENT,
                title: ProjTreeItem.ITEM_CLICK_EVENT,
                arguments: [this]
            };
        }

        this.collapsibleState = val.collapsibleState || this.GetCollapsibleState(type);

        this.InitIcon();
    }

    public static isItem(type: TreeItemType): boolean {
        return TreeItemType[type].endsWith('ITEM');
    }

    public static isFileItem(type: TreeItemType): boolean {
        return TreeItemType[type].endsWith('FILE_ITEM');
    }

    public static isVirtualFolderItem(type: TreeItemType): boolean {
        return TreeItemType[type].startsWith('V_FOLDER');
    }

    private GetTooltip(): string | vscode.MarkdownString {

        if (this.val.tooltip) {
            return this.val.tooltip;
        }

        if (this.val.value instanceof File) {
            return this.val.value.path;
        } else if (ProjTreeItem.isItem(this.type)) {
            return this.val.value;
        }

        return TreeItemType[this.type];
    }

    private GetContext(): string {

        if (this.val.obj instanceof ModifiableDepInfo) {
            return this.val.obj.type;
        }

        if (this.val.contextVal) {
            return this.val.contextVal;
        }

        return TreeItemType[this.type];
    }

    private GetCollapsibleState(type: TreeItemType): vscode.TreeItemCollapsibleState {
        if (ProjTreeItem.isItem(type)) {
            return vscode.TreeItemCollapsibleState.None;
        }
        return vscode.TreeItemCollapsibleState.Collapsed;
    }

    private InitIcon() {

        const iconName = this.val.icon ? this.val.icon : this.GetIconName();
        if (iconName !== undefined) {

            if (iconName instanceof vscode.ThemeIcon) {
                this.iconPath = iconName;
                return;
            }

            const iconFile = ResManager.GetInstance().GetIconByName(iconName);
            if (iconFile !== undefined) {
                this.iconPath = {
                    light: iconFile.path,
                    dark: iconFile.path
                };
            } else {
                GlobalEvent.emit('msg', newMessage('Warning', 'Load Icon \'' + iconName + '\' Failed!'));
            }
        }
    }

    private getSourceFileIconName(fileName_: string, suffix_: string): string | vscode.ThemeIcon | undefined {

        let name: string | vscode.ThemeIcon | undefined;

        const fileName = fileName_.toLowerCase();
        const suffix = suffix_.toLowerCase();

        switch (suffix) {
            case '.c':
                if (this.val.otherCtx && this.val.otherCtx['hasExtraArgs']) {
                    name = 'file_type_c_configured.svg';
                } else {
                    name = 'file_type_c.svg';
                }
                break;
            case '.h':
                name = 'file_type_cheader.svg';
                break;
            case '.cpp':
            case '.cc':
            case '.cxx':
            case '.c++':
                if (this.val.otherCtx && this.val.otherCtx['hasExtraArgs']) {
                    name = 'file_type_cpp_configured.svg';
                } else {
                    name = 'file_type_cpp.svg';
                }
                break;
            case '.hpp':
            case '.hxx':
            case '.inc':
                name = 'file_type_cppheader.svg';
                break;
            case '.s':
            case '.asm':
            case '.a51':
                if (this.val.otherCtx && this.val.otherCtx['hasExtraArgs']) {
                    name = 'AssemblerSourceFile_configured_16x.svg';
                } else {
                    name = 'AssemblerSourceFile_16x.svg';
                }
                break;
            case '.lib':
            case '.a':
                name = 'Library_16x.svg';
                break;
            case '.o':
            case '.obj':
            case '.axf':
            case '.elf':
            case '.bin':
            case '.out':
            case '.sm8':
                name = 'file_type_binary.svg';
                break;
            case '.map':
                name = 'file_type_map.svg';
                break;
            // other suffix
            default:
                if (fileName.endsWith('.map.view')) {
                    name = 'Report_16x.svg';
                } else {
                    name = vscode.ThemeIcon.File; //'document-light.svg';
                }
                break;
        }

        return name;
    }

    private GetIconName(): string | vscode.ThemeIcon | undefined {
        let name: string | vscode.ThemeIcon | undefined;

        switch (this.type) {
            /* case TreeItemType.SRCREF_FILE_ITEM:
                name = 'Reference_16x.svg';
                break; */
            case TreeItemType.EXCFILE_ITEM:
            case TreeItemType.V_EXCFILE_ITEM:
                name = 'FileExclude_16x.svg';
                break;
            case TreeItemType.EXCFOLDER:
            case TreeItemType.V_EXCFOLDER:
                name = 'FolderExclude_32x.svg';
                break;
            case TreeItemType.FOLDER:
                if (this.val.otherCtx && this.val.otherCtx['hasExtraArgs']) {
                    name = 'folder_type_config.svg';
                } else {
                    name = 'Folder_32x.svg';
                }
                break;
            case TreeItemType.FOLDER_ROOT:
                if (this.val.otherCtx && this.val.otherCtx['hasExtraArgs']) {
                    name = 'FolderRoot_configured_32x.svg';
                } else {
                    name = 'FolderRoot_32x.svg';
                }
                break;
            case TreeItemType.V_FOLDER:
            case TreeItemType.V_FOLDER_ROOT:
                if (this.val.otherCtx && this.val.otherCtx['hasExtraArgs']) {
                    name = 'folder_type_config.svg';
                } else {
                    name = 'folder_virtual.svg';
                }
                break;
            case TreeItemType.COMPONENT_GROUP:
                name = 'Component_16x.svg';
                break;
            case TreeItemType.PACK_GROUP:
                name = 'Cube_16x.svg';
                break;
            case TreeItemType.DEPENDENCE_SUB_GROUP:
            case TreeItemType.GROUP:
                name = 'CheckboxGroup_16x.svg';
                break;
            case TreeItemType.SOLUTION:
                name = 'ApplicationClass_16x.svg';
                break;
            case TreeItemType.PROJECT:
                name = 'Class_16x.svg';
                break;
            case TreeItemType.COMPILE_CONFIGURATION:
                name = 'Builder_16x.svg';
                break;
            case TreeItemType.PACK: // only for cpu pakage, not cmsis package
                name = 'CPU_16x.svg';
                break;
            case TreeItemType.UPLOAD_OPTION:
                name = 'TransferDownload_16x.svg';
                break;
            case TreeItemType.DEPENDENCE_GROUP:
                name = 'DependencyGraph_16x.svg';
                break;
            case TreeItemType.DEPENDENCE:
                name = 'Property_16x.svg';
                break;
            case TreeItemType.SETTINGS:
                name = 'Settings_16x.svg';
                break;
            case TreeItemType.SETTINGS_ITEM:
                name = 'Property_16x.svg';
                break;
            case TreeItemType.DEPENDENCE_GROUP_ARRAY_FIELD:
                name = 'KPI_16x.svg';
                break;
            case TreeItemType.ACTIVED_GROUP:
                name = 'TestCoveredPassing_16x.svg';//'RecursivelyCheckAll_16x.svg';
                break;
            case TreeItemType.OUTPUT_FOLDER:
                name = 'folder_type_binary.svg';
                break;
            default:
                {
                    // if it's a source file, get icon
                    if (ProjTreeItem.isFileItem(this.type) && this.val.value instanceof File) {
                        const file: File = this.val.value;
                        // if file is existed, get icon by suffix
                        if (file.IsFile()) {
                            name = this.getSourceFileIconName(file.name, file.suffix);
                        }
                        // if file not existed, show warning icon
                        else {
                            name = 'StatusWarning_16x.svg';
                        }
                    }
                }
                break;
        }

        return name;
    }
}

export interface ItemCache {
    root: ProjTreeItem;
    [name: string]: ProjTreeItem;
}

export interface ItemClickInfo {
    name: string;
    time: number;
}

export interface VirtualFolderInfo {
    path: string;
    vFolder: VirtualFolder;
}

export interface VirtualFileInfo {
    path: string;       // virtual path
    vFile: VirtualFile; // virtual file info
}

export class ProjectItemCache {

    // <projectPath, {root: TreeItem, itemList: TreeItem[]}>
    private itemCache: Map<string, ItemCache> = new Map();

    clear() {
        this.itemCache.clear();
    }

    getRootTreeItem(prj: AbstractProject): ProjTreeItem | undefined {
        const cache = this.itemCache.get(prj.getWsPath());
        if (cache) {
            return cache.root;
        }
    }

    getTreeItem(prj: AbstractProject, itemType: TreeItemType): ProjTreeItem | undefined {
        const cache = this.itemCache.get(prj.getWsPath());
        if (cache) {
            return cache[TreeItemType[itemType]];
        }
    }

    setTreeItem(prj: AbstractProject, item: ProjTreeItem, isRoot?: boolean) {
        const cache = this.itemCache.get(prj.getWsPath());
        if (cache) {
            if (isRoot) {
                cache.root = item;
            } else {
                cache[TreeItemType[item.type]] = item;
            }
        } else if (isRoot) { // if not found and type is root, set it
            this.itemCache.set(prj.getWsPath(), { root: item });
        }
    }

    delTreeItem(prj: AbstractProject, itemType?: TreeItemType): ProjTreeItem | undefined {
        const cache = this.itemCache.get(prj.getWsPath());
        if (cache) {
            if (itemType) {
                const key = TreeItemType[itemType];
                const deleted = cache[key];
                cache[key] = <any>undefined; // del item
                return deleted;
            } else { // del all
                this.itemCache.delete(prj.getWsPath());
            }
        }
    }
}

export class ProjectDataProvider implements vscode.TreeDataProvider<ProjTreeItem>, vscode.TreeDragAndDropController<ProjTreeItem> {

    private static readonly recName = 'sln.record';
    private static readonly RecMaxNum = 50;

    private event: events.EventEmitter;
    private prjList: AbstractProject[] = [];
    private slnRecord: string[] = [];
    private recFile: File;
    private context: vscode.ExtensionContext;
    private activePrjPath: string | undefined;

    // project tree item refresh cache
    treeCache: ProjectItemCache = new ProjectItemCache();

    onDidChangeTreeData?: vscode.Event<ProjTreeItem | null | undefined> | undefined;
    dataChangedEvent: vscode.EventEmitter<ProjTreeItem | undefined>;

    constructor(_context: vscode.ExtensionContext) {

        this.event = new events.EventEmitter();
        this.context = _context;
        this.dataChangedEvent = new vscode.EventEmitter<ProjTreeItem>();
        this.context.subscriptions.push(this.dataChangedEvent);
        this.onDidChangeTreeData = this.dataChangedEvent.event;
        this.recFile = File.fromArray([ResManager.GetInstance().getEideHomeFolder().path, ProjectDataProvider.recName]);
        this.loadRecord();
    }

    onDispose() {
        this.SaveAll();
        this.CloseAll();
        this.saveRecord();
    }

    public on(event: 'rootItems_inited', listener: () => void): void;
    public on(event: any, listener: (arg?: any) => void): void {
        this.event.on(event, listener);
    }

    //---------------------------------------
    // TreeDragAndDropController
    //---------------------------------------

    static readonly PROJECT_TREE_ITEM_MIME_ID: string = `application/vnd.code.tree.cl.eide.view.projects`;

    readonly dragMimeTypes: string[] = [
        ProjectDataProvider.PROJECT_TREE_ITEM_MIME_ID
    ];

    readonly dropMimeTypes: string[] = [
        ProjectDataProvider.PROJECT_TREE_ITEM_MIME_ID,
        'text/uri-list'
    ];

    handleDrag(source: readonly ProjTreeItem[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Thenable<void> | void {

        console.log('[cl.eide] handleDrag');
        console.log(source);

        const fList: File[] = [];

        for (const treeItem of source) {
            if (ProjTreeItem.isFileItem(treeItem.type) &&
                treeItem.val.value instanceof File) {
                fList.push(treeItem.val.value);
            }
        }

        if (fList.length > 0) {
            const val = fList.map(f => vscode.Uri.file(f.path).toString()).join('\r\n');
            dataTransfer.set('text/uri-list', new vscode.DataTransferItem(val));
        }
    }

    handleDrop(target: ProjTreeItem | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Thenable<void> | void {

        console.log('[cl.eide] handleDrop');

        if (target == undefined)
            return;

        console.log(target);

        if (!ProjTreeItem.isVirtualFolderItem(target.type) && target.type != TreeItemType.PROJECT) {
            console.log(`[cl.eide] 'target' is not a virtual folder`);
            return; // it's not a virtual folder
        }

        const targetProject = this.GetProjectByIndex(target.val.projectIndex);
        const targetProjectUid = targetProject.getUid();
        const targetVirtualFolder = <VirtualFolderInfo>target.val.obj;

        let dataTransferItem: vscode.DataTransferItem | undefined;

        // DataTransferItem struct:
        //   data:{ value: '{"id":"cl.eide.view.projects","itemHandles":[0/…3b0d9bcc1193787cc:PROJECT/0:user/0:dlink.h"]}' }
        dataTransferItem = dataTransfer.get(ProjectDataProvider.PROJECT_TREE_ITEM_MIME_ID);
        if (dataTransferItem) {

            const vPaths = (<string[]>JSON.parse(dataTransferItem.value)['itemHandles'])
                .filter(s => s.includes(`${targetProjectUid}:PROJECT/`))
                .map(s => s.replace(/^.+?:PROJECT\//, `${VirtualSource.rootName}/`).replace(/\d+:/g, ''));

            console.log(`[cl.eide] try drop file items '[ ${vPaths.join(', ')} ]' -> '${targetVirtualFolder.path}/'`);

            const vSourceManager = targetProject.getVirtualSourceManager();

            for (const vpath of vPaths) {

                // if it is itself, ignore
                if (vpath == targetVirtualFolder.path) {
                    console.log(`[cl.eide] '${vpath}' -> '${targetVirtualFolder.path}/' it is itself, ignore`);
                    continue;
                }

                // it's a file ?
                const vf = vSourceManager.getFile(vpath);
                if (vf) {
                    const nf = vSourceManager.addFile(targetVirtualFolder.path, vf.path);
                    if (nf) { // moved done, del old
                        vSourceManager.removeFile(vpath);
                        console.log(`[cl.eide] '${vpath}' -> '${targetVirtualFolder.path}/' moved done`);
                    }
                    continue;
                }

                // it's a folder ?
                const vd = vSourceManager.getFolder(vpath);
                if (vd && !File.isSubPathOf(vpath, targetVirtualFolder.path)) { // can't move parent into their child
                    const npath = vSourceManager.insertFolder(targetVirtualFolder.path, vd);
                    if (npath) { // moved done, del old
                        vSourceManager.removeFolder(vpath);
                        console.log(`[cl.eide] '${vpath}' -> '${targetVirtualFolder.path}/' moved done`);
                    }
                    continue;
                }
            }

            return;
        }

        // DataTransferItem struct:
        //  data:{ value: 'file:///c%3A/xx/xxx.c\r\nfile:///xxx/xxx/m.c' }
        dataTransferItem = dataTransfer.get('text/uri-list');
        if (dataTransferItem) {
            const fileList: string[] = (<string>dataTransferItem.value).split(/\r\n|\n/).map(s => vscode.Uri.parse(s).fsPath);
            console.log(`[cl.eide] drop files: { ${fileList.join(',')} }`);
            targetProject.getVirtualSourceManager().addFiles(targetVirtualFolder.path, fileList);
            return;
        }
    }

    // ------------------------------------------

    onProjectChanged(prj: AbstractProject, type?: DataChangeType) {

        switch (type) {
            case 'files':
                this.UpdateView(this.treeCache.getTreeItem(prj, TreeItemType.PROJECT));
                break;
            case 'compiler':
                this.UpdateView(this.treeCache.getTreeItem(prj, TreeItemType.COMPILE_CONFIGURATION));
                break;
            case 'uploader':
                this.UpdateView(this.treeCache.getTreeItem(prj, TreeItemType.UPLOAD_OPTION));
                break;
            case 'pack':
                this.UpdateView(this.treeCache.getTreeItem(prj, TreeItemType.PACK));
                break;
            case 'dependence':
                this.UpdateView(this.treeCache.getTreeItem(prj, TreeItemType.PACK));
                this.UpdateView(this.treeCache.getTreeItem(prj, TreeItemType.DEPENDENCE));
                break;
            default:
                this.UpdateView();
                break;
        }

        prj.Save(false, 1000); // save project file with a delay
    }

    LoadWorkspaceProject(workspaceState: vscode.Memento) {

        const workspaceManager = WorkspaceManager.getInstance();

        // not a workspace, exit
        if (workspaceManager.getWorkspaceRoot() === undefined) {
            return;
        }

        const wsFolders = workspaceManager.getWorkspaceList();
        const validList: File[] = [];

        for (const wsDir of wsFolders) {
            const wsList = wsDir.GetList([/.code-workspace$/i], File.EXCLUDE_ALL_FILTER);
            if (wsList.length > 0) {
                if (detectProject(wsDir)) {
                    validList.push(wsList[0]);
                }
            }
        }

        /* init active project */
        if (validList.length > 0) {
            this.activePrjPath = validList[0].path;
        }

        /* if prj count > 1, this is a workspace project
         * active workspace control btns
         */
        if (validList.length > 1) {
            vscode.commands.executeCommand('setContext', 'cl.eide.isWorkspaceProject', true);
        }

        for (const wsFile of validList) {
            this._OpenProject(wsFile.path, workspaceState);
        }
    }

    GetProjectByIndex(index: number): AbstractProject {
        return this.prjList[index];
    }

    getProjectByUid(uid: string): AbstractProject | undefined {
        const idx = this.getIndexByProjectUid(uid);
        if (idx != -1) {
            return this.GetProjectByIndex(idx);
        }
    }

    getIndexByProjectUid(uid: string): number {
        return this.prjList.findIndex(prj => prj.getUid() == uid);
    }

    getProjectCount(): number {
        return this.prjList.length;
    }

    /**
     * traverse all projects by async mode
     * @note if callbk_func's return code == true, loop will be break
     */
    async traverseProjectsAsync(fn: (prj: AbstractProject, index: number) => Promise<boolean | undefined>) {
        for (let index = 0; index < this.prjList.length; index++) {
            const res = await fn(this.prjList[index], index);
            if (res) { break; }
        }
    }

    /**
     * traverse all projects by block mode
     * @note if callbk_func's return code == true, loop will be break
     */
    traverseProjects(fn: (prj: AbstractProject, index: number) => boolean | undefined) {
        for (let index = 0; index < this.prjList.length; index++) {
            const res = fn(this.prjList[index], index);
            if (res) { break; }
        }
    }

    foreachProject(callbk: (val: AbstractProject, index: number) => void): void {
        this.prjList.forEach(callbk);
    }

    UpdateView(ele?: ProjTreeItem) {

        // update treeview ui
        this.dataChangedEvent.fire(ele);

        // whole treeview updated
        this.updateStatusBarForActiveProjects();
    }

    updateStatusBarForActiveProjects() {

        const statusbars = StatusBarManager.getInstance();

        statusbars.foreach((bar, name) => {

            const activeProj = this.getActiveProject();

            if (name == 'project') {
                bar.text = `EIDE Project: ${activeProj?.getCurrentTarget() || 'unspecified'}`;
                if (activeProj) {
                    let txt = `Switch target for eide project:`;
                    txt += `${os.EOL}  - path: \`${activeProj.getProjectRoot().path}\``;
                    bar.tooltip = new vscode.MarkdownString(txt);
                } else {
                    bar.tooltip = `Switch target for eide project`;
                }
            }

            else if (name == 'build') {
                bar.text = `$(tools) Build`;
                if (activeProj) {
                    let txt = `Build eide project:`;
                    const repath = activeProj.ToRelativePath(activeProj.getExecutablePath());
                    txt += `${os.EOL}  - output: \`${repath}\``;
                    bar.tooltip = new vscode.MarkdownString(txt);
                } else {
                    bar.tooltip = `Build eide project`;
                }
            }

            else if (name == 'flash') {
                bar.text = '$(arrow-down) Flash';
                if (activeProj) {
                    try {
                        const flasher = HexUploaderManager.getInstance().createUploader(activeProj);
                        let txt = `Upload binary file to device:`;
                        flasher.getAllProgramFiles().forEach(f => {
                            const repath = activeProj.ToRelativePath(f.path) || f.path;
                            txt += `${os.EOL}  - \`${repath}\``;
                        });
                        bar.tooltip = new vscode.MarkdownString(txt);
                    } catch (error) {
                        bar.tooltip = `Upload binary file to device`;
                        GlobalEvent.log_error(error);
                    }
                } else {
                    bar.tooltip = `Upload binary file to device`;
                }
            }
        });
    }

    clearTreeViewCache() {
        this.treeCache.clear();
    }

    isRootWorkspaceProject(prj: AbstractProject): boolean {
        const rootDir = prj.GetRootDir();
        const wsDir = WorkspaceManager.getInstance().getWorkspaceRoot();
        if (rootDir && wsDir) {
            return rootDir.path === wsDir.path;
        }
        return false;
    }

    getActiveProject(): AbstractProject | undefined {

        if (this.prjList.length == 1) {
            return this.prjList[0];
        }

        const index = this.prjList.findIndex((prj) => prj.getWsPath() == this.activePrjPath);
        if (index != -1) {
            return this.prjList[index];
        }
    }

    getParent(element: ProjTreeItem): vscode.ProviderResult<ProjTreeItem> {

        if (element.type == TreeItemType.SOLUTION)
            return undefined;

        if (ProjTreeItem.PROJ_ROOT_ITEM_TYPES.includes(element.type))
            return this.treeCache.getRootTreeItem(this.GetProjectByIndex(element.val.projectIndex));

        /* 除了几个根节点之外，其他的忽略，getParent 主要用于 {@link TreeView.reveal reveal} API. */
        return undefined;
    }

    getTreeItem(element: ProjTreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren(element?: ProjTreeItem | undefined): vscode.ProviderResult<ProjTreeItem[]> {

        let iList: ProjTreeItem[] = [];

        if (element === undefined) {

            this.prjList.forEach((project, projectIndex) => {

                // --- init root Treeitem

                const isActived = this.activePrjPath === project.getWsPath();
                const miscInfo = project.GetConfiguration().config.miscInfo;
                const isCmakeProject = miscInfo && (<any>miscInfo).source_project && (<any>miscInfo).source_project.type === 'cmake';
                const isKeilProject = miscInfo && ((<any>miscInfo).mdk_project_path || ((<any>miscInfo).source_project && (<any>miscInfo).source_project.type === 'mdk'));

                const cItem = new ProjTreeItem(TreeItemType.SOLUTION, {
                    value: project.getProjectName() + ' : ' + project.getProjectCurrentTargetName(),
                    projectIndex: projectIndex,
                    contextVal: isCmakeProject ? 'SOLUTION_CMAKE' : 'SOLUTION',
                    icon: this.prjList.length > 1 ? (isActived ? 'active.svg' : 'idle.svg') : undefined,
                    tooltip: new vscode.MarkdownString([
                        `**Name:** \`${project.getProjectName()}\``,
                        `- **Uid:** \`${project.getUid()}\``,
                        `- **Config:** \`${project.getProjectCurrentTargetName()}\``,
                        `- **Path:** \`${project.GetRootDir().path}\``
                    ].join(os.EOL)),
                }, project.getUid());

                if (isCmakeProject) {
                    // Watch all CMakeLists.txt files in the project directory
                    const projectRoot = project.GetRootDir().path.replace(/\\/g, '/');
                    const globPattern = `${projectRoot}/**/CMakeLists.txt`;
                    console.log('[EIDE DEBUG] Registering CMake watcher with glob:', globPattern);
                    this.registerCmakeWatcher(project, globPattern);
                }

                // Auto-register Keil project watcher on project load
                if (isKeilProject) {
                    let keilProjectPath: string | undefined;
                    if ((<any>miscInfo).mdk_project_path) {
                        keilProjectPath = (<any>miscInfo).mdk_project_path;
                    } else if ((<any>miscInfo).source_project && (<any>miscInfo).source_project.path) {
                        keilProjectPath = project.ToAbsolutePath((<any>miscInfo).source_project.path);
                    }
                    if (keilProjectPath && new File(keilProjectPath).IsFile()) {
                        this.registerKeilWatcher(project, keilProjectPath);
                    }
                }

                iList.push(cItem);
                // cache project root item
                this.treeCache.setTreeItem(project, cItem, true);

                // --- pre-init primary TreeItems

                const primaryItems: ProjTreeItem[] = [];

                primaryItems.push(new ProjTreeItem(TreeItemType.PROJECT, {
                    value: view_str$project$title,
                    projectIndex: projectIndex,
                    tooltip: view_str$project$title,
                    obj: <VirtualFolderInfo>{ path: VirtualSource.rootName, vFolder: project.getVirtualSourceRoot() }
                }, project.getUid()));

                if (project.getProjectType() === 'ARM') { // only display for ARM project 
                    primaryItems.push(new ProjTreeItem(TreeItemType.PACK, {
                        value: pack_info,
                        projectIndex: projectIndex,
                        tooltip: pack_info
                    }, project.getUid()));
                }

                const toolchain = project.getToolchain();
                const toolprefix = toolchain.getToolchainPrefix ? toolchain.getToolchainPrefix() : undefined;
                primaryItems.push(new ProjTreeItem(TreeItemType.COMPILE_CONFIGURATION, {
                    value: `${compile_config} : ${toolchain.name}`,
                    projectIndex: projectIndex,
                    tooltip: newMarkdownString([
                        `${compile_config} : ${toolchain.name}`,
                        ` - **Id:** \`${toolchain.name}\``,
                        ` - **Prefix:** ` + (toolprefix ? `\`${toolprefix}\`` : ''),
                        ` - **Family:** \`${toolchain.categoryName}\``,
                        ` - **Description:** \`${ToolchainManager.getInstance().getToolchainDesc(toolchain.name)}\``,
                    ])
                }, project.getUid()));

                const curUploader = project.GetConfiguration().uploadConfigModel.uploader;
                const uploaderLabel = HexUploaderManager.getInstance().getUploaderLabelByName(curUploader);
                primaryItems.push(new ProjTreeItem(TreeItemType.UPLOAD_OPTION, {
                    value: `${uploadConfig_desc} : ${uploaderLabel}`,
                    projectIndex: projectIndex,
                    contextVal: curUploader == 'Custom' ? `${getTreeItemTypeName(TreeItemType.UPLOAD_OPTION)}_Shell` : undefined,
                    tooltip: `${uploadConfig_desc} : ${uploaderLabel}`
                }, project.getUid()));

                primaryItems.push(new ProjTreeItem(TreeItemType.DEPENDENCE, {
                    value: project_dependence,
                    projectIndex: projectIndex,
                    tooltip: project_dependence
                }, project.getUid()));

                primaryItems.push(new ProjTreeItem(TreeItemType.SETTINGS, {
                    value: view_str$project$other_settings,
                    projectIndex: projectIndex,
                    tooltip: view_str$project$other_settings
                }, project.getUid()));

                // cache primary views
                primaryItems.forEach(item => this.treeCache.setTreeItem(project, item));
            });

            // --- notify primary items all inited
            setTimeout(() => this.event.emit('rootItems_inited'), 300);

        } else {

            const project = this.prjList[element.val.projectIndex];
            const prjExtraArgs = project.getSourceExtraArgsCfg();

            switch (element.type) {
                case TreeItemType.SOLUTION:
                    {
                        const itemTypes: TreeItemType[] = [
                            TreeItemType.PROJECT,
                            TreeItemType.PACK,
                            TreeItemType.COMPILE_CONFIGURATION,
                            TreeItemType.UPLOAD_OPTION,
                            TreeItemType.DEPENDENCE,
                            TreeItemType.SETTINGS,
                        ];

                        for (const itemType of itemTypes) {
                            const item = this.treeCache.getTreeItem(project, itemType);
                            if (item) {
                                iList.push(item);
                            }
                        }
                    }
                    break;
                case TreeItemType.PROJECT:
                    {
                        // add some specific folder to first
                        const _depsFolder = project
                            .getVirtualSourceManager()
                            .getFolder(`${VirtualSource.rootName}/${DependenceManager.DEPS_VFOLDER_NAME}`);
                        if (_depsFolder && (_depsFolder.files.length + _depsFolder.folders.length) > 0) {
                            const folderDispName = view_str$project$cmsis_components;
                            const itemType = TreeItemType.V_FOLDER_ROOT;
                            const vFolderPath = `${VirtualSource.rootName}/${_depsFolder.name}`;
                            const hasExtraArgs = project.hasExtraArgsForFolder(vFolderPath, prjExtraArgs, true);
                            iList.push(new ProjTreeItem(itemType, {
                                value: folderDispName,
                                obj: <VirtualFolderInfo>{ path: vFolderPath, vFolder: _depsFolder },
                                projectIndex: element.val.projectIndex,
                                otherCtx: { hasExtraArgs: hasExtraArgs },
                                contextVal: 'FOLDER_ROOT_DEPS',
                                icon: 'DependencyGraph_16x.svg',
                                tooltip: newFileTooltipString({
                                    name: folderDispName,
                                    path: vFolderPath,
                                    desc: undefined,
                                    attr: {
                                        'SubFiles': _depsFolder.files.length.toString(),
                                        'SubFolders': _depsFolder.folders.length.toString()
                                    }
                                })
                            }));
                        }

                        // push filesystem source folder
                        project.getSourceRootFolders()
                            .sort((folder_1, folder_2) => { return folder_1.displayName.localeCompare(folder_2.displayName); })
                            .forEach((rootInfo) => {
                                const folderDispName = rootInfo.displayName;
                                const isExisted = rootInfo.fileWatcher.file.IsDir();
                                let dirIcon: string | undefined;
                                if (rootInfo.needUpdate || !isExisted) dirIcon = 'StatusWarning_16x.svg';
                                let dirDesc: string | undefined;
                                if (rootInfo.needUpdate) dirDesc = view_str$project$needRefresh;
                                if (!isExisted) dirDesc = view_str$project$fileNotExisted;
                                const hasExtraArgs = project.hasExtraArgsForFolder(rootInfo.fileWatcher.file.path, prjExtraArgs);
                                iList.push(new ProjTreeItem(TreeItemType.FOLDER_ROOT, {
                                    value: folderDispName,
                                    obj: rootInfo.fileWatcher.file,
                                    projectIndex: element.val.projectIndex,
                                    icon: dirIcon,
                                    otherCtx: { hasExtraArgs: hasExtraArgs },
                                    tooltip: newFileTooltipString({
                                        name: rootInfo.displayName,
                                        path: rootInfo.fileWatcher.file.path,
                                        desc: dirDesc,
                                        attr: {}
                                    }, project.getRootDir())
                                }));
                            });

                        // push virtual source folder
                        project.getVirtualSourceRoot().folders
                            .sort((folder1, folder2) => { return folder1.name.localeCompare(folder2.name); })
                            .forEach((vFolder) => {
                                if (vFolder.name == DependenceManager.DEPS_VFOLDER_NAME) return; // skip <deps> folder
                                const vFolderPath = `${VirtualSource.rootName}/${vFolder.name}`;
                                const isExcluded = project.isExcluded(vFolderPath);
                                const itemType = isExcluded ? TreeItemType.V_EXCFOLDER : TreeItemType.V_FOLDER_ROOT;
                                const hasExtraArgs = project.hasExtraArgsForFolder(vFolderPath, prjExtraArgs, true);
                                iList.push(new ProjTreeItem(itemType, {
                                    value: vFolder.name,
                                    obj: <VirtualFolderInfo>{ path: vFolderPath, vFolder: vFolder },
                                    projectIndex: element.val.projectIndex,
                                    otherCtx: { hasExtraArgs: hasExtraArgs },
                                    tooltip: newFileTooltipString({
                                        name: vFolder.name,
                                        path: vFolderPath,
                                        desc: isExcluded ? view_str$project$excludeFolder : undefined,
                                        attr: {
                                            'SubFiles': vFolder.files.length.toString(),
                                            'SubFolders': vFolder.folders.length.toString()
                                        }
                                    })
                                }));
                            });

                        // put virtual source files
                        project.getVirtualSourceRoot().files
                            .sort((a, b) => a.path.localeCompare(b.path))
                            .forEach((vFile) => {
                                const file = new File(project.ToAbsolutePath(vFile.path));
                                const vFilePath = `${VirtualSource.rootName}/${file.name}`;
                                const isFileExcluded = project.isExcluded(vFilePath);
                                const itemType = isFileExcluded ? TreeItemType.V_EXCFILE_ITEM : TreeItemType.V_FILE_ITEM;
                                const hasExtraArgs = project.hasExtraArgsForFile(file.path, vFilePath, prjExtraArgs);
                                iList.push(new ProjTreeItem(itemType, {
                                    value: file,
                                    collapsibleState: project.getSourceRefs(file).length > 0 ?
                                        vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                                    obj: <VirtualFileInfo>{ path: vFilePath, vFile: vFile },
                                    projectIndex: element.val.projectIndex,
                                    otherCtx: { hasExtraArgs: hasExtraArgs },
                                    tooltip: newFileTooltipString({
                                        name: file.name,
                                        path: file.path,
                                        desc: isFileExcluded ? view_str$project$excludeFile : undefined,
                                        attr: {
                                            'VirtualPath': vFilePath
                                        }
                                    }, project.getRootDir()),
                                }));
                            });

                        // show output files
                        if (SettingManager.GetInstance().isShowOutputFilesInExplorer()) {
                            const label = `Output Files`;
                            const tItem = new ProjTreeItem(TreeItemType.OUTPUT_FOLDER, {
                                value: label,
                                collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                                projectIndex: element.val.projectIndex,
                                tooltip: label,
                            });
                            iList.push(tItem);
                            this.treeCache.setTreeItem(project, tItem);
                        } else {
                            this.treeCache.delTreeItem(project, TreeItemType.OUTPUT_FOLDER);
                        }
                    }
                    break;
                case TreeItemType.PACK:
                    {
                        const packInfo = project.GetPackManager().GetPack();
                        if (packInfo) {
                            iList.push(new ProjTreeItem(TreeItemType.PACK_GROUP, {
                                value: packInfo.name,
                                projectIndex: element.val.projectIndex,
                                groupRegion: 'PACK'
                            }));
                        }
                    }
                    break;
                case TreeItemType.COMPILE_CONFIGURATION:
                    {
                        const cConfig = project.GetConfiguration().toolchainConfigModel;
                        const keyMap = <any>cConfig.GetDefault();
                        const excludeKeys = project.getToolchain().excludeViewList || [];

                        for (const key in keyMap) {
                            if (cConfig.isKeyEnable(key) && !excludeKeys.includes(key)) {
                                let uiContext: string | undefined;
                                // 为 "链接器脚本文件" 增加一个可以打开文件的小按钮
                                if (/\b(linkerScript|scatterFile)/.test(key)) {
                                    uiContext = 'COMPILE_CONFIGURATION_ITEM_FILEPATH';
                                }
                                iList.push(new ProjTreeItem(TreeItemType.COMPILE_CONFIGURATION_ITEM, {
                                    key: key,
                                    keyAlias: cConfig.GetKeyDescription(key),
                                    value: cConfig.getKeyValue(key),
                                    tooltip: newMarkdownString([
                                        `${cConfig.GetKeyDescription(key)}`,
                                        `- **Value:** \`${cConfig.getKeyValue(key)}\``]),
                                    icon: cConfig.getKeyIcon(key),
                                    projectIndex: element.val.projectIndex,
                                    contextVal: uiContext
                                }));
                            }
                        }
                    }
                    break;
                case TreeItemType.UPLOAD_OPTION:
                    {
                        const model = project.GetConfiguration().uploadConfigModel;
                        const config = model.GetDefault();

                        if (config) {
                            for (const key in config) {
                                if (model.isKeyEnable(key)) {
                                    iList.push(new ProjTreeItem(TreeItemType.UPLOAD_OPTION_ITEM, {
                                        key: key,
                                        keyAlias: model.GetKeyDescription(key),
                                        value: model.getKeyValue(key),
                                        tooltip: newMarkdownString([
                                            `${model.GetKeyDescription(key)}`,
                                            `- **Value:** \`${model.getKeyValue(key)}\``]),
                                        icon: model.getKeyIcon(key),
                                        projectIndex: element.val.projectIndex
                                    }));
                                }
                            }
                        }
                    }
                    break;
                case TreeItemType.DEPENDENCE:
                    {
                        const config = project.GetConfiguration();
                        const customDep = config.CustomDep_getDependence();
                        const keyList = config.CustomDep_GetEnabledKeys();

                        for (const key of keyList) {

                            let depValues: string[] = (<any>customDep)[key];

                            if (key == 'incList' || key == 'libList') { // is path list ?
                                depValues = sortPaths(depValues.map((val) => project.toRelativePath(val)), '/');
                            }

                            if (Array.isArray(depValues)) {
                                iList.push(new ProjTreeItem(TreeItemType.DEPENDENCE_GROUP_ARRAY_FIELD, {
                                    value: config.GetDepKeyDesc(key),
                                    tooltip: newMarkdownString([
                                        `${config.GetDepKeyDesc(key, getLocalLanguageType() == LanguageIndexs.Chinese)}`,
                                        `- **Count:** \`${depValues.length}\``]),
                                    obj: new ModifiableDepInfo('None', key),
                                    childKey: key,
                                    child: depValues,
                                    projectIndex: element.val.projectIndex
                                }));
                            }
                        }
                    }
                    break;
                // The edit setting value's callback is in @ref ModifyOtherSettings(...)
                case TreeItemType.SETTINGS:
                    {
                        const config = project.GetConfiguration();

                        // setting: project name
                        iList.push(new ProjTreeItem(TreeItemType.SETTINGS_ITEM, {
                            key: 'name',
                            value: config.config.name,
                            keyAlias: view_str$settings$prj_name,
                            tooltip: newMarkdownString(`**${view_str$settings$prj_name}**: \`${config.config.name}\``),
                            projectIndex: element.val.projectIndex
                        }));

                        // setting: out folder
                        iList.push(new ProjTreeItem(TreeItemType.SETTINGS_ITEM, {
                            key: 'outDir',
                            value: File.normalize(config.config.outDir),
                            keyAlias: view_str$settings$outFolderName,
                            tooltip: newMarkdownString(`**${view_str$settings$outFolderName}**: \`${config.config.outDir}\``),
                            projectIndex: element.val.projectIndex
                        }));

                        // setting: project env
                        iList.push(new ProjTreeItem(TreeItemType.SETTINGS_ITEM, {
                            key: 'project.env',
                            value: 'object {...}',
                            keyAlias: view_str$settings$prjEnv,
                            tooltip: view_str$settings$prjEnv,
                            projectIndex: element.val.projectIndex
                        }));
                    }
                    break;
                case TreeItemType.DEPENDENCE_GROUP:
                case TreeItemType.DEPENDENCE_SUB_GROUP:
                    // deprecated
                    break;
                case TreeItemType.DEPENDENCE_GROUP_ARRAY_FIELD:
                    {
                        const arr = <string[]>element.val.child;
                        let depInfo: ModifiableDepInfo | undefined;

                        if (element.val.obj instanceof ModifiableDepInfo) {
                            depInfo = element.val.obj.GetItemDepType();
                        }

                        for (const val of arr) {
                            iList.push(new ProjTreeItem(TreeItemType.DEPENDENCE_ITEM, {
                                value: val,
                                obj: depInfo,
                                projectIndex: element.val.projectIndex
                            }));
                        }
                    }
                    break;
                // filesystem folder
                case TreeItemType.FOLDER:
                case TreeItemType.FOLDER_ROOT:
                    if (element.val.obj && element.val.obj instanceof File) {
                        const dir: File = element.val.obj;
                        if (dir.IsDir()) {

                            const fchildren = dir.GetList()
                                .filter((f) => !AbstractProject.excludeDirFilter.test(f.name));

                            const iFileList: ProjTreeItem[] = [];
                            const iFolderList: ProjTreeItem[] = [];

                            fchildren.forEach((f) => {

                                const isExcluded = project.isExcluded(f.path);

                                if (f.IsDir()) { // is folder
                                    const type = isExcluded ? TreeItemType.EXCFOLDER : TreeItemType.FOLDER;
                                    iFolderList.push(new ProjTreeItem(type, {
                                        value: f.name,
                                        obj: f,
                                        otherCtx: {
                                            hasExtraArgs: project.hasExtraArgsForFolder(f.path, prjExtraArgs, false)
                                        },
                                        tooltip: newFileTooltipString({
                                            name: f.name,
                                            path: f.path,
                                            desc: isExcluded ? view_str$project$excludeFolder : undefined,
                                            attr: {}
                                        }, project.getRootDir()),
                                        projectIndex: element.val.projectIndex
                                    }));
                                } else { // is file
                                    const type = isExcluded ? TreeItemType.EXCFILE_ITEM : TreeItemType.FILE_ITEM;
                                    const treeItem = new ProjTreeItem(type, {
                                        value: f,
                                        collapsibleState: project.getSourceRefs(f).length > 0 ?
                                            vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                                        projectIndex: element.val.projectIndex,
                                        otherCtx: {
                                            hasExtraArgs: project.hasExtraArgsForFile(f.path, undefined, prjExtraArgs)
                                        },
                                        tooltip: newFileTooltipString({
                                            name: f.name,
                                            path: f.path,
                                            desc: isExcluded ? view_str$project$excludeFile : undefined,
                                            attr: {}
                                        }, project.getRootDir())
                                    });
                                    // use normal file icon for 'obj' file
                                    if (!project.isAutoSearchObjectFile()) {
                                        if (AbstractProject.libFileFilter.test(f.name)) {
                                            treeItem.iconPath = vscode.ThemeIcon.File;
                                        }
                                    }
                                    iFileList.push(treeItem);
                                }
                            });

                            // merge folders and files
                            iList = iFolderList.concat(iFileList);
                        }
                    }
                    break;
                // virtual folder
                case TreeItemType.V_FOLDER:
                case TreeItemType.V_FOLDER_ROOT:
                    {
                        const curFolder = <VirtualFolderInfo>element.val.obj;

                        // put child folders
                        curFolder.vFolder.folders
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .forEach((vFolder) => {
                                const vFolderPath = `${curFolder.path}/${vFolder.name}`;
                                const isFolderExcluded = project.isExcluded(vFolderPath);
                                const itemType = isFolderExcluded ? TreeItemType.V_EXCFOLDER : TreeItemType.V_FOLDER;
                                iList.push(new ProjTreeItem(itemType, {
                                    value: vFolder.name,
                                    obj: <VirtualFolderInfo>{ path: vFolderPath, vFolder: vFolder },
                                    projectIndex: element.val.projectIndex,
                                    otherCtx: {
                                        hasExtraArgs: project.hasExtraArgsForFolder(vFolderPath, prjExtraArgs, true)
                                    },
                                    tooltip: newFileTooltipString({
                                        name: vFolder.name,
                                        path: vFolderPath,
                                        desc: isFolderExcluded ? view_str$project$excludeFolder : undefined,
                                        attr: {
                                            'SubFiles': vFolder.files.length.toString(),
                                            'SubFolders': vFolder.folders.length.toString()
                                        }
                                    })
                                }));
                            });

                        // put child files
                        curFolder.vFolder.files
                            .sort((a, b) => a.path.localeCompare(b.path))
                            .forEach((vFile) => {
                                const file = new File(project.ToAbsolutePath(vFile.path));
                                const vFilePath = `${curFolder.path}/${file.name}`;
                                const isFileExcluded = project.isExcluded(vFilePath);
                                const itemType = isFileExcluded ? TreeItemType.V_EXCFILE_ITEM : TreeItemType.V_FILE_ITEM;
                                iList.push(new ProjTreeItem(itemType, {
                                    value: file,
                                    collapsibleState: project.getSourceRefs(file).length > 0 ?
                                        vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                                    obj: <VirtualFileInfo>{ path: vFilePath, vFile: vFile },
                                    projectIndex: element.val.projectIndex,
                                    otherCtx: {
                                        hasExtraArgs: project.hasExtraArgsForFile(file.path, vFilePath, prjExtraArgs)
                                    },
                                    tooltip: newFileTooltipString({
                                        name: file.name,
                                        path: file.path,
                                        desc: isFileExcluded ? view_str$project$excludeFile : undefined,
                                        attr: {
                                            'VirtualPath': vFilePath
                                        }
                                    }, project.getRootDir())
                                }));
                            });
                    }
                    break;
                case TreeItemType.EXCFOLDER:
                case TreeItemType.EXCFILE_ITEM:
                case TreeItemType.V_EXCFOLDER:
                case TreeItemType.V_EXCFILE_ITEM:
                    // ignore
                    break;
                // show refs
                case TreeItemType.FILE_ITEM:
                case TreeItemType.V_FILE_ITEM:
                    {
                        const srcFile: File = <File>element.val.value;
                        const refs = project.getSourceRefs(srcFile);

                        for (const refFile of refs) {
                            iList.push(new ProjTreeItem(TreeItemType.SRCREF_FILE_ITEM, {
                                value: refFile,
                                projectIndex: element.val.projectIndex,
                                tooltip: newFileTooltipString(refFile, project.getRootDir()),
                            }));
                        }
                    }
                    break;
                // output folder
                case TreeItemType.OUTPUT_FOLDER:
                    {
                        // put output files
                        const outFolder = project.getOutputFolder();
                        if (outFolder.IsDir()) {
                            const fList = outFolder.GetList([AbstractProject.buildOutputMatcher], File.EXCLUDE_ALL_FILTER);
                            fList.forEach((file) => {
                                iList.push(new ProjTreeItem(TreeItemType.OUTPUT_FILE_ITEM, {
                                    value: file,
                                    collapsibleState: vscode.TreeItemCollapsibleState.None,
                                    projectIndex: element.val.projectIndex,
                                    tooltip: newFileTooltipString({
                                        name: file.name,
                                        path: file.path,
                                        attr: {}
                                    }, project.getRootDir()),
                                }));
                            });
                        }

                        // put virtual views
                        {
                            // Symbol Table
                            // - not support sdcc, keil_c51 now !
                            if (!['Keil_C51', 'SDCC'].includes(project.getToolchain().name)) {

                                const vFile = File.fromArray([project.getRootDir().path, `${project.getUid()}.elf-symbols`]);
                                iList.push(new ProjTreeItem(TreeItemType.OUTPUT_FILE_ITEM, {
                                    label: `Symbol Table`,
                                    value: vFile,
                                    isVirtualFile: true,
                                    collapsibleState: vscode.TreeItemCollapsibleState.None,
                                    projectIndex: element.val.projectIndex,
                                    tooltip: `Symbols Of Program`,
                                    icon: `Table_16x.svg`
                                }));
                                if (VirtualDocument.instance().hasDocument(vFile.path) == false) {
                                    VirtualDocument.instance().registerDocumentGetter(vFile.path,
                                        (uri, args) => this.printProjectBinarySymbols(uri, args[0], args[1]));
                                }
                            }
                        }
                    }
                    break;
                // output file item
                case TreeItemType.OUTPUT_FILE_ITEM:
                    break;
                case TreeItemType.COMPONENT_GROUP:
                case TreeItemType.ACTIVED_GROUP:
                case TreeItemType.PACK_GROUP:
                case TreeItemType.GROUP:
                    switch (element.val.groupRegion) {
                        case 'PACK':
                            {
                                const deviceInfo = project.GetPackManager().GetCurrentDevice();
                                if (deviceInfo) {

                                    iList.push(new ProjTreeItem(TreeItemType.ITEM, {
                                        key: 'PackageName',
                                        value: deviceInfo.packInfo.name,
                                        projectIndex: element.val.projectIndex
                                    }));
                                    iList.push(new ProjTreeItem(TreeItemType.ITEM, {
                                        key: 'Vendor',
                                        value: deviceInfo.packInfo.vendor,
                                        projectIndex: element.val.projectIndex
                                    }));

                                    const device = <DeviceInfo>project.GetPackManager().getCurrentDevInfo();

                                    iList.push(new ProjTreeItem(TreeItemType.ITEM, {
                                        key: 'Core',
                                        value: device.core || 'null',
                                        projectIndex: element.val.projectIndex
                                    }));

                                    const devFamily = project.GetPackManager().getDeviceFamily();
                                    let description: vscode.MarkdownString | string | undefined;
                                    if (devFamily && devFamily.description) {
                                        description = devFamily.description; // newMarkdownString(devFamily.description);
                                    }

                                    iList.push(new ProjTreeItem(TreeItemType.ITEM, {
                                        key: 'DeviceName',
                                        value: device.name,
                                        projectIndex: element.val.projectIndex,
                                        tooltip: description
                                    }));

                                    iList.push(new ProjTreeItem(TreeItemType.ITEM, {
                                        key: 'Endian',
                                        value: device.endian || 'null',
                                        projectIndex: element.val.projectIndex
                                    }));

                                    iList.push(new ProjTreeItem(TreeItemType.ITEM, {
                                        key: 'SvdPath',
                                        value: device.svdPath ? project.toRelativePath(device.svdPath) : 'null',
                                        projectIndex: element.val.projectIndex
                                    }));

                                    iList.push(new ProjTreeItem(TreeItemType.GROUP, {
                                        value: view_str$pack$components,
                                        groupRegion: 'Components',
                                        projectIndex: element.val.projectIndex,
                                        tooltip: view_str$pack$components,
                                    }));
                                }
                            }
                            break;
                        case 'Components':
                            {
                                const packInfo = project.GetPackManager().GetPack();
                                const prjConfig = project.GetConfiguration();
                                if (packInfo) {
                                    packInfo.components.forEach((component, index) => {
                                        if (component.enable) {

                                            const type = prjConfig.IsExisted((<PackInfo>packInfo).name, component.groupName) ?
                                                TreeItemType.ACTIVED_GROUP : TreeItemType.COMPONENT_GROUP;
                                            const description = type === TreeItemType.ACTIVED_GROUP ?
                                                (`${component.description} (${view_str$pack$installed_component})`) : component.description;

                                            iList.push(new ProjTreeItem(type, {
                                                obj: index,
                                                value: component.groupName,
                                                groupRegion: 'ComponentItem',
                                                tooltip: description,
                                                projectIndex: element.val.projectIndex
                                            }));
                                        }
                                    });
                                }
                            }
                            break;
                        case 'ComponentItem':
                            {
                                const packInfo = project.GetPackManager().GetPack();
                                if (packInfo) {

                                    const component: any = packInfo.components[element.val.obj];
                                    for (const key in component) {

                                        if (Array.isArray(component[key])) {
                                            const list: string[] = (<ComponentFileItem[]>component[key])
                                                .map(item => project.toRelativePath(item.path));
                                            iList.push(new ProjTreeItem(TreeItemType.GROUP, {
                                                value: getComponentKeyDescription(key),
                                                child: list,
                                                projectIndex: element.val.projectIndex
                                            }));
                                        }
                                    }
                                }
                            }
                            break;
                        default:
                            {
                                if (element.val.child) {
                                    element.val.child.forEach((v) => {
                                        iList.push(new ProjTreeItem(TreeItemType.ITEM, {
                                            value: v,
                                            projectIndex: element.val.projectIndex
                                        }));
                                    });
                                }
                            }
                            break;
                    }
                    break;
                case TreeItemType.ITEM:
                    //Do nothing
                    break;
                default:
                    break;
            }
        }
        return iList;
    }

    /*
      文档：https://sourceware.org/binutils/docs-2.39/binutils.html#nm 
      下面说明符号类型：对于每一个符号来说，其类型如果是小写的，则表明该符号是local的；大写则表明该符号是global(external)的。
        A	该符号的值是绝对的，在以后的链接过程中，不允许进行改变。这样的符号值，常常出现在中断向量表中，例如用符号来表示各个中断向量函数在中断向量表中的位置。
        B	该符号的值出现在非初始化数据段(bss)中。例如，在一个文件中定义全局static int test。则该符号test的类型为b，位于bss section中。其值表示该符号在bss段中的偏移。一般而言，bss段分配于RAM中
        C	该符号为common。common symbol是未初始话数据段。该符号没有包含于一个普通section中。只有在链接过程中才进行分配。符号的值表示该符号需要的字节数。例如在一个c文件中，定义int test，并且该符号在别的地方会被引用，则该符号类型即为C。否则其类型为B。
        D	该符号位于初始话数据段中。一般来说，分配到data section中。例如定义全局int baud_table[5] = {9600, 19200, 38400, 57600, 115200}，则会分配于初始化数据段中。
        G	该符号也位于初始化数据段中。主要用于small object提高访问small data object的一种方式。
        I	该符号是对另一个符号的间接引用。
        N	该符号是一个debugging符号。
        R	该符号位于只读数据区。例如定义全局const int test[] = {123, 123};则test就是一个只读数据区的符号。注意在cygwin下如果使用gcc直接编译成MZ格式时，源文件中的test对应_test，并且其符号类型为D，即初始化数据段中。但是如果使用m6812-elf-gcc这样的交叉编译工具，源文件中的test对应目标文件的test,即没有添加下划线，并且其符号类型为R。一般而言，位于rodata section。值得注意的是，如果在一个函数中定义const char *test = “abc”, const char test_int = 3。使用nm都不会得到符号信息，但是字符串“abc”分配于只读存储器中，test在rodata section中，大小为4。
        S	符号位于非初始化数据区，用于small object。
        T	该符号位于代码区text section。
        U	该符号在当前文件中是未定义的，即该符号的定义在别的文件中。例如，当前文件调用另一个文件中定义的函数，在这个被调用的函数在当前就是未定义的；但是在定义它的文件中类型是T。但是对于全局变量来说，在定义它的文件中，其符号类型为C，在使用它的文件中，其类型为U。
        V	该符号是一个weak object。
        W	The symbol is a weak symbol that has not been specifically tagged as a weak object symbol. 未明确指定的弱链接符号；同链接的其他对象文件中有它的定义就用上，否则就用一个系统特别指定的默认值。
        -	该符号是a.out格式文件中的stabs symbol。
        ?	该符号类型没有定义
    */
    private convGnuSymbolType2ReadableString(typ: string): string {

        let typeStr: string | undefined;

        switch (typ.toLowerCase()) {
            case 'a':
                typeStr = 'ABS';
                break;
            case 'b':
                typeStr = 'BSS';
                break;
            case 'c':
                typeStr = 'COMMON';
                break;
            case 'd':
                typeStr = 'DATA';
                break;
            case 'i':
                typeStr = `Indirect Reference`;
                break;
            case 'n':
                typeStr = `Debug`;
                break;
            case 'r':
                typeStr = `DATA (Read Only)`;
                break;
            case 't':
                typeStr = `TEXT`;
                break;
            case 'u':
                typeStr = `Undefined`;
                break;
            case 'v':
                typeStr = `Weak`;
                break;
            case 'w':
                typeStr = `Weak (unspecified)`;
                break;
            default:
                break;
        }

        if (typeStr) {
            if (typ.toLowerCase() == typ) { // is a lowercase word
                typeStr += ' (Local)';
            }
        }

        if (typeStr) {
            return `${typ}: ${typeStr}`;
        }

        return typ;
    }

    private async printProjectBinarySymbols(uri: vscode.Uri,
        sortType?: 'addr' | 'size', dispType?: 'hide_no_sized' | 'show_all'): Promise<string> {

        if (sortType == undefined) {
            sortType = 'addr';
        }

        if (dispType == undefined) {
            dispType = 'show_all';
        }

        const uid = new File(uri.fsPath).noSuffixName;
        const prj = this.getProjectByUid(uid);

        if (prj == undefined) {
            return `Error: Not found project '${uid}' !`;
        }

        try {

            const toolchain = prj.getToolchain();
            const toolchainPrefix = toolchain.getToolchainPrefix ? toolchain.getToolchainPrefix() : '';

            let elfpath = '';
            let elftool = '';
            let elfcmds = [''];
            let elfsort = false; // elftool has sorted ?

            let staMatcher: RegExp | undefined;
            let endMatcher: RegExp | undefined;
            let symMatcher: RegExp | undefined;
            let symTypConv: ((type: string) => string) | undefined;
            let locMatcher: RegExp | undefined;

            // sometimes a long line has been truncated, like this:
            //  4183: Temperature_Sampling_NVIC_Configuration
            //                              0x800f4d1   5 Code Gb   0x38
            // we need match and recover them !
            let truncatStaMatcher: RegExp | undefined;
            let truncatEndMatcher: RegExp | undefined;

            switch (toolchain.name) {
                // armcc fmt: 
                //   #  Symbol Name                Value      Bind  Sec  Type  Vis  Size
                case 'AC5':
                case 'AC6':
                    elfpath = prj.getExecutablePath();
                    elftool = [toolchain.getToolchainDir().path, 'bin', `fromelf${exeSuffix()}`].join(File.sep);
                    elfcmds = ['--text', '-s', elfpath];
                    staMatcher = /\(SHT_SYMTAB\)/;
                    endMatcher = /^\*\* Section/;
                    truncatStaMatcher = /^\s*\d+\s+(?:[^\s]+)\s*$/i;
                    truncatEndMatcher = /^\s*0x[0-9a-f]+\s+/i;
                    symMatcher = /^\s*\d+\s+(?<name>[^\s]+)\s+(?<addr>0x[0-9a-f]+)\s+(?:[^\s]+)\s+(?:[^\s]+)\s+(?<type>[^\s]+)\s+(?:[^\s]+)(?<size>\s+[^\s]+)?/i;
                    break;
                // iar fmt:
                //   # Name                                Value      Sec Type Bd Size   Group Other
                case 'IAR_ARM':
                    elfpath = prj.getExecutablePath();
                    elftool = [toolchain.getToolchainDir().path, 'bin', `ielfdumparm${exeSuffix()}`].join(File.sep);
                    elfcmds = ['-s', '.symtab', elfpath];
                    symMatcher = /^\s*\d+:\s+(?<name>[^\s]+)\s+(?<addr>0x[0-9a-f]+)\s+(?:[^\s]+)\s+(?<type>[^\s]+\s+[^\s]+)(?<size>\s+0x[0-9a-f]+)?/i;
                    truncatStaMatcher = /^\s*\d+:\s+(?:[^\s]+)\s*$/i;
                    truncatEndMatcher = /^\s*0x[0-9a-f]+\s+/i;
                    break;
                case 'IAR_STM8':
                    elfpath = prj.getExecutablePath();
                    elftool = [toolchain.getToolchainDir().path, 'stm8', 'bin', `ielfdumpstm8${exeSuffix()}`].join(File.sep);
                    elfcmds = ['-s', '.symtab', elfpath];
                    symMatcher = /^\s*\d+:\s+(?<name>[^\s]+)\s+(?<addr>0x[0-9a-f]+)\s+(?:[^\s]+)\s+(?<type>[^\s]+\s+[^\s]+)(?<size>\s+0x[0-9a-f]+)?/i;
                    truncatStaMatcher = /^\s*\d+:\s+(?:[^\s]+)\s*$/i;
                    truncatEndMatcher = /^\s*0x[0-9a-f]+\s+/i;
                    break;
                case 'GCC':
                case 'RISCV_GCC':
                case 'ANY_GCC':
                case 'MIPS_GCC':
                case 'MTI_GCC':
                    elfpath = prj.getExecutablePath();
                    elftool = [toolchain.getToolchainDir().path, 'bin', `${toolchainPrefix}nm${exeSuffix()}`].join(File.sep);
                    elfcmds = sortType == 'size' ? ['-l', '-S', '--size-sort', elfpath] : ['-ln', '-S', elfpath];
                    elfsort = true;
                    symMatcher = /^(?<addr>[0-9a-f]+)\s+(?<size>[0-9a-f]+\s+)?(?<type>\w)\s+(?<name>[^\s]+)\s+(?<loca>.*)/i;
                    symTypConv = (t) => this.convGnuSymbolType2ReadableString(t);
                    break;
                case 'COSMIC_STM8':
                    // cobj -s .\stm8-cosmic.sm8
                    //  __memory:       0000001a section .bss defined public
                    //  __stack:        000003ff section absolute defined public absolute
                    //  c_y:            00000007 section .ubsct defined public zpage
                    //  f_exit:         00008221 section .text defined public
                    //  f_main:         00008165 section .text defined public
                    elfpath = prj.getExecutablePath();
                    elftool = [toolchain.getToolchainDir().path, `cobj${exeSuffix()}`].join(File.sep);
                    elfcmds = ['-s', elfpath];
                    symMatcher = /^\s*(?<name>\w+):\s+(?<addr>[0-9a-f]+)\s+\w+\s+(?<type>[\w\.]+)/i;
                    break;
                case 'LLVM_ARM':
                    // 2001132c 000002d0 B hUsbDeviceFS        c:\Users\xx+FatFs+USB_device_demo-template\./USB_DEVICE/App\usb_device.c:45
                    // 200115fc 00000200 B USBD_StrDesc        c:\Users\xx+FatFs+USB_device_demo-template\./USB_DEVICE/App\usbd_desc.c:235
                    // 200117fc 0000040c B hpcd_USB_OTG_FS     c:\Users\xx+FatFs+USB_device_demo-template\./USB_DEVICE/Target\usbd_conf.c:41
                    // 20011c08 00000004 B __malloc_free_list
                    // 20011c0c 00000004 B __malloc_sbrk_top
                    // 20011c10 00000004 B __malloc_sbrk_start
                    // 20011c14 00000001 B __lock___libc_recursive_mutex
                    elfpath = prj.getExecutablePath();
                    elftool = [toolchain.getToolchainDir().path, 'bin', `llvm-nm${exeSuffix()}`].join(File.sep);
                    elfcmds = sortType == 'size' ? ['-l', '-S', '--size-sort', elfpath] : ['-ln', '-S', elfpath];
                    elfsort = true;
                    symMatcher = /^(?<addr>[0-9a-f]+)\s+(?<size>[0-9a-f]+\s+)?(?<type>\w)\s+(?<name>[^\s]+)\s+(?<loca>.*)/i;
                    symTypConv = (t) => this.convGnuSymbolType2ReadableString(t);
                    break;
                case 'GNU_SDCC_MCS51':
                    elfpath = prj.getExecutablePath();
                    elftool = [toolchain.getToolchainDir().path, 'bin', `i51-elf-nm${exeSuffix()}`].join(File.sep);
                    elfcmds = sortType == 'size' ? ['-l', '-S', '--size-sort', elfpath] : ['-ln', '-S', elfpath];
                    elfsort = true;
                    symMatcher = /^(?<addr>[0-9a-f]+)\s+(?<size>[0-9a-f]+\s+)?(?<type>\w)\s+(?<name>[^\s]+)\s+(?<loca>.*)/i;
                    symTypConv = (t) => this.convGnuSymbolType2ReadableString(t);
                    break;
                default:
                    throw new Error(`Not support symbol view for '${toolchain.name}' !`);
            }

            if (!File.IsFile(elfpath)) {
                throw new Error(`Not found elf file: '${elfpath}', please build your project !`);
            }

            if (!File.IsFile(elftool)) {
                throw new Error(`Not found elf tool: '${elftool}' !`);
            }

            // Don't use 'child_process.execFileSync' because a huge file 
            // will cause an ENOBUF Error.
            const doReadSymbolLines = (toolpath: string, cmds: string[]): Promise<string[]> => {
                return new Promise((resolve) => {
                    const executable = new ExeFile();
                    const results: string[] = [];
                    executable.on('line', (line) => {
                        results.push(line);
                    });
                    executable.on('close', () => {
                        resolve(results);
                    });
                    executable.on('error', (err) => {
                        GlobalEvent.log_warn(err);
                    });
                    executable.Run(toolpath, cmds);
                });
            };

            let textLines = await doReadSymbolLines(elftool, elfcmds);

            // filter lines
            // notes:
            //  - will contain the line that matched by 'staMatcher'
            //  - Not  contain the line that matched by 'endMatcher'
            if (staMatcher) {

                const matchedLines: string[] = [];
                let started = false;

                for (const line of textLines) {

                    if (!started && staMatcher.test(line)) {
                        started = true;
                    }

                    if (started) {

                        if (matchedLines.length > 0 &&
                            endMatcher && endMatcher.test(line)) {
                            break;
                        }

                        matchedLines.push(line);
                    }
                }

                textLines = matchedLines;
            }

            // if no pattern, output raw text
            if (symMatcher === undefined) {
                return textLines.join(os.EOL);
            }

            const tableHeader: string[] = ['Address', 'Size', 'Type', 'Symbol Name', 'Location'];

            let resultLines: string[][] = [];

            let col_addr_maxLen = tableHeader[0].length;
            let col_size_maxLen = tableHeader[1].length;
            let col_type_maxLen = tableHeader[2].length;
            let col_name_maxLen = tableHeader[3].length;
            let col_loca_maxLen = tableHeader[4].length;

            let sym_cur_file_location: string | undefined;

            let sym_count = 0;

            for (let i = 0; i < textLines.length; i++) {

                let line = textLines[i];

                if (locMatcher) {
                    const m = locMatcher.exec(line);
                    if (m && m.groups) {
                        sym_cur_file_location = m.groups['loca']?.trim();
                    }
                }

                if (truncatStaMatcher && truncatEndMatcher) {
                    const nxtLine = i + 1 < textLines.length ? textLines[i + 1] : undefined;
                    if (nxtLine &&
                        truncatStaMatcher.test(line) && truncatEndMatcher.test(nxtLine)) {
                        line = line + nxtLine;
                        i++;
                    }
                }

                const m = symMatcher.exec(line);
                if (!(m && m.groups)) { // no matched
                    continue;
                }

                const addr = m.groups['addr']?.trim();
                let size = m.groups['size']?.trim();
                let type = m.groups['type']?.trim();
                const name = m.groups['name']?.trim();
                let loca = m.groups['loca']?.trim();

                if (!addr || !name) {
                    continue;
                }

                sym_count++;

                if (type && symTypConv) {
                    type = symTypConv(type);
                }

                // symbol name is a source file ?
                if (/\.(?:c|cpp|cxx|c\+\+|cc|s|asm)$/i.test(name)) {
                    sym_cur_file_location = name;
                    continue;
                }

                size = size || '--';
                type = type || '--';
                loca = loca || sym_cur_file_location || '--';
                loca = prj.toRelativePath(loca) || loca;

                if (dispType == 'hide_no_sized' && size == '--') {
                    continue; // ignore no-size symbols
                }

                col_addr_maxLen = addr.length > col_addr_maxLen ? addr.length : col_addr_maxLen;
                col_size_maxLen = size.length > col_size_maxLen ? size.length : col_size_maxLen;
                col_type_maxLen = type.length > col_type_maxLen ? type.length : col_type_maxLen;
                col_name_maxLen = name.length > col_name_maxLen ? name.length : col_name_maxLen;
                col_loca_maxLen = loca.length > col_loca_maxLen ? loca.length : col_loca_maxLen;

                resultLines.push([addr, size, type, name, loca]);
            }

            // sort lines
            if (!elfsort) {

                if (sortType == 'addr') {

                    resultLines = resultLines.sort((a1, a2) => {
                        const addr_1 = parseInt(a1[0], 16);
                        const addr_2 = parseInt(a2[0], 16);
                        return addr_1 - addr_2;
                    });
                }

                else if (sortType == 'size') {

                    const notSizeSyms: string[][] = [];
                    let hasSizeSyms: string[][] = [];

                    resultLines.forEach(sym => {
                        if (sym[1].startsWith('--')) {
                            notSizeSyms.push(sym);
                        } else {
                            hasSizeSyms.push(sym);
                        }
                    });

                    hasSizeSyms = hasSizeSyms.sort((a1, a2) => {
                        const size_1 = parseInt(a1[1], 16);
                        const size_2 = parseInt(a2[1], 16);
                        return size_1 - size_2;
                    });

                    resultLines = notSizeSyms.concat(hasSizeSyms);
                }
            }

            // dump result

            const headerLines = [
                '',
                'ELF Symbols',
                `  - Tool: '${elftool}'`,
                `  - Cmds: '${elfcmds.join(' ')}'`,
                `  - Symbol Count: ${sym_count}`,
                ''
            ];

            const outputLines: string[] = headerLines;

            // make header
            {
                outputLines.push(
                    `--${''.padEnd(col_addr_maxLen, '-')}-` +
                    `--${''.padEnd(col_size_maxLen, '-')}-` +
                    `--${''.padEnd(col_type_maxLen, '-')}-` +
                    `--${''.padEnd(col_name_maxLen, '-')}-` +
                    `--${''.padEnd(col_loca_maxLen, '-')}-`);

                outputLines.push(
                    `| ${tableHeader[0].padEnd(col_addr_maxLen)} ` +
                    `| ${tableHeader[1].padEnd(col_size_maxLen)} ` +
                    `| ${tableHeader[2].padEnd(col_type_maxLen)} ` +
                    `| ${tableHeader[3].padEnd(col_name_maxLen)} ` +
                    `| ${tableHeader[4].padEnd(col_loca_maxLen)} `);

                outputLines.push(
                    `--${''.padEnd(col_addr_maxLen, '-')}-` +
                    `--${''.padEnd(col_size_maxLen, '-')}-` +
                    `--${''.padEnd(col_type_maxLen, '-')}-` +
                    `--${''.padEnd(col_name_maxLen, '-')}-` +
                    `--${''.padEnd(col_loca_maxLen, '-')}-`);
            }

            for (let i = 1; i < resultLines.length; i++) {

                outputLines.push(
                    `| ${resultLines[i][0].padEnd(col_addr_maxLen)} ` +
                    `| ${resultLines[i][1].padEnd(col_size_maxLen)} ` +
                    `| ${resultLines[i][2].padEnd(col_type_maxLen)} ` +
                    `| ${resultLines[i][3].padEnd(col_name_maxLen)} ` +
                    `| ${resultLines[i][4].padEnd(col_loca_maxLen)} `);
            }

            outputLines.push('');

            return outputLines.join(os.EOL);

        } catch (error) {
            return 'Error: ' + (<Error>error).message;
        }
    }

    private async _OpenProject(workspaceFilePath: string, workspaceState: vscode.Memento): Promise<AbstractProject | undefined> {

        const wsFile: File = new File(workspaceFilePath);
        if (!wsFile.IsFile()) {
            GlobalEvent.emit('msg', {
                type: 'Warning',
                contentType: 'string',
                content: invalid_project_path + wsFile.path
            });
            return undefined;
        }

        if (!detectProject(File.from(wsFile.dir))) {
            GlobalEvent.emit('msg', newMessage('Warning', `File not existed, [path]: ${wsFile.dir}`));
            return undefined;
        }

        try {
            await doMigration(File.from(wsFile.dir));
            const prj = NewProject(workspaceState);
            await prj.Load(wsFile);
            this.registerProject(prj);
            GlobalEvent.emit('project.opened', prj);
            return prj;
        } catch (err) {
            GlobalEvent.emit('msg', newMessage('Warning', project_load_failed));
            GlobalEvent.log_error(err);
            GlobalEvent.emit('globalLog.show');
            return undefined;
        }
    }

    setActiveProject(index: number) {
        const prj = this.prjList[index];
        const wsPath = prj.getWsPath();
        if (this.activePrjPath !== wsPath) {
            this.activePrjPath = wsPath;
            this.UpdateView();
            GlobalEvent.emit('project.activeStatusChanged', prj.getUid());
        }
    }

    async OpenProject(workspaceFilePath: string, switchWorkspaceImmediately?: boolean): Promise<AbstractProject | undefined> {

        const wsFolder = new File(NodePath.dirname(workspaceFilePath));

        // check workspace
        if (!detectProject(wsFolder)) { // not found project file, open workspace ?
            const msg = `Not found eide project in this workspace !, Open this workspace directly ?`;
            const selection = await vscode.window.showInformationMessage(msg, continue_text, cancel_text);
            if (selection === continue_text) { WorkspaceManager.getInstance().openWorkspace(new File(workspaceFilePath)); }
            return undefined;
        }

        const prj = await vscode.window.withProgress({
            title: 'Open Project',
            location: vscode.ProgressLocation.Notification,
        }, (progress) => {
            progress.report({ message: `${workspaceFilePath}` });
            return this._OpenProject(workspaceFilePath, getGlobalState());
        });
        if (prj) {
            this.SwitchProject(prj, switchWorkspaceImmediately);
            return prj;
        }

        return undefined;
    }

    async CreateProject(option: CreateOptions): Promise<AbstractProject | undefined> {

        // check folder
        const dList = option.outDir.GetList(File.EXCLUDE_ALL_FILTER);
        if (dList.findIndex((_folder) => { return _folder.name === option.name; }) !== -1) {
            const item = await vscode.window.showWarningMessage(`${WARNING}: ${project_exist_txt}`, 'Yes', 'No');
            if (item === undefined || item === 'No') {
                return undefined;
            }
        }

        try {
            const prj = NewProject(getGlobalState());
            await prj.Create(option);
            this.registerProject(prj);
            this.SwitchProject(prj);
            return prj;
        } catch (err) {
            GlobalEvent.emit('error', err);
            GlobalEvent.emit('msg', newMessage('Warning', project_load_failed));
            return undefined;
        }
    }

    private importCmsisHeaders(rootDir: File): string[] {

        const result: string[] = [];

        const headerInfos = ResManager.GetInstance().getCMSISHeaderPacks();
        for (const info of headerInfos) {
            const outDir = File.fromArray([rootDir.path, '.cmsis', info.name]);
            if (!outDir.IsDir()) {
                outDir.CreateDir(true);
                const compresser = new SevenZipper(ResManager.GetInstance().Get7zDir());
                compresser.UnzipSync(File.from(info.zippath), outDir);
            }
            info.exportIncs?.forEach(p => result.push(File.normalize(File.from(outDir.path, p).path)));
        }

        return result;
    }

    ImportProject(option: ImportOptions) {

        const catchErr = (error: any) => {
            const msg = `${view_str$operation$import_failed}: ${(<Error>error).message}`;
            GlobalEvent.emit('msg', newMessage('Warning', msg));
            GlobalEvent.emit('msg', ExceptionToMessage(error, 'Hidden'));
        };

        switch (option.type) {
            case 'mdk':
                this.ImportKeilProject(option).catch(err => catchErr(err));
                break;
            case 'eclipse':
                this.ImportEclipseProject(option).catch(err => catchErr(err));
                break;
            case 'iar':
                this.ImportIarProject(option).catch(err => catchErr(err));
                break;
            case 'cmake':
                this.ImportCmakeProject(option).catch(err => catchErr(err));
                break;
            default:
                break;
        }
    }

    private async ImportIarProject(option: ImportOptions) {

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
            const basePrj = NewProject(getGlobalState()).createBase({
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

    private async ImportEclipseProject(option: ImportOptions) {

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

        const basePrj = NewProject(getGlobalState()).createBase({
            name: ePrjInfo.name,
            projectName: ePrjInfo.name,
            type: nPrjType,
            outDir: ePrjRoot
        }, false);

        const nPrjConfig = basePrj.prjConfig.config;
        const eideFolder = File.fromArray([ePrjRoot.path, AbstractProject.EIDE_DIR]);

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

    private async ImportCmakeProject(option: ImportOptions) {

        const setting = SettingManager.GetInstance();
        const cmakeListsFile = option.projectFile; // Now expects CMakeLists.txt
        const projectRoot = cmakeListsFile.dir;

        // Get cmake settings
        const cmakePath = setting.getCmakeExecutablePath();
        const buildDirName = setting.getCmakeBuildDirectory();

        const buildDir = File.fromArray([projectRoot, buildDirName]);
        const compileCommandsFile = File.fromArray([buildDir.path, 'compile_commands.json']);

        // Check if compile_commands.json exists, if not prompt to generate
        if (!compileCommandsFile.IsFile()) {
            const answer = await vscode.window.showWarningMessage(
                view_str$operation$cmake_no_compile_commands,
                txt_yes, txt_no
            );
            if (answer !== txt_yes) {
                return; // User cancelled
            }

            // Run cmake to generate compile_commands.json

            // try to clean build dir before generation
            try {
                const platform = require('../Platform');
                if (buildDir.IsDir()) platform.DeleteAllChildren(buildDir.path);
            } catch (error) {
                // ignore
            }

            let genResult = await this.runCmakeGenerate(cmakePath, projectRoot, buildDir.path, undefined, true);

            // handle mismatch
            if (!genResult.success && genResult.isGeneratorMismatch) {
                const msg = 'CMake generator mismatch detected. Do you want to clean the build directory and retry?';
                const ans = await vscode.window.showWarningMessage(msg, 'Yes', 'No');
                if (ans === 'Yes') {
                    // clean
                    try {
                        const platform = require('../Platform');
                        const cacheFile = File.fromArray([buildDir.path, 'CMakeCache.txt']);
                        const cmakeFilesDir = File.fromArray([buildDir.path, 'CMakeFiles']);
                        if (cacheFile.IsFile()) fs.unlinkSync(cacheFile.path);
                        if (cmakeFilesDir.IsDir()) platform.DeleteAllChildren(cmakeFilesDir.path);
                    } catch (error) {
                        // ignore
                    }
                    // retry
                    genResult = await this.runCmakeGenerate(cmakePath, projectRoot, buildDir.path);
                }
            }

            if (!genResult.success) {
                // handle no compiler found
                if (genResult.logParts.some(line => line.includes('No CMAKE_C_COMPILER') || line.includes('CMAKE_C_COMPILER not set')) ||
                    genResult.logParts.some(line => line.includes('No CMAKE_CXX_COMPILER') || line.includes('CMAKE_CXX_COMPILER not set'))) {
                    GlobalEvent.emit('globalLog.append', '\n[EIDE] Detected missing compiler error. Attempting to find EIDE toolchains...\n');

                    // Try to use EIDE configured toolchain ?
                    const armGccDir = setting.getGCCDir();
                    const riscvGccDir = setting.getRiscvToolFolder();

                    const candidates: { name: string, dir: File, prefix: string }[] = [];
                    if (armGccDir && armGccDir.IsDir()) candidates.push({ name: 'ARM GCC', dir: armGccDir, prefix: setting.getGCCPrefix() });
                    if (riscvGccDir && riscvGccDir.IsDir()) candidates.push({ name: 'RISC-V GCC', dir: riscvGccDir, prefix: setting.getRiscvToolPrefix() });

                    if (candidates.length > 0) {
                        let selected: { name: string, dir: File, prefix: string } | undefined;

                        if (candidates.length === 1) {
                            const msg = `CMake cannot find the C/C++ compiler. Do you want to try generating with EIDE configured "${candidates[0].name}" ?`;
                            const ans = await vscode.window.showWarningMessage(msg, 'Yes', 'No');
                            if (ans === 'Yes') selected = candidates[0];
                        } else {
                            const msg = `CMake cannot find the C/C++ compiler. Select a EIDE configured toolchain to retry:`;
                            const names = candidates.map(c => c.name);
                            const ans = await vscode.window.showQuickPick(names, { placeHolder: msg });
                            if (ans) selected = candidates.find(c => c.name === ans);
                        }

                        if (selected) {
                            const platform = require('../Platform');
                            const fs = require('fs');
                            const path = require('path');

                            const binDir = selected.dir.path;
                            const prefix = selected.prefix;
                            const exeSuffix = platform.exeSuffix();
                            const gccName = `${prefix}gcc${exeSuffix}`;
                            const gppName = `${prefix}g++${exeSuffix}`;

                            // Recursive search function
                            const findFileRecursively = (dir: string, filename: string, depth: number = 0): string | undefined => {
                                if (depth > 4) return undefined; // Limit depth
                                try {
                                    const files = fs.readdirSync(dir);
                                    for (const file of files) {
                                        const fullPath = path.join(dir, file);
                                        const stat = fs.statSync(fullPath);
                                        if (stat.isDirectory()) {
                                            const res = findFileRecursively(fullPath, filename, depth + 1);
                                            if (res) return res;
                                        } else if (file.toLowerCase() === filename.toLowerCase()) {
                                            return fullPath;
                                        }
                                    }
                                } catch (e) { /* ignore */ }
                                return undefined;
                            };

                            let cCompiler = File.fromArray([binDir, gccName]).path;
                            let cxxCompiler = File.fromArray([binDir, gppName]).path;

                            // If not found directly, try recursive search
                            if (!fs.existsSync(cCompiler)) {
                                const foundGcc = findFileRecursively(binDir, gccName);
                                if (foundGcc) {
                                    cCompiler = foundGcc;
                                    // Try to find g++ in same dir
                                    const foundGpp = path.join(path.dirname(foundGcc), gppName);
                                    if (fs.existsSync(foundGpp)) {
                                        cxxCompiler = foundGpp;
                                    }
                                }
                            }

                            cCompiler = cCompiler.replace(/\\/g, '/');
                            cxxCompiler = cxxCompiler.replace(/\\/g, '/');
                            // asm usually uses gcc
                            const asmCompiler = cCompiler;

                            genResult = await this.runCmakeGenerate(cmakePath, projectRoot, buildDir.path, [
                                `-DCMAKE_SYSTEM_NAME=Generic`,
                                `-DCMAKE_SYSTEM_PROCESSOR=${selected.name.includes('ARM') ? 'arm' : 'riscv'}`,
                                `-DCMAKE_C_COMPILER=${cCompiler}`,
                                `-DCMAKE_CXX_COMPILER=${cxxCompiler}`,
                                `-DCMAKE_ASM_COMPILER=${asmCompiler}`
                            ], true);
                        }
                    }
                }
            }

            if (!genResult.success) {
                // Error message already shown by runCmakeGenerate
                if (genResult.logParts.length > 0) {
                    GlobalEvent.emit('globalLog.append', genResult.logParts.join('\n'));
                    GlobalEvent.emit('globalLog.show');
                }
                return;
            }

            // Verify file was created
            if (!compileCommandsFile.IsFile()) {
                // If succeeded but file not found, log the output to help debugging
                if (genResult.logParts.length > 0) {
                    genResult.logParts.push(`\n[Hint] If you are using 'Visual Studio Generator' (default on Windows), it does NOT support 'CMAKE_EXPORT_COMPILE_COMMANDS'.`);
                    genResult.logParts.push(`       You can try to install 'Ninja' or 'MinGW' to solve this problem.`);
                    GlobalEvent.emit('globalLog.append', genResult.logParts.join('\n'));
                    GlobalEvent.emit('globalLog.show');
                }

                const openLogTxt = 'Open Log';
                const sel = await vscode.window.showErrorMessage(
                    view_str$operation$cmake_generate_failed,
                    openLogTxt
                );
                if (sel === openLogTxt) {
                    GlobalEvent.emit('globalLog.show');
                }
                return;
            }
        }

        // Parse compile_commands.json
        const cmakeInfo = await cmakeParser.parseCmakeProject(compileCommandsFile);
        const cmakeRoot = new File(cmakeInfo.rootDir);

        // Determine toolchain based on detected project type
        let toolchainName: ToolchainName = 'GCC';
        switch (cmakeInfo.projectType) {
            case 'ARM':
                toolchainName = 'GCC';
                break;
            case 'RISC-V':
                toolchainName = 'RISCV_GCC';
                break;
            case 'ANY-GCC':
            default:
                toolchainName = 'ANY_GCC';
                break;
        }

        // Create base EIDE project
        const basePrj = NewProject(getGlobalState()).createBase({
            name: cmakeRoot.name,
            projectName: cmakeInfo.name,
            type: cmakeInfo.projectType,
            outDir: cmakeRoot
        }, false);

        const nPrjConfig = basePrj.prjConfig.config;

        // Init project info
        nPrjConfig.virtualFolder = cmakeInfo.virtualFolder;
        nPrjConfig.toolchain = toolchainName;

        // Set include paths and defines
        GlobalEvent.emit('globalLog.append', `[CMakeParser] INITIAL IMPORT: Setting dependenceList with ${cmakeInfo.includePaths.length} includes, ${cmakeInfo.defines.length} defines`);
        nPrjConfig.dependenceList = [{
            groupName: 'custom',
            depList: [{
                name: 'cmake-import',
                incList: cmakeInfo.includePaths,
                defineList: cmakeInfo.defines,
                libList: (cmakeInfo.libPaths || []).concat(cmakeInfo.libs || [])
            }]
        }];
        GlobalEvent.emit('globalLog.append', `[CMakeParser] INITIAL IMPORT: dependenceList set, depList[0].incList.length = ${nPrjConfig.dependenceList[0]?.depList[0]?.incList?.length || 0}`);

        // Store source project path for future refresh capability
        nPrjConfig.miscInfo = nPrjConfig.miscInfo || {};
        (<any>nPrjConfig.miscInfo).source_project = {
            type: 'cmake',
            path: cmakeListsFile.path
        };

        // Apply linker script if extracted
        GlobalEvent.emit('globalLog.append', `[CMakeParser] INITIAL IMPORT: linkerScript = ${cmakeInfo.linkerScript || 'undefined'}, toolchainConfigModel exists = ${!!basePrj.prjConfig.toolchainConfigModel}`);
        if (cmakeInfo.linkerScript && basePrj.prjConfig.toolchainConfigModel) {
            const toolchainConfig = basePrj.prjConfig.toolchainConfigModel.data as any;
            if (toolchainConfig && 'scatterFilePath' in toolchainConfig) {
                toolchainConfig.scatterFilePath = cmakeInfo.linkerScript;
                toolchainConfig.useCustomScatterFile = true;
                GlobalEvent.emit('globalLog.append', `[CMakeParser] INITIAL IMPORT: Applied linker script to scatterFilePath`);
            }
        }

        // Save project config
        GlobalEvent.emit('globalLog.append', `[CMakeParser] INITIAL IMPORT: Saving project config...`);
        basePrj.prjConfig.Save();

        // Switch project
        const selection = await vscode.window.showInformationMessage(
            view_str$operation$import_done, continue_text, cancel_text);
        if (selection === continue_text) {
            WorkspaceManager.getInstance().openWorkspace(basePrj.workspaceFile);
        }
    }

    public async RefreshCmakeProject(element: ProjTreeItem) {

        const project = this.GetProjectByIndex(element.val.projectIndex);
        if (!project) return;

        const miscInfo = project.GetConfiguration().config.miscInfo;
        const source_project = miscInfo ? (<any>miscInfo).source_project : undefined;

        if (!source_project || source_project.type !== 'cmake') {
            vscode.window.showErrorMessage('Not a CMAKE project !');
            return;
        }

        const cmakeListsFile = new File(project.ToAbsolutePath(source_project.path));
        if (!cmakeListsFile.IsFile()) {
            vscode.window.showErrorMessage(`Not found '${cmakeListsFile.path}' !`);
            return;
        }

        const projectRoot = cmakeListsFile.dir;
        const setting = SettingManager.GetInstance();
        const cmakePath = setting.getCmakeExecutablePath();
        const buildDirName = setting.getCmakeBuildDirectory();
        const buildDir = File.fromArray([projectRoot, buildDirName]);
        const compileCommandsFile = File.fromArray([buildDir.path, 'compile_commands.json']);

        // Run cmake to generate compile_commands.json
        let genResult = await this.runCmakeGenerate(cmakePath, projectRoot, buildDir.path);

        if (!genResult.success && genResult.isGeneratorMismatch) {
            const cleanAndRetry = 'Clean and Retry';
            const sel = await vscode.window.showErrorMessage(
                'CMake generator mismatch detected ! Do you want to clean the build directory and retry?',
                cleanAndRetry
            );
            if (sel === cleanAndRetry) {
                try {
                    const fs = require('fs');
                    if (fs.existsSync(buildDir.path)) {
                        fs.rmSync(buildDir.path, { recursive: true, force: true });
                    }
                    // Retry
                    genResult = await this.runCmakeGenerate(cmakePath, projectRoot, buildDir.path);
                } catch (e) {
                    vscode.window.showErrorMessage(`Failed to clean build directory: ${(<any>e).message}`);
                    return;
                }
            }
        }

        // Verify file was created
        if (!genResult.success || !compileCommandsFile.IsFile()) {
            if (genResult.logParts.length > 0) {
                genResult.logParts.push(`\n[Hint] If you are using 'Visual Studio Generator' (default on Windows), it does NOT support 'CMAKE_EXPORT_COMPILE_COMMANDS'.`);
                genResult.logParts.push(`       You can try to install 'Ninja' or 'MinGW' to solve this problem.`);
                GlobalEvent.emit('globalLog.append', genResult.logParts.join('\n'));
                GlobalEvent.emit('globalLog.show');
            }

            const openLogTxt = 'Open Log';
            const sel = await vscode.window.showErrorMessage(
                view_str$operation$cmake_generate_failed,
                openLogTxt
            );
            if (sel === openLogTxt) {
                GlobalEvent.emit('globalLog.show');
            }
            return;
        }

        // Parse compile_commands.json
        const cmakeInfo = await cmakeParser.parseCmakeProject(compileCommandsFile);

        // Update project config
        const prjConfig = project.GetConfiguration();
        prjConfig.config.virtualFolder = cmakeInfo.virtualFolder;

        // Update dependence
        prjConfig.config.dependenceList = [{
            groupName: 'custom',
            depList: [{
                name: 'cmake-import',
                incList: cmakeInfo.includePaths,
                defineList: cmakeInfo.defines,
                libList: (cmakeInfo.libPaths || []).concat(cmakeInfo.libs || [])
            }]
        }];

        // Apply linker script if extracted
        if (cmakeInfo.linkerScript && prjConfig.toolchainConfigModel) {
            const toolchainConfig = prjConfig.toolchainConfigModel.data as any;
            if (toolchainConfig && 'scatterFilePath' in toolchainConfig) {
                toolchainConfig.scatterFilePath = cmakeInfo.linkerScript;
                toolchainConfig.useCustomScatterFile = true;
            }
        }

        // Save and reload
        prjConfig.Save();
        project.getVirtualSourceManager().load(); // Reload virtual folder from config
        project.GetDepManager().Refresh(); // Reload dependencies
        project.forceUpdateCpptoolsConfig();
        this.UpdateView();

        vscode.window.showInformationMessage(view_str$operation$cmake_refresh_done || 'Refresh Successfully');
    }

    public async RefreshKeilProject(element: ProjTreeItem) {
        const project = this.GetProjectByIndex(element.val.projectIndex);
        if (!project) return;
        await this._refreshKeilProjectToConfig(project);
    }

    private async _refreshKeilProjectToConfig(project: AbstractProject, forceProjectFile?: File) {
        let projectFile: File | undefined = forceProjectFile;
        let miscInfo = project.GetConfiguration().config.miscInfo;

        // try get from cache
        if (!projectFile && miscInfo) {
            if ((<any>miscInfo).mdk_project_path) {
                projectFile = new File((<any>miscInfo).mdk_project_path);
            } else if ((<any>miscInfo).source_project && (<any>miscInfo).source_project.type === 'mdk') {
                projectFile = new File(project.ToAbsolutePath((<any>miscInfo).source_project.path));
            }
        }

        // try search from root
        if (!projectFile || !projectFile.IsFile()) {
            const root = project.getProjectRoot();
            const uvFiles = root.GetList([/\.uvproj[x]?$/i], File.EXCLUDE_ALL_FILTER);
            if (uvFiles.length === 1) {
                projectFile = uvFiles[0];
            } else {
                // prompt user
                const uris = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    defaultUri: vscode.Uri.file(root.path),
                    filters: { 'Keil Project': ['uvprojx', 'uvproj'] }
                });
                if (uris && uris.length > 0) {
                    projectFile = new File(uris[0].fsPath);
                } else {
                    return;
                }
            }

            // save to config
            if (miscInfo == undefined) miscInfo = { uid: project.getUid() };
            (<any>miscInfo).mdk_project_path = projectFile.path;
            (<any>miscInfo).source_project = { type: 'mdk', path: project.ToRelativePath(projectFile.path) };
            project.GetConfiguration().config.miscInfo = miscInfo;
            // save now
            project.GetConfiguration().Save();
        }

        // parse project
        // we can reuse keilParser from current file context ? 
        // No, keilParser is instance of KeilParser. 
        // I need to check if 'keilParser' constant is available globally in this file or I should create new.
        // It seems 'keilParser' is NOT global. I see 'cmakeParser' used in 'RefreshCmakeProject'. 
        // 'cmakeParser' seems to be imported or global.
        // In ImportKeilProject, it uses 'keilParser'. Let's assume it's available or I create it.
        // Actually, I should check file imports.

        // Assuming keilParser is available or I use `new KeilParser()`? No, KeilParser is abstract.
        // I need `IarParser` (which handles Keil too? No idt so).
        // `KeilXmlParser.ts` has `KeilParser`.
        // `EIDEProjectExplorer.ts` lines 3000+ uses `keilParser`.
        // Let's assume `keilParser` is available as a variable in the module scope.
        // If not, I will see error. 
        // Wait, I should verify. 
        // But for now I'll write the logic.

        try {
            const mdk_prod = (<any>miscInfo)?.uid || 'C51';
            const isC51 = project.getProjectType() === 'C51' || project.getToolchain().name === 'Keil_C51';

            // Instantiate parser
            let parser: KeilParser<any>;

            // We need to import KeilARMParser/KeilC51Parser. 
            // Assuming they are exported from KeilXmlParser.
            // If not, we might need to use a factory function if exists.
            // Let's assume KeilARMParser and KeilC51Parser are available if I import them.
            // But I haven't imported them yet. I will add imports in next step.

            if (isC51) {
                parser = new C51Parser(projectFile);
            } else {
                parser = new ARMParser(projectFile);
            }

            const keilProjInfos = parser.ParseData(); // ParseData returns array
            const keilProjInfo = keilProjInfos.find(i => i.name === project.GetConfiguration().config.name) || keilProjInfos[0];

            if (!keilProjInfo) {
                throw new Error('No target parsed from project file');
            }

            // Update project config
            const prjConfig = project.GetConfiguration();

            // 1. Virtual Folder (Files)
            const vFolder: VirtualFolder = {
                name: VirtualSource.rootName,
                files: [],
                folders: []
            };

            const excludeList: string[] = [];

            keilProjInfo.fileGroups.forEach(group => {
                const childFolder: VirtualFolder = {
                    name: group.name,
                    files: [],
                    folders: []
                };

                // Check group disabled ?
                // Keil file groups usually don't have 'disabled' property in the parser result interface provided?
                // Step 268 showed fileGroups: FileGroup[].
                // EIDETypeDefine.ts FileGroup has disabled?: boolean.
                const groupDisabled = group.disabled === true;

                group.files.forEach(f => {
                    const relPath = project.ToRelativePath(f.file.path) || f.file.path;
                    childFolder.files.push({ path: relPath });

                    if (groupDisabled || f.disabled) {
                        excludeList.push(relPath);
                    }
                });

                vFolder.folders.push(childFolder);
            });

            prjConfig.config.virtualFolder = vFolder;

            const curTargetName = project.GetConfiguration().config.mode;
            const keilTarget = keilProjInfo; // The result is the target.

            if (keilTarget) {
                // Update Target Config
                const targetConfig = prjConfig.config.targets[curTargetName];
                if (targetConfig) {
                    if (targetConfig.cppPreprocessAttrs) {
                        targetConfig.cppPreprocessAttrs.incList = keilTarget.incList || [];
                        targetConfig.cppPreprocessAttrs.defineList = keilTarget.defineList || [];
                    } else {
                        // Create if missing
                        targetConfig.cppPreprocessAttrs = {
                            name: 'Preprocessor',
                            incList: keilTarget.incList || [],
                            libList: [],
                            defineList: keilTarget.defineList || []
                        };
                    }

                    // Merge exclude list
                    targetConfig.excludeList = excludeList;
                }
            }

            // Save and reload
            project.GetConfiguration().Save();
            project.getVirtualSourceManager().load(); // Reload virtual folder from config
            project.GetDepManager().Refresh(); // Reload dependencies
            this.UpdateView();

            vscode.window.showInformationMessage('Project Refreshed from: ' + projectFile.name);

            // Register watcher (force re-register in case path changed)
            this.registerKeilWatcher(project, projectFile.path, false);

            // Sync Scatter File & Storage Layout (For ARM)
            if (!isC51) {
                const armOptions = <any>keilTarget.compileOption;
                const toolConfig = <any>prjConfig.config.toolchainConfig;

                if (armOptions.scatterFilePath !== undefined) {
                    // convert to relative path
                    toolConfig.scatterFilePath = project.ToRelativePath(armOptions.scatterFilePath);
                }

                if (armOptions.useCustomScatterFile !== undefined) {
                    toolConfig.useCustomScatterFile = armOptions.useCustomScatterFile;
                }

                if (armOptions.storageLayout) {
                    const layout = <ARMStorageLayout>armOptions.storageLayout;
                    let isValid = false;
                    for (const mem of layout.RAM.concat(<any>layout.ROM)) {
                        if (parseInt(mem.mem.size) > 0) {
                            isValid = true;
                            break;
                        }
                    }
                    if (isValid) {
                        toolConfig.storageLayout = armOptions.storageLayout;
                    } else {
                        vscode.window.showWarningMessage('Warning: Invalid memory layout from Keil project. EIDE will ignore it.');
                    }
                }
            }


        } catch (error) {
            vscode.window.showErrorMessage('Refresh Failed: ' + (<Error>error).message);
        }
    }

    private keilWatchers: Map<string, vscode.FileSystemWatcher> = new Map();

    private registerKeilWatcher(project: AbstractProject, keilPath: string, skipIfExists: boolean = true) {
        const uid = project.getUid();

        // If skipIfExists is true and watcher already exists, skip
        if (skipIfExists && this.keilWatchers.has(uid)) {
            return;
        }

        // Clear existing for this project to be safe (if path changed)
        if (this.keilWatchers.has(uid)) {
            this.keilWatchers.get(uid)?.dispose();
            this.keilWatchers.delete(uid);
        }

        // Normalize path for glob pattern (replace backslashes with forward slashes)
        // This is crucial for VS Code file watcher to work correctly on Windows
        const watchPath = keilPath.replace(/\\/g, '/');

        console.log(`[EIDE] Registering Keil Project Watcher: ${watchPath}`);

        const watcher = vscode.workspace.createFileSystemWatcher(watchPath, true, false, true); // ignore create/delete, watch change
        watcher.onDidChange(async () => {
            const result = await vscode.window.showInformationMessage(
                `Detected changes in '${NodePath.basename(keilPath)}'. Do you want to refresh the '${project.GetConfiguration().config.name}' project?`,
                'Yes', 'No'
            );

            if (result === 'Yes') {
                this._refreshKeilProjectToConfig(project);
            }
        });

        this.keilWatchers.set(uid, watcher);
    }

    public registerKeilWatcherForProject(project: AbstractProject, keilPath: string) {
        this.registerKeilWatcher(project, keilPath);
    }

    private cmakeWatchers: Map<string, vscode.FileSystemWatcher> = new Map();

    private registerCmakeWatcher(project: AbstractProject, cmakePath: string) {
        const uid = project.getUid();

        // If watcher already exists for this project, skip (singleton per project)
        if (this.cmakeWatchers.has(uid)) {
            return;
        }

        const watchPath = cmakePath.replace(/\\/g, '/');
        const watcher = vscode.workspace.createFileSystemWatcher(watchPath, true, false, true); // ignore create/delete, watch change
        watcher.onDidChange(async (e) => {
            const changedFile = NodePath.basename(e.fsPath);
            const result = await vscode.window.showInformationMessage(
                `Detected changes in '${changedFile}'. Do you want to refresh the '${project.GetConfiguration().config.name}' project?`,
                'Yes', 'No'
            );

            if (result === 'Yes') {
                // Find project index in prjList
                const projectIndex = this.prjList.findIndex(p => p.getUid() === uid);
                console.log('[EIDE DEBUG] User clicked Yes. projectIndex=', projectIndex);
                if (projectIndex >= 0) {
                    // Create a minimal ProjTreeItem for RefreshCmakeProject
                    const item = new ProjTreeItem(TreeItemType.SOLUTION, {
                        value: project.getProjectName(),
                        projectIndex: projectIndex,
                        contextVal: 'SOLUTION_CMAKE'
                    }, uid);
                    console.log('[EIDE DEBUG] Calling RefreshCmakeProject...');
                    await this.RefreshCmakeProject(item);
                    console.log('[EIDE DEBUG] RefreshCmakeProject completed.');
                } else {
                    console.log('[EIDE DEBUG] ERROR: project not found in prjList!');
                }
            }
        });

        this.cmakeWatchers.set(uid, watcher);
    }

    private async runCmakeGenerate(cmakePath: string, projectRoot: string, buildDir: string, extraArgs?: string[], suppressError: boolean = false): Promise<{ success: boolean; isNotFound: boolean; isGeneratorMismatch?: boolean; logParts: string[] }> {
        // Execute cmake and collect result
        const executeResult = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: view_str$operation$cmake_generating,
            cancellable: false
        }, async (): Promise<{ success: boolean; isNotFound: boolean; isGeneratorMismatch?: boolean; logParts: string[] }> => {
            try {
                const { spawnSync } = require('child_process');

                const setting = SettingManager.GetInstance();
                const toolchainArgsStr = setting.getCmakeToolchainArguments();

                let toolchainArgs = toolchainArgsStr.trim().length > 0 ?
                    parseCliArgs(toolchainArgsStr) : [];

                if (extraArgs) {
                    toolchainArgs = toolchainArgs.concat(extraArgs);
                }

                const args = [
                    '-S', '.',
                    '-B', buildDir,
                    '-DCMAKE_EXPORT_COMPILE_COMMANDS=ON',
                ];

                // add generator
                const generatorString = setting.getCmakeGenerator();
                if (generatorString.length > 0) {
                    args.push('-G', generatorString);
                }

                // add build type
                const buildType = setting.getCmakeBuildType();
                if (buildType.length > 0) {
                    args.push(`-DCMAKE_BUILD_TYPE=${buildType}`);
                }

                // add make program
                const hasMakeProgramArg = toolchainArgs.some(arg => arg.includes('CMAKE_MAKE_PROGRAM'));
                let makeProgram = setting.getCmakeMakeProgram();

                if (hasMakeProgramArg) {
                    // ignore
                } else if (makeProgram.trim() !== '') {
                    args.push(`-DCMAKE_MAKE_PROGRAM=${makeProgram}`);
                } else {
                    const generatorString = setting.getCmakeGenerator();
                    if (generatorString.toLowerCase().includes('ninja')) { // check ninja
                        const platform = require('../Platform');
                        const ninjaPath = platform.find('ninja');
                        if (ninjaPath) {
                            // ignore, cmake can find it
                        } else {
                            // try to find in eide tools
                            const isInstalled = ResInstaller.instance().isToolInstalled('Ninja');
                            if (isInstalled) {
                                const binDir = ResManager.GetInstance().getEideToolsInstallDir();
                                makeProgram = File.fromArray([binDir, 'ninja', `ninja${platform.exeSuffix()}`]).path;
                                args.push(`-DCMAKE_MAKE_PROGRAM=${makeProgram}`);
                            } else {
                                // not found
                                const done = await ResInstaller.instance().setOrInstallTools('Ninja', 'Ninja build system is not found !', 'EIDE.CMAKE.MakeProgram');
                                if (!done) return { success: false, isNotFound: true, logParts: [] };
                                // if installed done, we reload settings and try again ? no, simple way is return error and let user retry
                                return { success: false, isNotFound: true, logParts: ['Ninja installed done, please retry !'] };
                            }
                        }
                    }
                }

                // add toolchain args
                args.push(...toolchainArgs);

                const result = spawnSync(cmakePath, args, {
                    cwd: projectRoot,
                    stdio: 'pipe',
                    shell: true,
                    encoding: 'buffer'
                });

                if (result.error || result.status !== 0) {
                    let errStr = '';
                    if (result.stderr) {
                        try {
                            errStr = result.stderr.toString('utf8');
                        } catch { errStr = ''; }
                    }

                    const isNotFound = result.error ||
                        errStr.includes('not recognized') ||
                        errStr.includes('not found') ||
                        errStr.includes('无法找到') ||
                        errStr.includes('不是内部或外部命令') ||
                        (result.status === 1 && errStr === '');

                    const stripAnsi = (str: string) => str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
                    const fullOutput = stripAnsi(errStr + '\n' + (result.stdout ? result.stdout.toString('utf8') : ''));
                    const isGeneratorMismatch = /does not match the generator used previously/i.test(fullOutput);

                    // Build log parts
                    const logParts: string[] = [
                        `\n========== CMAKE Generate Failed ==========`,
                        `Command: ${cmakePath} ${args.join(' ')}`,
                        `Working Dir: ${projectRoot}`,
                        `Exit Code: ${result.status}`
                    ];

                    if (result.stdout && result.stdout.length > 0) {
                        try { logParts.push(`\n----- STDOUT -----\n${result.stdout.toString('utf8')}`); } catch { /* ignore */ }
                    }
                    if (result.stderr && result.stderr.length > 0) {
                        try { logParts.push(`\n----- STDERR -----\n${result.stderr.toString('utf8')}`); } catch { /* ignore */ }
                    }
                    logParts.push(`\n============================================\n`);

                    return { success: false, isNotFound, isGeneratorMismatch, logParts };
                }

                // Success case - still return logs if any, for debugging
                const logParts: string[] = [];
                if (result.stdout && result.stdout.length > 0) {
                    try {
                        const out = result.stdout.toString('utf8');
                        if (out.trim().length > 0)
                            logParts.push(`\n----- STDOUT -----\n${out}`);
                    } catch { /* ignore */ }
                }
                // Even on success, stderr might have warnings
                if (result.stderr && result.stderr.length > 0) {
                    try {
                        const err = result.stderr.toString('utf8');
                        if (err.trim().length > 0)
                            logParts.push(`\n----- STDERR -----\n${err}`);
                    } catch { /* ignore */ }
                }

                return { success: true, isNotFound: false, logParts };
            } catch (e) {
                const logParts = [
                    `\n========== CMAKE Generate Exception ==========`,
                    `Error: ${(<Error>e).message}`,
                    `Stack: ${(<Error>e).stack}`,
                    `============================================\n`
                ];
                GlobalEvent.emit('msg', ExceptionToMessage(<Error>e, 'Warning'));
                return { success: false, isNotFound: false, logParts };
            }
        });

        // Handle result outside of withProgress
        if (!executeResult.success && !suppressError) {
            // Output log AND show log panel
            if (executeResult.logParts.length > 0) {
                GlobalEvent.emit('globalLog.append', executeResult.logParts.join('\n'));
                GlobalEvent.emit('globalLog.show');
            }

            if (executeResult.isNotFound) {
                const sel = await vscode.window.showWarningMessage(
                    view_str$operation$cmake_not_found,
                    txt_jump2settings
                );
                if (sel === txt_jump2settings) {
                    SettingManager.jumpToSettings('EIDE.CMAKE.ExecutablePath');
                }
            } else {
                const openLogTxt = 'Open Log';
                const sel = await vscode.window.showErrorMessage(
                    view_str$operation$cmake_generate_failed,
                    openLogTxt
                );
                if (sel === openLogTxt) {
                    GlobalEvent.emit('globalLog.show');
                }
            }
        }

        return executeResult;
    }

    private async ImportKeilProject(option: ImportOptions) {

        const keilPrjFile = option.projectFile;
        const keilParser = KeilParser.NewInstance(option.projectFile, <any>option.mdk_prod);
        const targets = keilParser.ParseData();

        if (targets.length == 0) {
            throw Error(`Not found any target in '${keilPrjFile.path}' !`);
        }

        const nPrjOutDir = <File>option.outDir;

        const baseInfo = NewProject(getGlobalState()).createBase({
            name: nPrjOutDir.name,
            projectName: keilPrjFile.noSuffixName,
            type: targets[0].type,
            outDir: nPrjOutDir
        }, false);

        const projectInfo = baseInfo.prjConfig.config;

        // init project info
        projectInfo.virtualFolder = {
            name: VirtualSource.rootName,
            files: [],
            folders: []
        };

        const getVirtualFolder = (path: string, noCreate?: boolean): VirtualFolder | undefined => {

            if (!path.startsWith(`${VirtualSource.rootName}/`)) {
                throw Error(`'${path}' is not a virtual path`);
            }

            const pathList = path.split('/');
            pathList.splice(0, 1); // remvoe root

            // init start search folder
            let curFolder: VirtualFolder = projectInfo.virtualFolder;

            for (const name of pathList) {
                const index = curFolder.folders.findIndex((folder) => { return folder.name === name; });
                if (index === -1) {
                    if (noCreate) { return undefined; }
                    const newFolder = { name: name, files: [], folders: [] };
                    curFolder.folders.push(newFolder);
                    curFolder = newFolder;
                } else {
                    curFolder = curFolder.folders[index];
                }
            }

            return curFolder;
        };

        // init source args
        const srcOptsObj = <SourceFileOptions>{ version: EIDE_FILE_OPTION_VERSION, options: {} };
        srcOptsObj.version = EIDE_FILE_OPTION_VERSION;
        const setupSourceOpts = (vFolderPath: string, srcFilePath: string) => {
            for (const keilTarget of targets) {
                if (srcOptsObj.options[keilTarget.name] == undefined)
                    srcOptsObj.options[keilTarget.name] = { files: {}, virtualPathFiles: {} };
                const targetSrcOpts = srcOptsObj.options[keilTarget.name];
                if (keilTarget.fileOptions) {
                    const vFilePath = `${vFolderPath}/${NodePath.basename(srcFilePath)}`;
                    const fopts = keilTarget.fileOptions[vFilePath];
                    if (fopts && targetSrcOpts.virtualPathFiles) {
                        const optLi = [];
                        fopts.includes.forEach(item => {
                            if (keilTarget.type === 'C51') {
                                optLi.push(`INCDIR(${baseInfo.rootFolder.ToRelativePath(item) || item})`);
                            } else {
                                optLi.push(`-I${baseInfo.rootFolder.ToRelativePath(item) || item}`);
                            }
                        });
                        fopts.defines.forEach(item => {
                            if (keilTarget.type === 'C51') {
                                if (item.includes('='))
                                    optLi.push(`DEFINE(${item})`);
                                else
                                    optLi.push(`DEFINE(${item}=1)`);
                            } else {
                                optLi.push(`-D${item}`);
                            }
                        });
                        fopts.undefines.forEach(item => {
                            if (keilTarget.type === 'C51') {
                                //TODO: not support -U options.
                            } else {
                                optLi.push(`-U${item}`);
                            }
                        });
                        if (fopts.miscOptions)
                            optLi.push(fopts.miscOptions);
                        targetSrcOpts.virtualPathFiles[vFilePath] = optLi.join(' ');
                    }
                }
            }
        };

        // init file group
        targets[0].fileGroups.forEach((group) => {
            const vPath = `${VirtualSource.rootName}/${File.ToUnixPath(group.name)}`;
            const VFolder = <VirtualFolder>getVirtualFolder(vPath);
            group.files.forEach((fileItem) => {
                // add source file
                VFolder.files.push({
                    path: baseInfo.rootFolder.ToRelativePath(fileItem.file.path) || fileItem.file.path
                });
                // add file options for every target
                setupSourceOpts(vPath, fileItem.file.path);
            });
        });

        /* import RTE dependence */
        const rte_deps = targets[0].rte_deps;
        const unresolved_deps: KeilRteDependence[] = [];
        if (rte_deps) {

            /* import cmsis headers */
            const incs: string[] = this.importCmsisHeaders(baseInfo.rootFolder);

            /* try resolve all deps */
            const fileTypeMatchers: RegExp[] = [/source/, /header/];
            rte_deps.forEach((dep) => {

                // check category
                if (!(dep.category && fileTypeMatchers.some(reg => reg.test(dep.category || '')))) {
                    GlobalEvent.log_warn(`[Keil RTE Import] dependence '${dep.name}' is not a source file !`);
                    unresolved_deps.push(dep); /* resolve failed !, store dep */
                    return;
                }

                // check source file
                if (!dep.instance) {
                    GlobalEvent.log_warn(`[Keil RTE Import] dependence '${dep.name}' have no instances !`);
                    unresolved_deps.push(dep); /* resolve failed !, store dep */
                    return;
                }

                const srcList = dep.instance.map(p => File.ToUnixPath(p));
                const vFolder = getVirtualFolder(`${VirtualSource.rootName}/::${dep.class}`, false);

                if (!vFolder) {
                    GlobalEvent.log_warn(`[Keil RTE Import] No such folder '::${dep.class}'`);
                    unresolved_deps.push(dep); /* resolve failed !, store dep */
                    return;
                }

                /* resolve dependences */
                for (const srcPath of srcList) {

                    /* check condition */
                    if (!File.IsFile(srcPath)) {
                        GlobalEvent.log_warn(`[Keil RTE Import] No such file '${srcPath}'`);
                        continue;
                    }

                    const srcRePath = baseInfo.rootFolder.ToRelativePath(srcPath);

                    /* add to project */
                    vFolder.files.push({ path: srcRePath || srcPath });

                    /* if it's a header, add to include path */
                    if (dep.category == 'header') {
                        if (srcRePath)
                            incs.push(`${baseInfo.rootFolder.path}${File.sep}${NodePath.dirname(srcRePath)}`);
                        else
                            incs.push(NodePath.dirname(srcPath));
                    }
                }
            });

            /* add include paths for targets */
            const mdk_rte_folder = File.fromArray([`${keilPrjFile.dir}`, 'RTE']);
            targets.forEach((target) => {
                target.incList = target.incList.concat(incs);
                target.incList.push(`${mdk_rte_folder.path}${File.sep}_${target.name}`); /* add RTE_Components header */
            });

            /* log unresolved deps */
            if (unresolved_deps.length > 0) {

                const title = `!!! ${WARNING} !!!`;

                const lines: string[] = [
                    `${title}`,
                    view_str$prompt$unresolved_deps,
                    view_str$prompt$prj_location.replace('{}', baseInfo.workspaceFile.path),
                    '---'
                ];

                unresolved_deps.forEach((dep) => {

                    let locate = dep.packPath;
                    if (dep.instance) {
                        locate = baseInfo.rootFolder
                            .ToRelativePath(dep.instance[0]) || dep.instance[0];
                    }

                    const nLine: string[] = [
                        `FileName: '${dep.name}'`,
                        `\tClass:     '${dep.class}'`,
                        `\tCategory:  '${dep.category}'`,
                        `\tLocation:  '${locate}'`,
                    ];

                    lines.push(nLine.join(os.EOL));
                });

                const cont = lines.join(`${os.EOL}${os.EOL}`);
                const file = File.fromArray([baseInfo.rootFolder.path, `keil.${AbstractProject.importerWarningBaseName}`]);
                file.Write(cont); // write content to file
                const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(file.ToUri()));
                vscode.window.showTextDocument(doc, { preview: false });
                GlobalEvent.log_show();
            }
        }

        const mergeBuilderOpts = (baseOpts_: any, opts: any): any => {

            const baseOpts = copyObject(baseOpts_);

            if (opts == undefined) return baseOpts;

            for (const clasName in opts) {
                if (baseOpts[clasName] == undefined) {
                    baseOpts[clasName] = opts[clasName];
                } else {
                    for (const key in opts[clasName]) {
                        baseOpts[clasName][key] = opts[clasName][key];
                    }
                }
            }

            return baseOpts;
        };

        const replaceUserTaskTmpVar = (t: any) => {
            const reKeilPrjDir = baseInfo.rootFolder.ToRelativeLocalPath(keilPrjFile.dir) || keilPrjFile.dir;
            if (reKeilPrjDir === '.') {
                t.command = t.command.replace('$<cd:mdk-proj-dir> && ', '');
            } else {
                if (t.command.startsWith('bash')) {
                    t.command = t.command.replace('$<cd:mdk-proj-dir>', `cd ${File.ToUnixPath(reKeilPrjDir)}`);
                } else {
                    if (File.isAbsolute(reKeilPrjDir))
                        t.command = t.command.replace('$<cd:mdk-proj-dir>', `cd /D ${reKeilPrjDir}`);
                    else
                        t.command = t.command.replace('$<cd:mdk-proj-dir>', `cd .\\${reKeilPrjDir}`);
                }
            }
        };

        // project env
        const prjenv: any = {};

        // init all targets
        for (const keilTarget of targets) {

            const newTarget: ProjectTargetInfo = <any>{};
            const defIncList: string[] = [];

            // copy from cur proj info
            newTarget.toolchainConfig = copyObject(projectInfo.toolchainConfig);
            newTarget.toolchainConfigMap = copyObject(projectInfo.toolchainConfigMap);
            newTarget.uploader = projectInfo.uploader;
            newTarget.uploadConfig = copyObject(projectInfo.uploadConfig);
            newTarget.uploadConfigMap = copyObject(projectInfo.uploadConfigMap);
            newTarget.builderOptions = {};

            //
            // import specific configs
            //

            // C51 project
            if (keilTarget.type === 'C51') {
                const keilCompileConf = (<KeilC51Option>keilTarget.compileOption);
                // base config
                newTarget.toolchain = 'Keil_C51';
                const toolchain = ToolchainManager.getInstance().getToolchain('C51', 'Keil_C51');
                if (keilCompileConf.includeFolder) {
                    const absPath = [toolchain.getToolchainDir().path, 'INC', keilCompileConf.includeFolder].join(File.sep);
                    defIncList.push(baseInfo.rootFolder.ToRelativePath(absPath) || absPath);
                }
                // import builder options
                const opts: BuilderOptions = mergeBuilderOpts(
                    toolchain.getDefaultConfig(), keilCompileConf.optionsGroup[keilCompileConf.toolchain]);
                newTarget.builderOptions[toolchain.name] = opts;
            }

            // ARM project
            else {
                const keilCompileConf = <KeilARMOption>keilTarget.compileOption;
                const prjCompileOption = (<ArmBaseCompileData>newTarget.toolchainConfig);
                // base config
                newTarget.toolchain = keilCompileConf.toolchain;
                prjCompileOption.cpuType = keilCompileConf.cpuType;
                prjCompileOption.floatingPointHardware = keilCompileConf.floatingPointHardware || 'none';
                prjCompileOption.useCustomScatterFile = keilCompileConf.useCustomScatterFile;
                prjCompileOption.storageLayout = keilCompileConf.storageLayout;

                if (keilCompileConf.scatterFilePath) {
                    prjCompileOption.scatterFilePath =
                        baseInfo.rootFolder.ToRelativePath(keilCompileConf.scatterFilePath) || keilCompileConf.scatterFilePath;
                } else { // if no scatter, will use X/O Base, R/O Base options, make scatterFilePath empty
                    prjCompileOption.scatterFilePath = '';
                }

                // import builder options
                const toolchain = ToolchainManager.getInstance().getToolchain('ARM', keilCompileConf.toolchain);
                const opts: BuilderOptions = mergeBuilderOpts(
                    toolchain.getDefaultConfig(), keilCompileConf.optionsGroup[keilCompileConf.toolchain]);
                opts.beforeBuildTasks?.forEach((t) => replaceUserTaskTmpVar(t));
                opts.afterBuildTasks?.forEach((t) => replaceUserTaskTmpVar(t));
                newTarget.builderOptions[toolchain.name] = opts;
            }

            // init custom dependence after specific configs done
            newTarget.cppPreprocessAttrs = <any>{ name: 'default' };
            const incList = keilTarget.incList.map((path) => baseInfo.rootFolder.ToRelativePath(path) || path);
            newTarget.cppPreprocessAttrs.incList = defIncList.concat(incList);
            newTarget.cppPreprocessAttrs.defineList = keilTarget.defineList;
            newTarget.cppPreprocessAttrs.libList = [];

            // fill exclude list
            newTarget.excludeList = [];
            for (const group of keilTarget.fileGroups) {
                const vFolderPath = `${VirtualSource.rootName}/${File.ToUnixPath(group.name)}`;
                if (group.disabled) { newTarget.excludeList.push(vFolderPath); } // add disabled group
                for (const file of group.files) {
                    if (file.disabled) { // add disabled file
                        newTarget.excludeList.push(`${vFolderPath}/${file.file.name}`);
                    }
                }
            }

            // env
            if (keilTarget.env && Object.keys(keilTarget.env).length > 0) {
                prjenv[`${keilTarget.name}`] = copyObject(keilTarget.env);
            }

            projectInfo.targets[keilTarget.name] = newTarget;
        }

        // init current target
        const curTarget: any = projectInfo.targets[targets[0].name];
        projectInfo.mode = targets[0].name; // current target name
        for (const name in curTarget) {
            if (name === 'cppPreprocessAttrs') {
                projectInfo.dependenceList = [{
                    groupName: 'custom', depList: [curTarget[name]]
                }];
                continue;
            }
            if (!MAPPED_KEYS_IN_TARGET_INFO.includes(name))
                continue;
            (<any>projectInfo)[name] = curTarget[name];
        }

        // save all config
        baseInfo.prjConfig.Save();

        // save env
        if (Object.keys(prjenv).length > 0) {
            File.fromArray([baseInfo.rootFolder.path, AbstractProject.EIDE_DIR, 'env.ini'])
                .Write(ini.stringify(prjenv));
        }

        // save src options
        const optFile = File.fromArray([baseInfo.rootFolder.path, AbstractProject.EIDE_DIR, `files.options.yml`]);
        optFile.Write(view_str$prompt$filesOptionsComment + yaml.stringify(srcOptsObj, { indent: 4, lineWidth: 1000 }));

        // switch project
        const selection = await vscode.window.showInformationMessage(
            view_str$operation$import_done, continue_text, cancel_text);
        if (selection === continue_text) {
            WorkspaceManager.getInstance().openWorkspace(baseInfo.workspaceFile);
        }
    }

    async CreateFromTemplate(option: CreateOptions) {

        const compresser = new SevenZipper(ResManager.GetInstance().Get7zDir());
        const templateFile = <File>option.templateFile;

        const targetDir = new File(option.outDir.path + File.sep + option.name);
        const targetWorkspaceFile = File.from(targetDir.path,
            (option.projectName || option.name) + AbstractProject.workspaceSuffix);

        try {

            targetDir.CreateDir(true);

            const err = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Creating project`
            }, async (progress): Promise<Error | undefined> => {

                progress.report({ message: 'Unzip template', increment: 10 });

                const e = await compresser.Unzip(templateFile, targetDir);
                if (e) return e;

                progress.report({ message: 'Generating', increment: 50 });

                return new Promise((resolve) => {

                    const post_create_task = async () => {

                        try {

                            const wsFileList = targetDir.GetList([/\.code-workspace$/i], File.EXCLUDE_ALL_FILTER);
                            const wsFile: File | undefined = wsFileList.length > 0 ? wsFileList[0] : undefined;

                            if (wsFile) {

                                // rename workspace file name
                                fs.renameSync(wsFile.path, targetWorkspaceFile.path);

                                // rename project
                                if (templateFile.suffix != '.ewt') { // ignore eide workspace project

                                    // init project
                                    if (!detectProject(targetDir))
                                        throw Error(`No found any project in this workspace.`);

                                    try {
                                        await doMigration(targetDir);
                                        const pfile = File.from(targetDir.path, AbstractProject.EIDE_DIR, AbstractProject.prjConfigName);
                                        const prjConf = ProjectConfiguration.parseProjectFile(pfile.Read());
                                        prjConf.name = option.name; // set project name
                                        if (prjConf.miscInfo) prjConf.miscInfo.uid = undefined; // reset uid
                                        pfile.Write(ProjectConfiguration.dumpProjectFile(prjConf));
                                    } catch (error) {
                                        throw Error(`Init project failed !, msg: ${error.message}`);
                                    }
                                }
                            }

                            resolve(undefined);

                        } catch (error) {
                            resolve(error);
                        }
                    };

                    setTimeout(post_create_task, 400);
                });
            });

            if (err) {
                throw err;
            }

            // switch workspace if user select `yes`
            const item = await vscode.window.showInformationMessage(
                view_str$operation$create_prj_done, 'Yes', 'Later'
            );

            // switch workspace
            if (item === 'Yes') {
                const wsFile = targetWorkspaceFile;
                if (wsFile.IsFile()) {
                    WorkspaceManager.getInstance().openWorkspace(wsFile);
                }
            }

        } catch (error) {
            GlobalEvent.emit('msg', newMessage('Warning', `Create project failed !, msg: ${(<Error>error).message}`));
            GlobalEvent.emit('msg', ExceptionToMessage(error, 'Hidden'));
        }
    }

    async UninstallKeilPackage(item: ProjTreeItem) {
        const prj = this.prjList[item.val.projectIndex];
        if (prj.GetPackManager().GetPack()) {
            return prj.UninstallPack(<string>item.val.value);
        }
    }

    SaveAll() {
        this.prjList.forEach(sln => sln.Save(true));
    }

    CloseAll() {
        this.prjList.forEach(sln => sln.Close());
        this.prjList = [];
    }

    //---

    getRecords(): string[] {
        return Array.from(this.slnRecord);
    }

    clearAllRecords() {
        this.slnRecord = [];
        this.saveRecord();
    }

    removeRecord(record: string) {
        const i = this.slnRecord.findIndex(str => { return str === record; });
        if (i !== -1) {
            this.slnRecord.splice(i, 1);
        }
    }

    saveRecord() {
        if (this.slnRecord.length > ProjectDataProvider.RecMaxNum) {
            this.slnRecord.splice(0, this.slnRecord.length - ProjectDataProvider.RecMaxNum);
        }
        this.recFile.Write(JSON.stringify(this.slnRecord));
    }

    private addRecord(path: string) {
        if (!this.slnRecord.includes(path)) {
            this.slnRecord.push(path);
        }
    }

    private loadRecord() {
        if (this.recFile.IsFile()) {
            try {
                this.slnRecord = JSON.parse(this.recFile.Read());
            } catch (err) {
                this.slnRecord = [];
                GlobalEvent.emit('msg', ExceptionToMessage(err, 'Hidden'));
            }
        }
    }

    //---

    async SetDevice(index: number) {

        const prj = this.prjList[index];
        const packInfo = prj.GetPackManager().GetPack();

        if (packInfo) {
            const devList = prj.GetPackManager().GetDeviceList().map((dev) => {
                return <vscode.QuickPickItem>{ label: dev.name, description: dev.core };
            });
            const item = await vscode.window.showQuickPick(devList, {
                placeHolder: 'Found ' + devList.length + ' devices, ' + set_device_hint,
                canPickMany: false,
                matchOnDescription: true
            });
            if (item) {
                prj.GetPackManager().SetDeviceInfo(item.label, item.description);
            }
        }
    }

    private registerProject(proj: AbstractProject) {
        this.prjList.push(proj);
        proj.on('dataChanged', (type) => this.onProjectChanged(proj, type));
        this.addRecord(proj.getWsPath());
        this.UpdateView();
    }

    Close(index: number): string | undefined {

        if (index < 0 || index >= this.prjList.length) {
            GlobalEvent.emit('error', new Error('Project index out of range: ' + index.toString()));
            return;
        }

        const sln = this.prjList[index];

        sln.Close();
        this.prjList.splice(index, 1);
        this.UpdateView();

        return sln.getUid();
    }

    private async SwitchProject(prj: AbstractProject, immediately?: boolean) {
        if (immediately) {
            WorkspaceManager.getInstance().openWorkspace(prj.GetWorkspaceConfig().GetFile());
        } else {
            const selection = await vscode.window.showInformationMessage(switch_workspace_hint, continue_text, cancel_text);
            if (selection === continue_text) {
                WorkspaceManager.getInstance().openWorkspace(prj.GetWorkspaceConfig().GetFile());
            }
        }
    }
}

