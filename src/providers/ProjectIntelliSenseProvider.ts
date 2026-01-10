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
import {
    CppToolsApi, CustomConfigurationProvider,
    SourceFileConfigurationItem,
    WorkspaceBrowseConfiguration
} from 'vscode-cpptools';
import { AbstractProject } from '../EIDEProject';
import { GlobalEvent } from '../GlobalEvents';

/**
 * IntelliSense configuration provider for EIDE projects
 *
 * Provides C/C++ IntelliSense configuration by integrating with VS Code CppTools API
 */
export class ProjectIntelliSenseProvider implements CustomConfigurationProvider {

    private project: AbstractProject;
    private cppToolsApi: CppToolsApi | undefined;

    /**
     * Constructor
     * @param project - The project instance
     */
    constructor(project: AbstractProject) {
        this.project = project;
    }

    /**
     * Initialize CppTools API
     * @param api - CppTools API instance
     */
    async initialize(api: CppToolsApi): Promise<void> {
        this.cppToolsApi = api;
        GlobalEvent.log_info('CppTools API initialized');
    }

    /**
     * Check if this provider can provide configuration for the given URI
     * @param uri - Document URI
     * @param token - Cancellation token
     * @returns True if can provide configuration
     */
    async canProvideConfiguration(uri: vscode.Uri, token?: vscode.CancellationToken): Promise<boolean> {
        try {
            // Check if file belongs to this project
            const filePath = uri.fsPath;
            const projectPath = this.project.getRootDir().path;

            if (!filePath.startsWith(projectPath)) {
                return false;
            }

            // Check if file is a C/C++ source file
            return this.isSourceFile(filePath);

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            GlobalEvent.log_warn(`canProvideConfiguration error: ${err.message}`);
            return false;
        }
    }

    /**
     * Provide configurations for the given URIs
     * @param uris - Document URIs
     * @param token - Cancellation token
     * @returns Array of source file configurations
     */
    async provideConfigurations(uris: vscode.Uri[], token?: vscode.CancellationToken): Promise<SourceFileConfigurationItem[]> {
        try {
            const configurations: SourceFileConfigurationItem[] = [];

            for (const uri of uris) {
                const config = await this.createConfiguration(uri);
                if (config) {
                    configurations.push(config);
                }
            }

            return configurations;

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            GlobalEvent.log_error(`provideConfigurations error: ${err.message}`);
            return [];
        }
    }

    /**
     * Check if this provider can provide browse configuration per folder
     * @param token - Cancellation token
     * @returns True if can provide browse configuration
     */
    async canProvideBrowseConfigurationsPerFolder(token?: vscode.CancellationToken): Promise<boolean> {
        return true;
    }

    /**
     * Provide folder browse configuration
     * @param uri - Folder URI
     * @param token - Cancellation token
     * @returns Workspace browse configuration or null
     */
    async provideFolderBrowseConfiguration(uri: vscode.Uri, token?: vscode.CancellationToken): Promise<WorkspaceBrowseConfiguration | null> {
        try {
            const projectPath = this.project.getRootDir().path;
            const folderPath = uri.fsPath;

            if (!folderPath.startsWith(projectPath)) {
                return null;
            }

            // Get browse configuration from project
            const browseConfig = this.project.getBrowseConfiguration();
            return browseConfig || null;

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            GlobalEvent.log_warn(`provideFolderBrowseConfiguration error: ${err.message}`);
            return null;
        }
    }

    /**
     * Check if this provider can provide browse configuration
     * @param token - Cancellation token
     * @returns True if can provide browse configuration
     */
    async canProvideBrowseConfiguration(token?: vscode.CancellationToken): Promise<boolean> {
        return true;
    }

    /**
     * Provide browse configuration
     * @param token - Cancellation token
     * @returns Workspace browse configuration or null
     */
    async provideBrowseConfiguration(token?: vscode.CancellationToken): Promise<WorkspaceBrowseConfiguration | null> {
        try {
            const browsePath = this.project.getRootDir().path;
            const browseConfig: WorkspaceBrowseConfiguration = {
                browsePath: [browsePath],
                standardIncludePath: this.project.getIncludePaths(),
                sourcePath: this.project.getSourcePaths(),
                compilerPath: this.project.getCompilerPath(),
                compilerArgs: this.project.getCompilerArgs()
            };

            return browseConfig;

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            GlobalEvent.log_warn(`provideBrowseConfiguration error: ${err.message}`);
            return null;
        }
    }

    /**
     * Create configuration for a single file
     * @param uri - Document URI
     * @returns Source file configuration or undefined
     */
    private async createConfiguration(uri: vscode.Uri): Promise<SourceFileConfigurationItem | undefined> {
        try {
            const filePath = uri.fsPath;
            const relativePath = this.project.toRelativePath(filePath);

            const configuration: SourceFileConfigurationItem = {
                uri: uri.toString(),
                configuration: {
                    includePath: this.project.getIncludePaths(),
                    defines: this.project.getDefines(),
                    compilerPath: this.project.getCompilerPath(),
                    compilerArgs: this.project.getCompilerArgs(),
                    standardLibrary: this.project.getStandardLibrary(),
                    windowsSdkVersion: this.project.getWindowsSdkVersion(),
                }
            };

            return configuration;

        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            GlobalEvent.log_warn(`createConfiguration error for ${uri.fsPath}: ${err.message}`);
            return undefined;
        }
    }

    /**
     * Check if file is a C/C++ source file
     * @param filePath - File path
     * @returns True if file is C/C++ source
     */
    private isSourceFile(filePath: string): boolean {
        const extensions = ['.c', '.cpp', '.cc', '.cxx', '.c++', '.h', '.hpp', '.hxx', '.h++'];
        return extensions.some(ext => filePath.endsWith(ext));
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        // Cleanup if needed
    }
}
