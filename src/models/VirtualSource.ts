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

import * as events from 'events';
import * as NodePath from 'path';
import { File } from '../../lib/node-utility/File';
import { FileWatcher } from '../../lib/node-utility/FileWatcher';
import { AbstractProject } from '../EIDEProject';
import {
    ProjectFileGroup, FileGroup, VirtualFolder, VirtualFile,
    ProjectConfigData
} from '../EIDETypeDefine';

/**
 * Interface for source providers
 */
export interface SourceProvider {
    getFileGroups(): FileGroup[];
    notifyUpdateFile(path: string): void;
    notifyUpdateFolder(path: string): void;
    forceUpdateAllFolders(): void;
}

/**
 * Information about a folder
 */
export interface FolderInfo {
    displayName: string;
    needUpdate: boolean;
    fileWatcher: FileWatcher;
}

/**
 * Type for source change events
 */
type SourceChangedEvent = 'folderChanged' | 'dataChanged' | 'fileStatusChanged' | 'folderStatusChanged';

/**
 * VirtualSource manages virtual file system structure for projects
 *
 * This class handles:
 * - Virtual folder hierarchy
 * - Virtual file management
 * - File/folder operations (add, remove, rename)
 * - Event emission for changes
 */
export class VirtualSource implements SourceProvider {

    public static rootName = '<virtual_root>';

    private project: AbstractProject;
    private config: ProjectConfigData<any>;
    private _event: events.EventEmitter;

    /**
     * Event emitter for data changes
     */
    on(event: 'dataChanged', listener: (event: SourceChangedEvent) => void): void;
    on(event: any, listener: (arg: any) => void): void {
        this._event.on(event, listener);
    }

    private emit(event: 'dataChanged', e: SourceChangedEvent): void;
    private emit(event: any, arg?: any): void {
        this._event.emit(event, arg);
    }

    /**
     * Constructor
     * @param prj - The project instance
     */
    constructor(prj: AbstractProject) {
        this.project = prj;
        this.config = <any>null;
        this._event = new events.EventEmitter();
    }

    /**
     * Check if a path is a virtual path
     * @param path - Path to check
     * @returns True if path starts with virtual root
     */
    public static isVirtualPath(path: string): boolean {
        return path.startsWith(VirtualSource.rootName);
    }

    /**
     * Convert path parts to absolute virtual path
     * @param paths - Path components
     * @returns Absolute virtual path
     */
    public static toAbsPath(...paths: string[]): string {
        if (paths.length == 0) return VirtualSource.rootName;
        return VirtualSource.rootName + '/' + paths.join('/');
    }

    /**
     * Get the root virtual folder
     * @returns Root virtual folder
     */
    public getRoot(): VirtualFolder {
        return this.config.virtualFolder;
    }

    /**
     * Get a folder by name from parent folder
     * @param vFolder - Parent folder
     * @param name - Folder name to find
     * @returns Found folder or undefined
     */
    private getFolderByName(vFolder: VirtualFolder, name: string): VirtualFolder | undefined {
        for (const folder of vFolder.folders) {
            if (folder.name === name) {
                return folder;
            }
        }
    }

    /**
     * Traverse all folders in the virtual hierarchy
     * @param func - Callback function for each folder
     */
    traverse(func: (folderInfo: { path: string, folder: VirtualFolder }) => void) {

        const folderStack: { path: string, folder: VirtualFolder }[] = [];

        // put root folders
        const rootFolder = this.getFolder();
        if (rootFolder) {
            folderStack.push({
                path: rootFolder.name,
                folder: rootFolder
            });
        }

        let curFolder: { path: string, folder: VirtualFolder };

        while (folderStack.length > 0) {
            curFolder = <any>folderStack.pop();
            func(curFolder);
            for (const vFolder of curFolder.folder.folders) {
                folderStack.push({
                    path: `${curFolder.path}/${vFolder.name}`,
                    folder: vFolder
                });
            }
        }
    }

    /**
     * Load virtual source from project configuration
     * @param notEmitEvt - If true, don't emit events
     */
    load(notEmitEvt?: boolean) {
        this.config = this.project.GetConfiguration().config;
        // refresh all
        if (!notEmitEvt) { this.forceUpdateAllFolders(); }
    }

    /**
     * Get a folder by virtual path
     * @param vpath - Virtual path (relative to virtual root)
     * @returns Virtual folder or undefined
     */
    getFolder(vpath?: string): VirtualFolder | undefined {
        if (vpath === undefined || vpath === VirtualSource.rootName) {
            return this.getRoot();
        } else {
            const nameList = vpath.split('/');
            let cur_folder: VirtualFolder = {
                name: '/',
                files: [],
                folders: [this.getRoot()]
            };
            for (const name of nameList) {
                const next = this.getFolderByName(cur_folder, name);
                if (next) {
                    cur_folder = next;
                } else {
                    return undefined;
                }
            }
            return cur_folder;
        }
    }

    /**
     * Get a file by virtual path
     * @param vpath - Virtual file path
     * @returns Virtual file or undefined
     */
    getFile(vpath: string): VirtualFile | undefined {
        const vFolder = this.getFolder(NodePath.dirname(vpath));
        if (vFolder) {
            const fileName = NodePath.basename(vpath);
            const index = vFolder.files.findIndex((file) => NodePath.basename(file.path) == fileName);
            if (index !== -1) {
                return vFolder.files[index];
            }
        }
    }

    /**
     * Get all file groups
     * @returns Array of file groups
     */
    getFileGroups(): FileGroup[] {

        const result: FileGroup[] = [];

        this.traverse((folderInfo) => {
            result.push({
                name: folderInfo.path,
                disabled: this.project.isExcluded(folderInfo.path) || undefined,
                files: folderInfo.folder.files.map((vFile) => {
                    const file = new File(this.project.ToAbsolutePath(vFile.path));
                    const vFilePath = `${folderInfo.path}/${file.name}`;
                    return {
                        file: file,
                        disabled: this.project.isExcluded(vFilePath) || undefined
                    };
                })
            });
        });

        return result;
    }

    /**
     * Notify that a file has been updated
     * @param virtualPath - Virtual file path
     */
    notifyUpdateFile(virtualPath: string): void {

        if (!virtualPath.startsWith(VirtualSource.rootName)) {
            return; // if it's not a virtual file, exit
        }

        this.emit('dataChanged', 'fileStatusChanged');
    }

    /**
     * Notify that a folder has been updated
     * @param virtualPath - Virtual folder path
     */
    notifyUpdateFolder(virtualPath: string): void {

        if (!virtualPath.startsWith(VirtualSource.rootName)) {
            return; // if it's not a virtual folder, exit
        }

        const vFolder = this.getFolder(virtualPath);
        if (vFolder) {
            this.emit('dataChanged', 'folderStatusChanged');
        }
    }

    /**
     * Force update all folders
     */
    forceUpdateAllFolders(): void {
        this.emit('dataChanged', 'folderStatusChanged');
    }

    /**
     * Add a single file to a virtual folder
     * @param vfolder_path - Virtual folder path
     * @param fspath - File system path
     * @returns The added virtual file or undefined
     */
    addFile(vfolder_path: string, fspath: string): VirtualFile | undefined {
        const folder = this.getFolder(vfolder_path);
        if (folder) {
            const vFilePath = `${vfolder_path}/${NodePath.basename(fspath)}`;
            if (this.getFile(vFilePath) === undefined) { // file is not existed, add it
                const vFile: VirtualFile = { path: this.project.toRelativePath(fspath) };
                folder.files.push(vFile);
                this.emit('dataChanged', 'folderChanged');
                return vFile;
            }
        }
    }

    /**
     * Add multiple files to a virtual folder
     * @param folder_path - Virtual folder path
     * @param pathList - Array of file system paths
     * @returns Array of added virtual files or undefined
     */
    addFiles(folder_path: string, pathList: string[]): VirtualFile[] | undefined {

        const folder = this.getFolder(folder_path);
        if (folder) {

            const doneList: VirtualFile[] = [];

            for (const abspath of pathList) {
                const vFilePath = `${folder_path}/${NodePath.basename(abspath)}`;
                if (this.getFile(vFilePath) === undefined) { // file is not existed, add it
                    const vFile: VirtualFile = { path: this.project.toRelativePath(abspath) };
                    folder.files.push(vFile);
                    doneList.push(vFile);
                }
            }

            if (doneList.length > 0) {
                this.emit('dataChanged', 'folderChanged');
            }

            return doneList;
        }
    }

    /**
     * Remove a file from virtual folder
     * @param vpath - Virtual file path
     * @returns The removed virtual file or undefined
     */
    removeFile(vpath: string): VirtualFile | undefined {
        const basename = NodePath.basename(vpath);
        const vFolder = this.getFolder(NodePath.dirname(vpath));
        if (vFolder) {
            const index = vFolder.files.findIndex((f) => NodePath.basename(f.path) == basename);
            if (index !== -1) {
                const rmFile = vFolder.files.splice(index, 1)[0];
                this.emit('dataChanged', 'folderChanged');
                return rmFile;
            }
        }
    }

    /**
     * Add a folder to virtual hierarchy
     * @param name - Folder name
     * @param parent_path - Parent virtual path (optional)
     * @returns The created virtual folder or undefined
     */
    addFolder(name: string, parent_path?: string): VirtualFolder | undefined {
        const vFolder = this.getFolder(parent_path);
        if (vFolder) {
            const index = vFolder.folders.findIndex((f) => { return f.name === name; });
            if (index === -1) {
                const nFolder: VirtualFolder = { name: name, files: [], folders: [] };
                vFolder.folders.push(nFolder);
                this.emit('dataChanged', 'folderChanged');
                return nFolder;
            }
        }
    }

    /**
     * Insert a folder into virtual hierarchy
     * @param parentvPath - Parent virtual path
     * @param nFolder - Folder to insert
     * @returns The inserted folder path or undefined
     */
    insertFolder(parentvPath: string, nFolder: VirtualFolder): string | undefined {
        const vFolder = this.getFolder(parentvPath);
        if (vFolder) {
            const index = vFolder.folders.findIndex((f) => f.name == nFolder.name);
            if (index === -1) {
                vFolder.folders.push(nFolder);
                this.emit('dataChanged', 'folderChanged');
                return `${parentvPath}/${nFolder.name}`;
            }
        }
    }

    /**
     * Remove a folder from virtual hierarchy
     * @param path - Virtual folder path
     * @returns The removed folder or undefined
     */
    removeFolder(path: string): VirtualFolder | undefined {
        const name = NodePath.basename(path);
        const vFolder = this.getFolder(NodePath.dirname(path));
        if (vFolder) {
            const index = vFolder.folders
                .findIndex((f) => { return f.name === name; });
            if (index !== -1) {
                const rmFolder = vFolder.folders.splice(index, 1)[0];
                this.emit('dataChanged', 'folderChanged');
                return rmFolder;
            }
        }
    }

    /**
     * Check if a path is a folder
     * @param path - Virtual path
     * @returns True if path is a folder
     */
    isFolder(path: string): boolean {
        return this.getFolder(path) !== undefined;
    }

    /**
     * Rename a folder
     * @param vpath - Virtual folder path
     * @param newName - New folder name
     * @returns The renamed folder or undefined
     */
    renameFolder(vpath: string, newName: string): VirtualFolder | undefined {
        const vFolder = this.getFolder(vpath);
        if (vFolder) {
            vFolder.name = newName;
            this.emit('dataChanged', 'folderChanged');
            return vFolder;
        }
    }
}
