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
import * as fs from 'fs';
import * as NodePath from 'path';
import * as os from 'os';
import * as yml from 'yaml';

import { File } from '../../lib/node-utility/File';
import { ArrayDelRepetition } from '../../lib/node-utility/Utility';
import { AbstractProject, VirtualSource } from '../EIDEProject';
import { VirtualFile } from '../EIDETypeDefine';
import { ExceptionToMessage } from '../Message';
import { GlobalEvent } from '../GlobalEvents';
import { view_str$virual_doc_provider_banner } from '../StringTable';
import { ProjTreeItem, TreeItemType, VirtualFolderInfo, VirtualFileInfo } from './ProjectTree';

export interface ModifiableYamlConfigProvider {

    id: string; // uid for this provider

    provideYamlDocument(project: AbstractProject, viewItem: ProjTreeItem, defFileName: string): Promise<File | Error | undefined>;

    onYamlDocSaved(doc: vscode.TextDocument): Promise<void>;

    onYamlDocClosed(doc: vscode.TextDocument): Promise<void>;

    getSourceProjectByFileName(filename: string): AbstractProject | undefined;
}

export class VFolderSourcePathsModifier implements ModifiableYamlConfigProvider {

    id: string = 'src-path-cfg';

    // KV: <ymlFileName, {vFolderPath: string, project: EideProject}>
    private prjFolderSourceChangesMap: Map<string, { vFolderPath: string, project: AbstractProject }> = new Map();

    async provideYamlDocument(project: AbstractProject, item: ProjTreeItem, defFileName: string): Promise<File | Error | undefined> {

        const vSourceManager = project.getVirtualSourceManager();

        // virtual file
        if (item.type === TreeItemType.V_FILE_ITEM ||
            item.type === TreeItemType.V_EXCFILE_ITEM) {

            const vInfo = <VirtualFileInfo>item.val.obj;
            const path = await vscode.window.showInputBox({
                value: vInfo.vFile.path,
                ignoreFocusOut: true,
                prompt: `Input a file path (allow relative path)`
            });

            if (path == undefined) {
                return;
            }

            const repath = project.toRelativePath(path);
            const vFileInfo = vSourceManager.getFile(vInfo.path);
            if (vFileInfo) {
                vFileInfo.path = repath;
                const vDir = NodePath.dirname(vInfo.path);
                // we use 'notifyUpdateFolder', not 'notifyUpdateFile', 
                // because we need to update c/c++ intellisense config
                vSourceManager.notifyUpdateFolder(vDir);
            } else {
                return new Error(`Internal error: can't get obj from virtual path: '${vInfo.path}'`);
            }
        }

        // virtual folder
        else if (item.type === TreeItemType.PROJECT ||
            item.type === TreeItemType.V_FOLDER ||
            item.type === TreeItemType.V_FOLDER_ROOT) {

            const vInfo = <VirtualFolderInfo>item.val.obj;
            const vFolderInfo = vSourceManager.getFolder(vInfo.path);
            if (vFolderInfo) {

                const getOldFileNameByProject = (vPath: string, prj: AbstractProject) => {
                    for (const KV of this.prjFolderSourceChangesMap) {
                        if (KV[1].vFolderPath == vPath &&
                            KV[1].project.getWsPath().toLowerCase() == prj.getWsPath().toLowerCase()) {
                            return KV[0];
                        }
                    }
                };

                let yamlFile: File;

                const oldName = getOldFileNameByProject(vInfo.path, project);
                if (oldName) {
                    yamlFile = File.fromArray([os.tmpdir(), oldName]);
                } else { // if file not exist, add to mapper
                    yamlFile = File.fromArray([os.tmpdir(), defFileName]);
                    this.prjFolderSourceChangesMap.set(yamlFile.name, { vFolderPath: vInfo.path, project: project });
                }

                const yamlLines: string[] = [
                    `#`,
                    `# You can modify files path by editing and saving this file (allow relative path).`,
                    `#`,
                    `# format:`,
                    '#     - path: ./src_1.c',
                    '#     - path: ../xxx/xxx/src_2.c',
                    '#     - path: xxx/${VAR}/src_3.c',
                    '#     - path: d:/path/xxx/src_n.c',
                    `#`,
                    ``,
                    yml.stringify(vFolderInfo.files, { indent: 4 })
                ];

                yamlFile.Write(yamlLines.join(os.EOL));

                return yamlFile;

            } else {
                return new Error(`Internal error: can't get obj from virtual path: '${vInfo.path}'`);
            }
        }
    }

    async onYamlDocSaved(doc: vscode.TextDocument): Promise<void> {

        const fileName = NodePath.basename(doc.uri.fsPath);
        const info = this.prjFolderSourceChangesMap.get(fileName);
        if (info == undefined) return;

        // save to config
        try {

            const vSrcManger = info.project.getVirtualSourceManager();
            const vFolderInfo = vSrcManger.getFolder(info.vFolderPath);
            if (!vFolderInfo) {
                throw new Error(`Virtual folder '${info.vFolderPath}' is not exist !`);
            }

            let fileList: VirtualFile[] = yml.parse(doc.getText());
            if (fileList != undefined && !Array.isArray(fileList)) {
                throw new Error(`Type error, files list must be an array, please check your yaml config file !`);
            }

            // convert to repath
            if (fileList) {
                fileList = fileList.map((vFile) => {
                    return {
                        path: info.project.toRelativePath(vFile.path)
                    };
                });
            }

            vFolderInfo.files = fileList || [];
            vSrcManger.notifyUpdateFolder(info.vFolderPath);

        } catch (error) {
            GlobalEvent.emit('msg', ExceptionToMessage(error, 'Warning'));
        }
    }

    async onYamlDocClosed(doc: vscode.TextDocument): Promise<void> {

        // skip irrelevant files
        const fileName = NodePath.basename(doc.uri.fsPath);
        if (!this.prjFolderSourceChangesMap.has(fileName)) return;

        // do 
        try {
            this.prjFolderSourceChangesMap.delete(fileName); // remove from mapper
            fs.unlinkSync(`${os.tmpdir()}/${fileName}`);
        } catch (error) {
            GlobalEvent.emit('msg', ExceptionToMessage(error, 'Hidden'));
        }
    }

    getSourceProjectByFileName(filename: string): AbstractProject | undefined {
        return this.prjFolderSourceChangesMap.get(filename)?.project;
    }
}

export class ProjectAttrModifier implements ModifiableYamlConfigProvider {

    id: string = 'prj-attr-cfg';

    // KV: <ymlFileName, EideProject>
    private prjCusDepChangesMap: Map<string, AbstractProject> = new Map();

    async provideYamlDocument(project: AbstractProject, viewItem: ProjTreeItem, defFileName: string): Promise<File | Error | undefined> {

        const prj = project;
        const cusDep = prj.GetConfiguration().CustomDep_getDependence();

        // gen deps yaml content
        const yamlLines: string[] = [
            `#`,
            `# ${view_str$virual_doc_provider_banner}`,
            `#`,
            `# example:`,
            `#`,
            `# IncludeFolders:`,
            '#     - ./dir_1',
            '#     - ../xxx/xxx/dir_2',
            '#     - xxx/variable/path/${VAR1}/${VAR2}/dir_3',
            '#     - d:/absolute/path/xxx/dir_n',
            `# LibraryFolders:`,
            '#     - ./dir_1',
            '#     - ../xxx/xxx/dir_2',
            `# Defines:`,
            '#     - TEST',
            '#     - DEFINE_1=123',
            '#     - DEFINE_2=${VAR1}',
            '#',
        ];

        // fill data
        {
            // push include path
            yamlLines.push(
                ``,
                `# Header Include Path`,
                `IncludeFolders:`,
            );
            cusDep.incList.forEach((path) => {
                yamlLines.push(`    - ${prj.toRelativePath(path)}`);
            });

            // push lib folder path
            yamlLines.push(
                ``,
                `# Library Search Path`,
                `LibraryFolders:`,
            );
            cusDep.libList.forEach((path) => {
                yamlLines.push(`    - ${prj.toRelativePath(path)}`);
            });

            // push macros
            yamlLines.push(
                ``,
                `# Preprocessor Definitions`,
                `Defines:`,
            );
            cusDep.defineList.forEach((macro) => {
                yamlLines.push(`    - ${macro}`);
            });
        }

        const getTmpPathByProject = (prj: AbstractProject) => {
            for (const KV of this.prjCusDepChangesMap) {
                if (KV[1].getWsPath().toLowerCase() == prj.getWsPath().toLowerCase()) {
                    return KV[0];
                }
            }
        };

        // write and open file
        const yamlStr = yamlLines.join(os.EOL);
        const oldName = getTmpPathByProject(prj);

        let tmpFile: File;
        if (oldName) {
            tmpFile = File.fromArray([os.tmpdir(), oldName]);
        } else {// if file not exist, add to mapper
            tmpFile = File.fromArray([os.tmpdir(), defFileName]);
            this.prjCusDepChangesMap.set(tmpFile.name, prj);
        }

        tmpFile.Write(yamlStr);

        return tmpFile;
    }

    async onYamlDocSaved(doc: vscode.TextDocument): Promise<void> {

        const tmpFileName = NodePath.basename(doc.fileName);
        const prj = this.prjCusDepChangesMap.get(tmpFileName);

        // skip irrelevant files
        if (prj == undefined) return;

        // save to config
        try {

            const cusDep = prj.GetConfiguration().CustomDep_getDependence();
            const cfg = yml.parse(doc.getText());

            // inc list
            if (Array.isArray(cfg.IncludeFolders)) {
                const li = cfg.IncludeFolders
                    .filter((path: any) => typeof (path) == 'string')
                    .map((path: string) => prj.ToAbsolutePath(path, false));
                cusDep.incList = ArrayDelRepetition(li);
            } else {
                cusDep.incList = [];
            }

            // lib list
            if (Array.isArray(cfg.LibraryFolders)) {
                const li = cfg.LibraryFolders
                    .filter((path: any) => typeof (path) == 'string')
                    .map((path: string) => prj.ToAbsolutePath(path, false));
                cusDep.libList = ArrayDelRepetition(li);
            } else {
                cusDep.libList = [];
            }

            // macro list
            if (Array.isArray(cfg.Defines)) {
                const li = cfg.Defines.filter((path: any) => typeof (path) == 'string');
                cusDep.defineList = ArrayDelRepetition(li);
            } else {
                cusDep.defineList = [];
            }

            prj.GetConfiguration().CustomDep_NotifyChanged();

        } catch (error) {
            GlobalEvent.emit('msg', ExceptionToMessage(error, 'Warning'));
        }
    }

    async onYamlDocClosed(doc: vscode.TextDocument): Promise<void> {

        // skip irrelevant files
        const tmpFileName = NodePath.basename(doc.fileName);
        if (!this.prjCusDepChangesMap.has(tmpFileName)) return;

        // do 
        try {
            this.prjCusDepChangesMap.delete(tmpFileName); // remove from mapper
            fs.unlinkSync(`${os.tmpdir()}/${tmpFileName}`);
        } catch (error) {
            GlobalEvent.emit('msg', ExceptionToMessage(error, 'Hidden'));
        }
    }

    getSourceProjectByFileName(filename: string): AbstractProject | undefined {
        return this.prjCusDepChangesMap.get(filename);
    }
}

export class ProjectExcSourceModifier implements ModifiableYamlConfigProvider {

    id: string = 'src-exc-cfg';

    private yamlFilesMap: Map<string, AbstractProject> = new Map();

    async provideYamlDocument(project: AbstractProject, viewItem: ProjTreeItem, defFileName: string): Promise<File | Error | undefined> {

        const prj = project;

        // gen deps yaml content
        const yamlLines: string[] = [
            `#`,
            `# ${view_str$virual_doc_provider_banner}`,
            `#`,
            '# text format:',
            '',
            '# <target name>:',
            '#     - ./xxx/xxx_src_1.c',
            '#     - ../xx/a/b/x/xxx_src_2.c',
            '#     - <virtual_root>/virtual_folder_1/xxx_src_1.c',
            '#     - <virtual_root>/virtual_folder_1/dir/xxx_src_2.c',
            '#',
            ``,
        ];

        try {

            // 将所有的 targets 中的 excludeList 原样摘出，
            // 然后使用 yaml 格式转换为文本
            prj.getTargets().forEach((targetName) => {
                let excludeList: string[] = [];
                if (targetName == prj.getCurrentTarget()) {
                    excludeList = prj.GetConfiguration().config.excludeList;
                } else {
                    const target = prj.GetConfiguration().config.targets[targetName];
                    if (target)
                        excludeList = target.excludeList;
                }
                yamlLines.push(`${targetName}:`);
                excludeList.forEach(path => {
                    yamlLines.push(`    - ${path}`);
                });
                yamlLines.push('');
            });

            // 查找是否有还未销毁的临时文件可用
            const findCache = (prj: AbstractProject) => {
                for (const KV of this.yamlFilesMap) {
                    if (KV[1].getWsPath().toLowerCase() == prj.getWsPath().toLowerCase()) {
                        return KV[0];
                    }
                }
            };

            const yamlStr = yamlLines.join(os.EOL);
            const oldfile = findCache(prj);

            let ymlFile: File;
            if (oldfile) {
                ymlFile = File.fromArray([os.tmpdir(), oldfile]);
            } else {
                ymlFile = File.fromArray([os.tmpdir(), defFileName]);
                this.yamlFilesMap.set(ymlFile.name, prj);
            }

            ymlFile.Write(yamlStr);

            return ymlFile;

        } catch (error) {
            return error;
        }
    }

    async onYamlDocSaved(doc: vscode.TextDocument): Promise<void> {

        const yamlFile = new File(doc.uri.fsPath);

        const prj = this.yamlFilesMap.get(yamlFile.name);
        if (!prj) return;

        try {
            const jobj = yml.parse(yamlFile.Read());
            // check yaml format
            for (const k in jobj) {
                if (jobj[k] == null)
                    jobj[k] = [];
                else if (!Array.isArray(jobj[k]))
                    throw new Error(`Type error in key '${k}': exclude list must be an array.`);
            }
            // update target's exclude list
            let newExcLi: string[] = []; // for current target
            const oldExcLi = prj.GetConfiguration().config.excludeList;
            const allTargets = prj.GetConfiguration().config.targets;
            prj.getTargets().forEach((targetName) => {
                let newValue: string[] = [];
                if (jobj[targetName])
                    newValue = (<string[]>jobj[targetName]).map(p => File.ToUnixPath(p));
                if (targetName == prj.getCurrentTarget())
                    newExcLi = newValue;
                else
                    allTargets[targetName].excludeList = newValue;
            });
            prj.GetConfiguration().config.excludeList = newExcLi;
            prj.Save();
            prj.notifySourceExplorerViewRefresh();
            // update filesystem source link for current target
            const diffNew2Old = newExcLi.filter(p => !oldExcLi.includes(p));
            const diffOld2New = oldExcLi.filter(p => !newExcLi.includes(p));
            const needUpdateLi = ArrayDelRepetition(diffNew2Old.concat(diffOld2New))
                .filter(p => !p.startsWith(VirtualSource.rootName));
            needUpdateLi.forEach(dir =>
                prj.getNormalSourceManager().notifyUpdateFolder(prj.ToAbsolutePath(dir)));
        } catch (error) {
            GlobalEvent.emit('msg', ExceptionToMessage(error, 'Warning'));
        }
    }

    async onYamlDocClosed(doc: vscode.TextDocument): Promise<void> {

        const fileName = NodePath.basename(doc.uri.fsPath);
        const prj = this.yamlFilesMap.get(fileName);
        if (!prj) return;

        try {
            this.yamlFilesMap.delete(fileName);
            fs.unlinkSync(`${os.tmpdir()}/${fileName}`);
        } catch (error) {
            GlobalEvent.emit('msg', ExceptionToMessage(error, 'Hidden'));
        }
    }

    getSourceProjectByFileName(filename: string): AbstractProject | undefined {
        return this.yamlFilesMap.get(filename);
    }
}
