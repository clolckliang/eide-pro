
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as NodePath from 'path';

import { File } from '../../lib/node-utility/File';
import { AbstractProject } from '../EIDEProject';
import {
    ImportOptions,
    ProjectTargetInfo,
    MAPPED_KEYS_IN_TARGET_INFO,
    ProjectType
} from '../EIDETypeDefine';
import * as cmakeParser from '../CmakeProjectParser';
import { ToolchainManager, ToolchainName } from '../ToolchainManager';
import { WorkspaceManager } from '../WorkspaceManager';
import { getGlobalState } from '../Platform';
import { parseCliArgs } from '../utility';
import {
    view_str$operation$import_done,
    continue_text,
    cancel_text,
    view_str$operation$cmake_no_compile_commands,
    txt_yes,
    txt_no,
    view_str$operation$cmake_generating,
    view_str$operation$cmake_generate_failed
} from '../StringTable';
import { SettingManager } from '../SettingManager';
import { GlobalEvent } from '../GlobalEvents';
import { ResInstaller } from '../ResInstaller';
import { ResManager } from '../ResManager';
import { ExceptionToMessage } from '../Message';

export class CMakeImporter {

    public static async importProject(option: ImportOptions): Promise<void> {

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

            let genResult = await CMakeImporter.runCmakeGenerate(cmakePath, projectRoot, buildDir.path, undefined, true);

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
                    genResult = await CMakeImporter.runCmakeGenerate(cmakePath, projectRoot, buildDir.path);
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

                            genResult = await CMakeImporter.runCmakeGenerate(cmakePath, projectRoot, buildDir.path, [
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
        const basePrj = AbstractProject.NewProject(getGlobalState()).createBase({
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

    public static async refreshToConfig(project: AbstractProject): Promise<boolean> {

        const miscInfo = project.GetConfiguration().config.miscInfo;
        const source_project = miscInfo ? (<any>miscInfo).source_project : undefined;

        if (!source_project || source_project.type !== 'cmake') {
            vscode.window.showErrorMessage('Not a CMAKE project !');
            return false;
        }

        const cmakeListsFile = new File(project.ToAbsolutePath(source_project.path));
        if (!cmakeListsFile.IsFile()) {
            vscode.window.showErrorMessage(`Not found '${cmakeListsFile.path}' !`);
            return false;
        }

        const projectRoot = cmakeListsFile.dir;
        const setting = SettingManager.GetInstance();
        const cmakePath = setting.getCmakeExecutablePath();
        const buildDirName = setting.getCmakeBuildDirectory();
        const buildDir = File.fromArray([projectRoot, buildDirName]);
        const compileCommandsFile = File.fromArray([buildDir.path, 'compile_commands.json']);

        // Run cmake to generate compile_commands.json
        let genResult = await CMakeImporter.runCmakeGenerate(cmakePath, projectRoot, buildDir.path);

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
                    genResult = await CMakeImporter.runCmakeGenerate(cmakePath, projectRoot, buildDir.path);
                } catch (e) {
                    vscode.window.showErrorMessage(`Failed to clean build directory: ${(<any>e).message}`);
                    return false;
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
            return false;
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

        return true;
    }

    private static async runCmakeGenerate(cmakePath: string, projectRoot: string, buildDir: string, extraArgs?: string[], suppressError: boolean = false): Promise<{ success: boolean; isNotFound: boolean; isGeneratorMismatch?: boolean; logParts: string[] }> {
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

        return executeResult;
    }
}
