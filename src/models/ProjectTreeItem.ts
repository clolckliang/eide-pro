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
import { File } from '../../lib/node-utility/File';
import { VirtualFolder, VirtualFile } from '../EIDETypeDefine';
import { ResManager } from '../ResManager';
import { GlobalEvent } from '../GlobalEvents';
import { newMessage } from '../Message';

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

export interface VirtualFolderInfo {
    path: string;
    vFolder: VirtualFolder;
}

export interface VirtualFileInfo {
    path: string;       // virtual path
    vFile: VirtualFile; // virtual file info
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
