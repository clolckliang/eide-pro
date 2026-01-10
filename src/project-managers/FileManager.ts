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

import * as NodePath from 'path';
import { File } from '../../lib/node-utility/File';
import { AbstractProject } from '../EIDEProject';
import { VirtualSource } from '../models/VirtualSource';
import {
    FileGroup, VirtualFolder, VirtualFile
} from '../EIDETypeDefine';

/**
 * FileManager provides high-level file management operations for EIDE projects
 *
 * This class wraps VirtualSource and provides additional file management utilities
 * such as file validation, path conversion, and batch operations.
 */
export class FileManager {

    private project: AbstractProject;
    private virtualSource: VirtualSource;

    /**
     * Constructor
     * @param project - The project instance
     * @param virtualSource - The virtual source instance
     */
    constructor(project: AbstractProject, virtualSource: VirtualSource) {
        this.project = project;
        this.virtualSource = virtualSource;
    }

    /**
     * Get a virtual file by path
     * @param vpath - Virtual file path
     * @returns Virtual file or undefined
     */
    getFile(vpath: string): VirtualFile | undefined {
        return this.virtualSource.getFile(vpath);
    }

    /**
     * Add a single file to a virtual folder
     * @param vfolder_path - Virtual folder path
     * @param fspath - File system path
     * @returns The added virtual file or undefined
     */
    addFile(vfolder_path: string, fspath: string): VirtualFile | undefined {
        return this.virtualSource.addFile(vfolder_path, fspath);
    }

    /**
     * Add multiple files to a virtual folder
     * @param folder_path - Virtual folder path
     * @param pathList - Array of file system paths
     * @returns Array of added virtual files or undefined
     */
    addFiles(folder_path: string, pathList: string[]): VirtualFile[] | undefined {
        return this.virtualSource.addFiles(folder_path, pathList);
    }

    /**
     * Remove a file from virtual folder
     * @param vpath - Virtual file path
     * @returns The removed virtual file or undefined
     */
    removeFile(vpath: string): VirtualFile | undefined {
        return this.virtualSource.removeFile(vpath);
    }

    /**
     * Get a virtual folder by path
     * @param vpath - Virtual folder path
     * @returns Virtual folder or undefined
     */
    getFolder(vpath?: string): VirtualFolder | undefined {
        return this.virtualSource.getFolder(vpath);
    }

    /**
     * Add a folder to virtual hierarchy
     * @param name - Folder name
     * @param parent_path - Parent virtual path (optional)
     * @returns The created virtual folder or undefined
     */
    addFolder(name: string, parent_path?: string): VirtualFolder | undefined {
        return this.virtualSource.addFolder(name, parent_path);
    }

    /**
     * Remove a folder from virtual hierarchy
     * @param path - Virtual folder path
     * @returns The removed folder or undefined
     */
    removeFolder(path: string): VirtualFolder | undefined {
        return this.virtualSource.removeFolder(path);
    }

    /**
     * Rename a folder
     * @param vpath - Virtual folder path
     * @param newName - New folder name
     * @returns The renamed folder or undefined
     */
    renameFolder(vpath: string, newName: string): VirtualFolder | undefined {
        return this.virtualSource.renameFolder(vpath, newName);
    }

    /**
     * Check if a path is a folder
     * @param path - Virtual path
     * @returns True if path is a folder
     */
    isFolder(path: string): boolean {
        return this.virtualSource.isFolder(path);
    }

    /**
     * Get all file groups
     * @returns Array of file groups
     */
    getFileGroups(): FileGroup[] {
        return this.virtualSource.getFileGroups();
    }

    /**
     * Traverse all folders in the virtual hierarchy
     * @param func - Callback function for each folder
     */
    traverse(func: (folderInfo: { path: string, folder: VirtualFolder }) => void): void {
        this.virtualSource.traverse(func);
    }

    /**
     * Notify that a file has been updated
     * @param virtualPath - Virtual file path
     */
    notifyUpdateFile(virtualPath: string): void {
        this.virtualSource.notifyUpdateFile(virtualPath);
    }

    /**
     * Notify that a folder has been updated
     * @param virtualPath - Virtual folder path
     */
    notifyUpdateFolder(virtualPath: string): void {
        this.virtualSource.notifyUpdateFolder(virtualPath);
    }

    /**
     * Force update all folders
     */
    forceUpdateAllFolders(): void {
        this.virtualSource.forceUpdateAllFolders();
    }

    /**
     * Check if a file is valid and exists
     * @param vpath - Virtual file path
     * @returns True if file exists
     */
    isValidFile(vpath: string): boolean {
        const vfile = this.getFile(vpath);
        if (!vfile) return false;

        const absPath = this.project.ToAbsolutePath(vfile.path);
        return File.isExists(absPath);
    }

    /**
     * Get file information
     * @param vpath - Virtual file path
     * @returns File info or null
     */
    getFileInfo(vpath: string): { exists: boolean, path: string, size?: number, mtime?: Date } | null {
        const vfile = this.getFile(vpath);
        if (!vfile) return null;

        const absPath = this.project.ToAbsolutePath(vfile.path);
        if (!File.isExists(absPath)) {
            return { exists: false, path: absPath };
        }

        const file = new File(absPath);
        return {
            exists: true,
            path: absPath,
            size: file.size,
            mtime: file.mtime
        };
    }

    /**
     * Validate file paths
     * @param paths - Array of file paths to validate
     * @returns Object with valid and invalid paths
     */
    validatePaths(paths: string[]): { valid: string[], invalid: string[] } {
        const valid: string[] = [];
        const invalid: string[] = [];

        for (const p of paths) {
            if (File.isExists(p)) {
                valid.push(p);
            } else {
                invalid.push(p);
            }
        }

        return { valid, invalid };
    }
}
