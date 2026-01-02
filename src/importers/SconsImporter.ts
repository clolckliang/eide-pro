
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as NodePath from 'path';

import { File } from '../../lib/node-utility/File';
import { AbstractProject } from '../EIDEProject';
import {
    ImportOptions,
    ProjectType
} from '../EIDETypeDefine';
import * as cmakeParser from '../CmakeProjectParser';
import { WorkspaceManager } from '../WorkspaceManager';
import { getGlobalState } from '../Platform';
import {
    view_str$operation$import_done,
    continue_text,
    cancel_text,
    view_str$operation$cmake_generating,
    view_str$operation$cmake_generate_failed,
    txt_yes,
    txt_no
} from '../StringTable';
import { SettingManager } from '../SettingManager';
import { GlobalEvent } from '../GlobalEvents';
import { ExceptionToMessage } from '../Message';

export class SconsImporter {

    public static async importProject(option: ImportOptions): Promise<void> {

        const setting = SettingManager.GetInstance();
        const sconstructFile = option.projectFile; // Expects SConstruct
        const projectRoot = sconstructFile.dir;

        // 1. Check if it's an RT-Thread project
        const rtconfigH = File.fromArray([projectRoot, 'rtconfig.h']);
        const isRTThread = rtconfigH.IsFile();

        if (isRTThread) {
            GlobalEvent.log_info(`[SconsImporter] Detected RT-Thread project at: ${projectRoot}`);
            await SconsImporter.importRTThread(projectRoot, sconstructFile);
        } else {
            GlobalEvent.log_info(`[SconsImporter] Generic SCons project at: ${projectRoot}`);
            await SconsImporter.importGenericScons(projectRoot, sconstructFile);
        }
    }

    private static async importRTThread(projectRoot: string, sconstruct: File): Promise<void> {

        const buildDir = NodePath.join(projectRoot, '.vscode');
        const cppPropsFile = File.fromArray([buildDir, 'c_cpp_properties.json']);

        // Try to generate vsc config
        const success = await SconsImporter.runSconsTarget(projectRoot, 'vsc');
        if (!success) {
            // Error already handled
            return;
        }

        if (!cppPropsFile.IsFile()) {
            vscode.window.showErrorMessage(`RT-Thread VSC config not found at: ${cppPropsFile.path}`);
            return;
        }

        // Parse c_cpp_properties.json
        // Note: RT-Thread's vsc target usually doesn't provide a full file list in a structured way for us,
        // but it provides includes and defines. 
        // For files, we might need to fall back to scanning or compile_commands.json

        // Let's check for compile_commands.json first as it's more accurate
        const compileCommandsFile = File.fromArray([projectRoot, 'compile_commands.json']);
        if (compileCommandsFile.IsFile()) {
            return SconsImporter.importByCompileCommands(projectRoot, compileCommandsFile);
        }

        // If no compile_commands, try to parse c_cpp_properties.json
        try {
            const data = JSON.parse(cppPropsFile.Read());
            const config = data['configurations'] ? data['configurations'][0] : undefined;
            if (!config) throw new Error('Invalid c_cpp_properties.json');

            const includes = <string[]>(config['includePath'] || []);
            const defines = <string[]>(config['defines'] || []);

            // For RT-Thread, we'll create a project and let user add files manually or 
            // we can try a simple scan if compile_commands is not available.
            // Actually, RT-Thread projects are better imported via compile_commands.json 
            // if we want to be accurate.

            vscode.window.showInformationMessage('RT-Thread project detected. For best results, please ensure "scons-compiledb" is installed to generate a full file list.');

            // Create project
            await SconsImporter.createEideProject(projectRoot, 'RT-Thread', 'ARM', includes, defines);

        } catch (e) {
            vscode.window.showErrorMessage(`Failed to parse RT-Thread config: ${(<Error>e).message}`);
        }
    }

    private static async importGenericScons(projectRoot: string, sconstruct: File): Promise<void> {

        const compileCommandsFile = File.fromArray([projectRoot, 'compile_commands.json']);

        if (!compileCommandsFile.IsFile()) {
            const msg = 'Generic SCons project detected. Do you want to try generating compile_commands.json? (Requires scons-compiledb)';
            const ans = await vscode.window.showWarningMessage(msg, txt_yes, txt_no);
            if (ans === txt_yes) {
                const success = await SconsImporter.runSconsCommand(projectRoot, ['--compiled-db']);
                if (!success) return;
            } else {
                return;
            }
        }

        if (compileCommandsFile.IsFile()) {
            await SconsImporter.importByCompileCommands(projectRoot, compileCommandsFile);
        } else {
            vscode.window.showErrorMessage('compile_commands.json not found. Import failed.');
        }
    }

    private static async importByCompileCommands(projectRoot: string, jsonFile: File): Promise<void> {

        GlobalEvent.log_info(`[SconsImporter] Importing via compile_commands.json: ${jsonFile.path}`);

        try {
            const cmakeInfo = await cmakeParser.parseCmakeProject(jsonFile);

            await SconsImporter.createEideProject(
                projectRoot,
                cmakeInfo.name,
                cmakeInfo.projectType,
                cmakeInfo.includePaths,
                cmakeInfo.defines,
                cmakeInfo.virtualFolder,
                cmakeInfo.linkerScript
            );

        } catch (e) {
            vscode.window.showErrorMessage(`Failed to parse compilation database: ${(<Error>e).message}`);
        }
    }

    private static async createEideProject(
        projectRoot: string,
        name: string,
        type: ProjectType,
        includes: string[],
        defines: string[],
        virtualFolder?: any,
        linkerScript?: string
    ): Promise<void> {

        const rootFile = new File(projectRoot);
        const basePrj = AbstractProject.NewProject(getGlobalState()).createBase({
            name: rootFile.name,
            projectName: name,
            type: type,
            outDir: rootFile
        }, false);

        const nPrjConfig = basePrj.prjConfig.config;

        if (virtualFolder) {
            nPrjConfig.virtualFolder = virtualFolder;
        }

        nPrjConfig.dependenceList = [{
            groupName: 'custom',
            depList: [{
                name: 'scons-import',
                incList: includes,
                defineList: defines,
                libList: []
            }]
        }];

        nPrjConfig.miscInfo = nPrjConfig.miscInfo || {};
        (<any>nPrjConfig.miscInfo).source_project = {
            type: 'scons',
            path: NodePath.join(projectRoot, 'SConstruct')
        };

        if (linkerScript && basePrj.prjConfig.toolchainConfigModel) {
            const toolchainConfig = basePrj.prjConfig.toolchainConfigModel.data as any;
            if (toolchainConfig && 'scatterFilePath' in toolchainConfig) {
                toolchainConfig.scatterFilePath = linkerScript;
                toolchainConfig.useCustomScatterFile = true;
            }
        }

        basePrj.prjConfig.Save();

        const selection = await vscode.window.showInformationMessage(
            view_str$operation$import_done, continue_text, cancel_text);
        if (selection === continue_text) {
            WorkspaceManager.getInstance().openWorkspace(basePrj.workspaceFile);
        }
    }

    private static async runSconsTarget(cwd: string, target: string): Promise<boolean> {
        return SconsImporter.runSconsCommand(cwd, [`--target=${target}`]);
    }

    private static async runSconsCommand(cwd: string, args: string[]): Promise<boolean> {

        const sconsPath = 'scons'; // Assume scons is in PATH

        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Running scons ${args.join(' ')}`,
            cancellable: false
        }, async (): Promise<boolean> => {
            try {
                const { spawnSync } = require('child_process');
                const result = spawnSync(sconsPath, args, {
                    cwd: cwd,
                    stdio: 'pipe',
                    shell: true
                });

                if (result.status !== 0) {
                    const err = result.stderr ? result.stderr.toString() : 'Unknown error';
                    GlobalEvent.log_error(`[SconsImporter] SCons failed: ${err}`);
                    vscode.window.showErrorMessage(`SCons command failed. Check eide-log for details.`);
                    return false;
                }

                return true;
            } catch (e) {
                GlobalEvent.log_error(`[SconsImporter] Exception: ${(<Error>e).message}`);
                return false;
            }
        });
    }

    public static async refreshToConfig(project: AbstractProject): Promise<boolean> {

        const miscInfo = project.GetConfiguration().config.miscInfo;
        const source_project = miscInfo ? (<any>miscInfo).source_project : undefined;

        if (!source_project || source_project.type !== 'scons') {
            return false;
        }

        const projectRoot = NodePath.dirname(project.ToAbsolutePath(source_project.path));
        const compileCommandsFile = File.fromArray([projectRoot, 'compile_commands.json']);

        // Try to update compile_commands.json if possible
        await SconsImporter.runSconsCommand(projectRoot, ['--compiled-db']);

        if (compileCommandsFile.IsFile()) {
            const cmakeInfo = await cmakeParser.parseCmakeProject(compileCommandsFile);
            const prjConfig = project.GetConfiguration();

            prjConfig.config.virtualFolder = cmakeInfo.virtualFolder;
            prjConfig.config.dependenceList = [{
                groupName: 'custom',
                depList: [{
                    name: 'scons-import',
                    incList: cmakeInfo.includePaths,
                    defineList: cmakeInfo.defines,
                    libList: []
                }]
            }];

            prjConfig.Save();
            project.getVirtualSourceManager().load();
            project.GetDepManager().Refresh();
            project.forceUpdateCpptoolsConfig();
            return true;
        }

        return false;
    }
}
