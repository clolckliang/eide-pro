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

import * as fs from 'fs';
import * as vscode from 'vscode';
import * as NodePath from 'path';
import * as events from 'events';
import * as ini from 'ini';
import * as os from 'os';
import * as yaml from 'yaml';
import * as child_process from 'child_process';

import {
    CppToolsApi, Version, CustomConfigurationProvider, getCppToolsApi,
    SourceFileConfigurationItem, WorkspaceBrowseConfiguration
} from 'vscode-cpptools';

import { File } from '../lib/node-utility/File';
import { FileWatcher } from '../lib/node-utility/FileWatcher';
import { KeilParser } from './KeilXmlParser';
import { ResManager } from './ResManager';
import { SevenZipper, SevenZipUnzipExcludeList } from './Compress';
import {
    BuilderOptions,
    ConfigMap, FileGroup,
    ProjectConfiguration, ProjectConfigData, WorkspaceConfiguration,
    CreateOptions,
    ProjectConfigEvent, ProjectFileGroup, FileItem, EIDE_CONF_VERSION, ProjectTargetInfo, VirtualFolder, VirtualFile, CppConfigItem, ProjectBaseApi, ProjectType, BuilderConfigData, MAPPED_KEYS_IN_TARGET_INFO
} from './EIDETypeDefine';
import { ToolchainName, IToolchian, ToolchainManager } from './ToolchainManager';
import { GlobalEvent } from './GlobalEvents';
import { ArrayDelRepetition } from '../lib/node-utility/Utility';
import { ExceptionToMessage, newMessage } from './Message';
import { PackageManager, ComponentUpdateItem, ComponentUpdateType } from './PackageManager';
import { HexUploaderType } from './HexUploader';
import { WebPanelManager } from './WebPanelManager';
import { DependenceManager } from './DependenceManager';
import * as platform from './Platform';
import { md5, copyObject, compareVersion, isGccFamilyToolchain, deepCloneObject, notifyReloadWindow, copyAndMakeObjectKeysToLowerCase, runShellCommand, execInternalCommand } from './utility';
import { ResInstaller } from './ResInstaller';
import {
    view_str$prompt$filesOptionsComment,
    view_str$prompt$reloadForOldProject,
    view_str$prompt$not_found_compiler, view_str$prompt$not_found_gcc_prompt_user_setup,
    view_str$operation$name_can_not_be_blank,
    view_str$operation$name_can_not_have_invalid_char,
    view_str$prompt$project_is_opened_by_another,
    WARNING,
    view_str$prompt$chipPkgNotCompateThisVersion,
    view_str$prompt$userCanceledOperation,
    continue_text,
    cancel_text,
    view_str$prompt$migrationFailed,
} from './StringTable';
import { SettingManager } from './SettingManager';
import { ExeCmd } from '../lib/node-utility/Executable';
import { jsonc } from 'jsonc';
import * as iconv from 'iconv-lite';
import * as globmatch from 'micromatch';
import { EventData, CurrentDevice, ArmBaseCompileConfigModel, ArmBaseCompileData } from './EIDEProjectModules';
import * as FileLock from '../lib/node-utility/FileLock';
import { CompilerCommandsDatabaseItem, CodeBuilder } from './CodeBuilder';
import { xpackRequireDevTools } from './XpackDevTools';

import { AbstractProject, BaseProjectInfo, SourceChangedEvent, SourceExtraCompilerOptionsCfg, VirtualSource } from './ProjectCore/AbstractProject';

export * from './ProjectCore/AbstractProject';

class EIDEProject extends AbstractProject {

    //////////////////////////////// Event handler ///////////////////////////////////

    protected onComponentUpdate(updateList: ComponentUpdateItem[]): void {

        const packInfo = this.packManager.GetPack();
        if (packInfo) {

            vscode.window.withProgress({
                title: `${packInfo.name}`,
                location: vscode.ProgressLocation.Notification
            }, (progress) => {
                return new Promise<void>((resolve) => {

                    const inc = 1 / updateList.length;
                    this.GetConfiguration().beginCacheEvents();

                    updateList.forEach((compItem, index) => {

                        this.dependenceManager.UninstallComponent(packInfo.name, compItem.name);

                        if (compItem.state === ComponentUpdateType.Expired) { // if need reinstalled
                            const comp = this.packManager.FindComponent(compItem.name);
                            if (comp) {
                                try {
                                    this.dependenceManager.InstallComponent(packInfo.name, comp);
                                } catch (error) {
                                    GlobalEvent.log_warn(error);
                                }
                            }
                        }

                        progress.report({
                            increment: inc,
                            message: `Updating components ${index + 1}/${updateList.length}: ${compItem.name}`
                        });
                    });

                    this.GetConfiguration().endCachedEvents();

                    resolve();
                });
            });
        }
    }

    protected onPrjConfigChanged(event: ProjectConfigEvent): void {

        switch (event.type) {
            case 'srcRootAdd':
                this.sourceRoots.add(<string>event.data);
                this.emit('dataChanged', 'files');
                this.UpdateCppConfig();
                break;
            case 'srcRootRemoved':
                this.sourceRoots.remove(<string>event.data);
                this.emit('dataChanged', 'files');
                this.UpdateCppConfig();
                break;
            case 'compiler':
                this.emit('dataChanged', 'compiler');
                this.UpdateCppConfig();
                break;
            case 'uploader':
                this.emit('dataChanged', 'uploader');
                break;
            case 'dependence':
                this.emit('dataChanged', 'dependence');
                this.UpdateCppConfig();
                break;
            case 'projectFileChanged':
                console.log(`eide project file changed: ${this.getProjectFile().path}`);
                this.emit('projectFileChanged');
                break;
            default:
                this.emit('dataChanged');
                break;
        }
    }

    protected onSourceRootChanged(type: SourceChangedEvent): void {
        switch (type) {
            case 'dataChanged':
                // update to config
                const prjConfig = this.GetConfiguration();
                prjConfig.config.srcDirs = this.getSourceRootFolders().map(folder => folder.fileWatcher.file.path);
                // update cpp config
                this.UpdateCppConfig();
                this.emit('dataChanged', 'files');
                break;
            case 'folderStatusChanged':
            case 'folderChanged':
                this.UpdateCppConfig();
                this.emit('dataChanged', 'files');
                break;
            default:
                this.emit('dataChanged', 'files');
                break;
        }
    }

    protected onDeviceChanged(oldDevice?: CurrentDevice | undefined): void {

        const prjConfig = this.GetConfiguration();
        const cConfig = prjConfig.toolchainConfigModel;

        // project type is ARM
        if (cConfig instanceof ArmBaseCompileConfigModel) {

            const newDevInfo = this.GetPackManager().getCurrentDevInfo();

            // clear old device
            if (oldDevice) {
                const dev = this.packManager.getCurrentDevInfo(oldDevice);
                const define = dev?.define?.split(/ |,/g);
                if (define && newDevInfo) { // if we switch device, remove old device macros 
                    this.GetConfiguration().CustomDep_RemoveFromDefineList(define);
                }
            }

            // update new device
            if (newDevInfo) {

                // update compile options
                cConfig.SetKeyValue('cpuType', newDevInfo.core || 'Cortex-M3');

                // update device, set macro
                prjConfig.config.deviceName = newDevInfo.name;
                if (newDevInfo.define) {
                    this.GetConfiguration().CustomDep_AddAllFromDefineList(newDevInfo.define.split(/ |,/g));
                }
            }

            this.emit('dataChanged', 'pack');
        }
    }

    protected onPackageChanged(): void {
        const prjConfig = this.GetConfiguration();
        const packDir = this.GetPackManager().GetPackDir();
        prjConfig.config.packDir = packDir ? (this.ToRelativePath(packDir.path) || null) : null;
        if (!this.GetPackManager().getCurrentDevInfo())
            prjConfig.config.deviceName = null;
        this.dependenceManager.Refresh();
        this.emit('dataChanged', 'pack');
    }

    protected onTargetChanged(t: { name: string, isNew?: boolean }): void {
        this.onSrcExtraOptionsChanged('changed');
        if (t.isNew) this.Save();
    }

    protected onEideDirChanged(evt: 'changed' | 'renamed', file: File): void {

        const target = this.getCurrentTarget().toLowerCase();

        if (evt == 'changed') {

            // source extra compiler args changed
            const cfgFile = File.fromArray([this.getEideDir().path, `${target}.files.options.yml`]);
            if (file.path == cfgFile.path && cfgFile.IsFile()) {
                this.onSrcExtraOptionsChanged(evt);
            }

            // project env changed
            if (file.name == this.getEnvFile(true).name) {
                this.UpdateCppConfig(); // trigger cpptools config update
            }
        }
    }

    ////////////////////////////////

    protected srcExtraCompilerConfig: SourceExtraCompilerOptionsCfg | undefined;

    private onSrcExtraOptionsChanged(evt: 'changed' | 'renamed') {
        this.srcExtraCompilerConfig = this.getSourceExtraArgsCfg();
        this.emit('cppConfigChanged');
    }

    private getExtraCompilerOptionsBySrcFile(srcPath: string, vPath?: string): string[] | undefined {

        const allArgs = this.getExtraArgsForSource(srcPath, vPath, this.getSourceExtraArgsCfg());
        if (!allArgs)
            return undefined;

        const argsList: string[] = [];

        for (const expr in allArgs) {
            argsList.push(allArgs[expr] || '');
        }

        return argsList;
    }

    //////////////////////////////// source refs ///////////////////////////////////

    private srcRefMap: Map<string, File[]> = new Map();

    public async notifyUpdateSourceRefs(toolchain_: ToolchainName | undefined) {

        /* clear old */
        this.srcRefMap.clear();

        /* check source references is enabled ? */
        if (!SettingManager.GetInstance().isDisplaySourceRefs()) {
            return;
        }

        let compiler_cmd_db: CompilerCommandsDatabaseItem[] = [];
        let generate_dep_file: ((cmd_db: CompilerCommandsDatabaseItem[], srcpath: string, deppath: string) => Promise<void>) | undefined;

        // for COSMIC STM8, we need manual generate .d files
        try {
            if (this.getToolchain().name == 'COSMIC_STM8') {
                const compilerDBFile = File.fromArray([this.getOutputFolder().path, 'compile_commands.json']);
                if (compilerDBFile.IsFile()) {
                    compiler_cmd_db = jsonc.parse(compilerDBFile.Read());
                    generate_dep_file = (cmd_db: CompilerCommandsDatabaseItem[], srcpath: string, deppath: string): Promise<void> => {
                        return new Promise((resolve) => {
                            const idx = cmd_db.findIndex((e) => e.file == srcpath);
                            if (idx == -1) { resolve(); return; }
                            const cmd_item = cmd_db[idx];
                            const command = cmd_item.command.replace('-co', '-sm -co');
                            child_process.exec(command, { cwd: cmd_item.directory }, (error: child_process.ExecException | null, stdout: string, stderr: string) => {
                                if (error) {
                                    GlobalEvent.log_warn(`Failed to make '${deppath}', msg: ${(<Error>error).message}`);
                                    try { fs.unlinkSync(deppath); } catch (error) { } // del old .d file
                                    resolve();
                                } else {
                                    fs.writeFileSync(deppath, stdout);
                                    resolve();
                                }
                            });
                        });
                    };
                }
            }
        } catch (error) {
            GlobalEvent.log_warn(error);
        }

        const toolName = toolchain_ || this.getToolchain().name;

        const outFolder = this.getOutputFolder();
        const refListFile = File.fromArray([outFolder.path, 'ref.json']);

        if (!refListFile.IsFile()) {
            return; /* no refs list file, exit */
        }

        try {
            const refMap = JSON.parse(refListFile.Read());
            for (const srcpath in refMap) {
                const refFile = new File((<string>refMap[srcpath]).replace(/\.[^\\\/\.]+$/, '.d'));
                if (generate_dep_file) await generate_dep_file(compiler_cmd_db, srcpath, refFile.path);
                if (!refFile.IsFile()) continue;
                const refs = this.parseRefFile(refFile, toolName).filter(p => p != srcpath);
                this.srcRefMap.set(srcpath, refs.map((path) => new File(path)));
            }
        } catch (error) {
            GlobalEvent.log_warn(error);
        }

        // notify update src view
        this.emit('dataChanged', 'files');
    }

    public getSourceRefs(file: File): File[] {
        return this.srcRefMap.get(file.path) || [];
    }

    public getSourceRefsAll(): string[] {
        const allHeaders: string[] = [];
        this.srcRefMap.forEach(v => v.forEach(f => allHeaders.push(f.path)));
        return ArrayDelRepetition(allHeaders);
    }

    private whitespaceMatcher = /(?<![\\:]) /;

    private gnu_parseRefLines(lines: string[]): string[] {

        const resultList: string[] = [];

        for (let i = 0; i < lines.length; i++) {

            let line = lines[i].replace(/\\\s*$/, '').trim(); // remove char '\' end of line

            if (i == 0) { // first line is makefile dep format: '<obj>: <deps>'
                const sepIndex = line.indexOf(": ");
                if (sepIndex > 0) line = line.substring(sepIndex + 1).trim();
                else continue; /* line is invalid, skip */
            }

            const subLines = line.split(this.whitespaceMatcher);

            for (const headerName of subLines) {
                if (headerName == '') continue;
                resultList.push(this.ToAbsolutePath(headerName
                    .replace(/\\ /g, " ")
                    .replace(/\\:/g, ":")));
            }
        }

        return ArrayDelRepetition(resultList.slice(1));
    }

    private ac5_parseRefLines(lines: string[], startIndex: number = 1): string[] {

        const resultList: string[] = [];

        for (let i = startIndex; i < lines.length; i++) {
            const sepIndex = lines[i].indexOf(": ");
            if (sepIndex > 0) {
                const line = lines[i].substring(sepIndex + 1)
                    .replace(/\\ /g, " ")
                    .replace(/\\:/g, ":").trim();
                resultList.push(this.ToAbsolutePath(line));
            }
        }

        return ArrayDelRepetition(resultList);
    }

    private parseRefFile(dFile: File, toolchain: ToolchainName): string[] {

        let cont: string | undefined;

        if (ResManager.getLocalCodePage() == '936') { // win32 gbk
            cont = iconv.decode(fs.readFileSync(dFile.path), '936');
        } else {
            cont = fs.readFileSync(dFile.path, 'utf8');
        }

        const lines: string[] = cont
            .split(/\r\n|\n/)
            .filter((line) => line.trim() != '');

        switch (toolchain) {
            case "AC5":
                return this.ac5_parseRefLines(lines);
            case "IAR_ARM":
            case "IAR_STM8":
                return this.ac5_parseRefLines(lines, 1);
            default:
                return this.gnu_parseRefLines(lines);
        }
    }

    //////////////////////////////// create project ///////////////////////////////////

    public createBase(option: CreateOptions, createNewPrjFolder: boolean = true): BaseProjectInfo {

        const rootDir: File = createNewPrjFolder
            ? File.fromArray([option.outDir.path, option.name])
            : option.outDir;

        rootDir.CreateDir(true);

        const wsFile = File.from(rootDir.path,
            (option.projectName || option.name) + AbstractProject.workspaceSuffix);

        // if workspace is existed, force delete it
        if (wsFile.IsFile()) { try { fs.unlinkSync(wsFile.path); } catch (error) { } }

        File.fromArray([wsFile.dir, AbstractProject.EIDE_DIR]).CreateDir(true);
        File.fromArray([wsFile.dir, AbstractProject.vsCodeDir]).CreateDir(true);

        const wsConfig = new WorkspaceConfiguration(wsFile).load();
        const eideFile = File.fromArray([wsFile.dir, AbstractProject.EIDE_DIR, AbstractProject.prjConfigName]);
        const prjConfig = new ProjectConfiguration(eideFile, this.workspaceState, option.type).load();

        // set project name
        prjConfig.config.name = option.projectName || AbstractProject.formatProjectName(option.name);

        return {
            rootFolder: rootDir,
            workspaceFile: wsFile,
            prjConfig: prjConfig
        };
    }

    protected create(option: CreateOptions): File {
        const baseInfo = this.createBase(option);
        baseInfo.prjConfig.config.name = option.projectName || AbstractProject.formatProjectName(option.name);
        baseInfo.prjConfig.config.outDir = 'build';
        baseInfo.prjConfig.config.srcDirs = [];
        baseInfo.prjConfig.Save();
        return baseInfo.workspaceFile;
    }

    ExportToKeilProject(): File | undefined {

        let keilFile: File;

        const prjConfig = this.GetConfiguration().config;

        if (!['ARM', 'C51'].includes(prjConfig.type)) { // only support for ARM, C51 project
            throw new Error(`only support for 'ARM', 'C51' project`);
        }

        const keilSuffix = prjConfig.type === 'C51' ? 'uvproj' : 'uvprojx';
        const suffixFilter = [new RegExp('\\.' + keilSuffix + '$', 'i')];

        // local keil file
        const localKeilFile = File.fromArray([this.GetRootDir().path, `${prjConfig.name}.${keilSuffix}`]);

        // get from project root folder
        if (localKeilFile.IsFile()) {
            keilFile = localKeilFile;
        } else {
            const keilFileList = ResManager.GetInstance().GetTemplateDir().GetList(suffixFilter, File.EXCLUDE_ALL_FILTER);
            const fIndex = keilFileList.findIndex((f) => { return f.noSuffixName === prjConfig.type; });
            if (fIndex === -1) { throw new Error('Not found \'' + prjConfig.type + '\' keil template file'); }
            keilFile = keilFileList[fIndex];
        }

        const keilParser = KeilParser.NewInstance(keilFile, prjConfig.type === 'C51' ? 'c51' : 'arm');

        let cDevice: CurrentDevice | undefined;
        if (prjConfig.type === 'ARM') { // only for ARM project
            cDevice = this.packManager.GetCurrentDevice();
        }

        let fileGroups: FileGroup[] = [];
        let halFiles: FileItem[] = [];

        this.getFileGroups().forEach((_group) => {

            // is filesystem source
            if (!AbstractProject.isVirtualSourceGroup(_group)) {
                const group = <ProjectFileGroup>_group;
                const rePath = this.ToRelativePath(group.dir.path);
                // combine HAL folder
                if (rePath && rePath.startsWith(PackageManager.PACK_DIR)) {
                    halFiles = halFiles.concat(group.files);
                } else {
                    fileGroups.push(<FileGroup>{
                        name: File.ToUnixPath(<string>rePath).toUpperCase(),
                        files: group.files,
                        disabled: group.disabled
                    });
                }
            }

            // is virtual source
            else {
                fileGroups.push({
                    name: _group.name.replace(`${VirtualSource.rootName}/`, ''), // remove '<virtual_root>/' header for keil
                    files: _group.files,
                    disabled: _group.disabled
                });
            }
        });

        if (halFiles.length > 0) {
            const index = fileGroups.findIndex((group) => group.name === 'HAL');
            if (index === -1) {
                fileGroups.push(<FileGroup>{
                    name: 'HAL',
                    files: halFiles
                });
            } else {
                fileGroups[index].files = fileGroups[index].files.concat(halFiles);
            }
        }

        // rm empty file groups for MDK
        fileGroups = fileGroups.filter(g => g.files.length > 0);

        // set keil xml
        keilParser.SetKeilXml(this, fileGroups, cDevice);

        return keilParser.Save(this.GetRootDir(), localKeilFile.noSuffixName);
    }

    //////////////////////////////// overrride ///////////////////////////////////

    private async runInstallScript(prjRoot: File, scriptName: string, title?: string): Promise<boolean> {

        const script = File.fromArray([prjRoot.path, AbstractProject.EIDE_DIR, scriptName]);
        const bash = ResManager.GetInstance().getMsysBash();
        if (!script.IsFile()) return true; // not found script, exit

        try {

            const proc = new ExeCmd();
            const cmd = `./${AbstractProject.EIDE_DIR}/${scriptName}`;

            title = title || script.noSuffixName;

            return vscode.window.withProgress({
                title: title,
                location: vscode.ProgressLocation.Notification
            }, (): Thenable<boolean> => {

                return new Promise((resolve) => {

                    proc.on('launch', () => {
                        GlobalEvent.emit('globalLog.append', os.EOL + `>>> running '${scriptName}' ...` + os.EOL + os.EOL);
                        GlobalEvent.emit('globalLog.show');
                    });

                    proc.on('line', (line) => GlobalEvent.emit('globalLog.append', line + os.EOL));
                    proc.on('errLine', (line) => GlobalEvent.emit('globalLog.append', line + os.EOL));
                    proc.on('error', (err) => GlobalEvent.log_error(err));

                    proc.on('close', (exitInf) => {
                        GlobalEvent.emit('globalLog.append', os.EOL + `process exited, exitCode: ${exitInf.code}` + os.EOL);
                        resolve(exitInf.code == 0);
                    });

                    proc.Run(cmd, undefined, { cwd: prjRoot.path, shell: bash?.path });
                });
            });

        } catch (error) {
            GlobalEvent.log_error(error);
            GlobalEvent.emit('globalLog.show');
        }

        return false;
    }

    protected async BeforeLoad(wsFile: File): Promise<void> {

        await super.BeforeLoad(wsFile);

        // run pre-install.sh
        if (this.isNewProject) {
            const name = 'pre-install.sh';
            const prjRoot = new File(wsFile.dir);
            const ok = await this.runInstallScript(prjRoot, name, `Running 'pre-install' task ...`);
            if (!ok) { throw new Error(`Run '${name}' failed !, please check logs in 'eide-log' output panel.`); }
        }
    }

    protected async AfterLoad(): Promise<void> {

        await super.AfterLoad();

        // register cfg watcher
        this.onSrcExtraOptionsChanged('changed'); // notify cpptools update now

        // init settings for new project
        if (this.isNewProject) {

            const workspaceConfig = this.GetWorkspaceConfig();
            const settings = workspaceConfig.config.settings;

            // --- eide settings
            // TODO

            // --- vscode settings

            // 避免 msys bash 出现 cygpath 问题
            if (SettingManager.instance().isEnableMsys())
                settings['terminal.integrated.shellIntegration.enabled'] = false;

            // 默认不要自动插入 header
            if (settings["clangd.arguments"] == undefined)
                settings["clangd.arguments"] = ["--header-insertion=never"];

            if (settings['files.autoGuessEncoding'] === undefined) {
                settings['files.autoGuessEncoding'] = true;
            }

            if (settings['C_Cpp.default.configurationProvider'] === undefined) {
                settings['C_Cpp.default.configurationProvider'] = this.extensionId;
            }

            if (settings['C_Cpp.errorSquiggles'] == undefined ||
                settings['C_Cpp.errorSquiggles'] == 'Disabled') {
                settings['C_Cpp.errorSquiggles'] = "disabled";
            }

            // if (this.getToolchain().name == 'COSMIC_STM8') {
            //     settings["C_Cpp.intelliSenseEngine"] = "Tag Parser";
            // }

            // remove some c/c++ configs
            [
                'C_Cpp.default.intelliSenseMode',
                'C_Cpp.default.cppStandard',
                'C_Cpp.default.cStandard'
            ].forEach((key) => {
                if (settings[key]) {
                    settings[key] = undefined;
                }
            });

            const fileAssCfg: any = {
                ".eideignore": "ignore",
                "*.a51": "a51",
                "*.h": "c",
                "*.c": "c",
                "*.hxx": "cpp",
                "*.hpp": "cpp",
                "*.c++": "cpp",
                "*.cpp": "cpp",
                "*.cxx": "cpp",
                "*.cc": "cpp"
            };

            if (!settings['files.associations']) {
                settings['files.associations'] = fileAssCfg;
            } else {
                for (const key in fileAssCfg) {
                    if (!settings['files.associations'][key]) {
                        settings['files.associations'][key] = fileAssCfg[key];
                    }
                }
            }

            if (!settings['[yaml]']) {
                settings['[yaml]'] = {
                    "editor.insertSpaces": true,
                    "editor.tabSize": 4,
                    "editor.autoIndent": "advanced"
                };
            }

            // --- vscode tasks

            // append default task for new project
            try {
                const defTasks = [
                    {
                        "label": "build",
                        "type": "shell",
                        "command": "${command:eide.project.build}",
                        "group": "build",
                        "problemMatcher": []
                    },
                    {
                        "label": "flash",
                        "type": "shell",
                        "command": "${command:eide.project.uploadToDevice}",
                        "group": "build",
                        "problemMatcher": []
                    },
                    {
                        "label": "build and flash",
                        "type": "shell",
                        "command": "${command:eide.project.buildAndFlash}",
                        "group": "build",
                        "problemMatcher": []
                    },
                    {
                        "label": "rebuild",
                        "type": "shell",
                        "command": "${command:eide.project.rebuild}",
                        "group": "build",
                        "problemMatcher": []
                    },
                    {
                        "label": "clean",
                        "type": "shell",
                        "command": "${command:eide.project.clean}",
                        "group": "build",
                        "problemMatcher": []
                    }
                ];
                const tasksFile = File.fromArray([this.GetRootDir().path, AbstractProject.vsCodeDir, 'tasks.json']);
                if (!tasksFile.IsFile()) {
                    tasksFile.Write(JSON.stringify({
                        "version": "2.0.0",
                        "tasks": defTasks
                    }, undefined, 4));
                }
            } catch (error) {
                GlobalEvent.emit('msg', ExceptionToMessage(error, 'Hidden'));
            }

            // // gen default 'settings.json'
            // try {
            //     const settingsFile = File.fromArray([this.GetRootDir().path, AbstractProject.vsCodeDir, 'settings.json']);
            //     if (!settingsFile.IsFile()) { settingsFile.Write('{}'); }
            // } catch (error) {
            //     // nothing todo
            // }

            // add extension recommendation
            {
                let recommendExt: string[] = [
                    "cl.eide",
                    "keroc.hex-fmt",
                    "xiaoyongdong.srecord",
                    "hars.cppsnippets",
                    "zixuanwang.linkerscript",
                    "redhat.vscode-yaml",
                    "IBM.output-colorizer",
                    "cschlosser.doxdocgen",
                    "ms-vscode.vscode-serial-monitor"
                ];

                const prjInfo = this.GetConfiguration().config;

                if (prjInfo.type == 'ARM') {
                    recommendExt.push(
                        "dan-c-underwood.arm",
                        "marus25.cortex-debug",
                    );
                }

                else if (prjInfo.type == 'C51') {
                    recommendExt.push('cl.stm8-debug');
                }

                if (workspaceConfig.config.extensions &&
                    workspaceConfig.config.extensions.recommendations instanceof Array) {
                    recommendExt = ArrayDelRepetition(recommendExt.concat(workspaceConfig.config.extensions.recommendations));
                }

                if (workspaceConfig.config.extensions == undefined) {
                    workspaceConfig.config.extensions = {};
                }

                workspaceConfig.config.extensions.recommendations = recommendExt;
            }

            // default .gitignore
            {
                const ignCont = [
                    '# dot files',
                    '/.vscode/launch.json',
                    '/.settings',
                    '/.eide/log',
                    '/.eide.usr.ctx.json',
                    '',
                    '# project out',
                    '/build', '/bin', '/obj', '/out',
                    '',
                    '# eide template',
                    '*.ept',
                    '*.eide-template',
                    ''
                ];

                const ignFile = File.fromArray([this.GetRootDir().path, '.gitignore']);
                if (!ignFile.IsFile()) {
                    ignFile.Write(ignCont.join(os.EOL));
                }
            }

            // default .clang-format
            {
                const fSrc = File.fromArray([ResManager.GetInstance().GetAppDataDir().path, '.clang-format']);
                const fDst = File.fromArray([this.GetRootDir().path, '.clang-format']);
                if (!fDst.IsFile() && fSrc.IsFile()) {
                    fs.copyFileSync(fSrc.path, fDst.path);
                }
            }

            workspaceConfig.Save(true);
        }

        /* update src refs */
        this.notifyUpdateSourceRefs(undefined);

        // !! we need deleted global c_cpp_properties.json !!
        {
            const cfgFile = File.fromArray([
                this.GetRootDir().path, '.vscode', AbstractProject.cppConfigName
            ]);

            if (cfgFile.IsFile()) {
                try {
                    if (this.isNewProject || this.isOldVersionProject) {
                        fs.unlinkSync(cfgFile.path);
                    } else {
                        const cfg = jsonc.parse(cfgFile.Read());
                        if (Array.isArray(cfg['configurations'])) {
                            const idx = cfg['configurations'].findIndex((item) => item['name'] == os.platform());
                            if (idx != -1 && cfg['configurations'][idx].configurationProvider == this.extensionId) {
                                fs.unlinkSync(cfgFile.path);
                            }
                        }
                    }
                } catch (error) {
                    //
                }
            }
        }

        // delete '.eide/log' folder
        if (this.isNewProject || this.isOldVersionProject) {
            const _d = File.from(this.getRootDir().path, '.eide', 'log');
            if (_d.IsDir()) {
                try {
                    platform.DeleteDir(_d);
                } catch (error) {
                    GlobalEvent.log_error(error);
                }
            }
        }

        // show warnings if we have
        setTimeout(async (rootFolder: File) => {
            try {
                for (const f of rootFolder.GetList([/importer\.warning\.txt$/], File.EXCLUDE_ALL_FILTER)) {
                    const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(f.ToUri()));
                    vscode.window.showTextDocument(doc, { preview: false, selection: doc.lineAt(0).range });
                    break;
                }
            } catch (error) {
                GlobalEvent.emit('error', error);
            }
        }, 1000, this.GetRootDir());

        // run post-install.sh
        if (this.isNewProject) {
            this.runInstallScript(this.GetRootDir(), 'post-install.sh', `Running 'post-install' task ...`)
                .then((done) => {
                    if (!done) {
                        const msg = `Run 'post-install' failed !, please check logs in 'eide-log' output panel.`;
                        vscode.window.showWarningMessage(msg);
                        GlobalEvent.emit('globalLog.show');
                    }
                });
        }

        // save now
        this.Save(false, 100);

        if (this.GetConfiguration().needReloadProject) {
            notifyReloadWindow(view_str$prompt$reloadForOldProject);
        }
    }

    ////////////////////////////////// cpptools intellisence provider ///////////////////////////////////

    name: string = 'eide';
    extensionId: string = 'cl.eide';

    // virtual source path list (!! must be real absolute path !!)
    //      key: fsPath
    //      val: virtual path
    private vSourceList: Map<string, string> = new Map();

    private cppToolsConfig: CppConfigItem = {
        name: os.platform(),
        includePath: [],
        defines: []
    };

    private __cpptools_updateTimeout: NodeJS.Timeout | undefined;

    getCpptoolsConfig(): CppConfigItem {
        return <CppConfigItem>deepCloneObject(this.cppToolsConfig);
    }

    forceUpdateCpptoolsConfig(): void {
        this.UpdateCppConfig();
    }

    UpdateCppConfig() {

        // if updater not in running, create it
        if (this.__cpptools_updateTimeout == undefined) {
            this.__cpptools_updateTimeout =
                setTimeout(() => {
                    try {
                        this.doUpdateCpptoolsConfig();
                        this.doUpdateCompilerDatabase();
                    } catch (error) {
                        GlobalEvent.emit('msg', ExceptionToMessage(error, 'Hidden'));
                    }
                }, 1000);
        }

        // we already have a updater in running, now delay it
        else {
            this.__cpptools_updateTimeout.refresh();
        }
    }

    private _getCompilerIntrDefsForCpptools<T extends BuilderConfigData>(
        toolchain: IToolchian, builderCfg: T, builderOpts: BuilderOptions): string[] {

        if (isGccFamilyToolchain(toolchain.name) || toolchain.name == 'LLVM_ARM') {
            // 对于 gcc/clang 系列，C/C++ 具备自动解析宏定义功能，因此无需返回任何宏定义
            return [];
        } else {
            let defines = toolchain.getInternalDefines(builderCfg, builderOpts);
            // 对于 AC5 和 AC6, 我们仅仅返回几个动态的宏，其他的宏定义暂时丢弃，
            // 因为这可能会导致 Cpptools 无法识别，另外我们已经在 xxx_intr.h 中预定义了一些宏
            if (toolchain.name == 'AC5') {
                const filterkeys = [
                    '__ARMCC_VERSION',
                    '__TARGET_CPU_',
                    '__TARGET_FPU_', '__SOFTFP',
                    '__TARGET_ARCH',
                    '__thumb',
                    '__MICROLIB',
                    '__STDC_VERSION'
                ];
                defines = defines.filter(d => filterkeys.some(k => d.name.startsWith(k)));
            } else if (toolchain.name == 'AC6') {
                const filterkeys = [
                    '__ARM_PCS_VFP'
                ];
                defines = defines.filter(d => filterkeys.some(k => d.name.startsWith(k)));
            }
            return defines.map(d => `${d.name}=${d.value}`);
        }
    }

    private doUpdateCpptoolsConfig() {

        const builderOpts = this.getBuilderOptions();
        const toolchain = this.getToolchain();
        const prjConfig = this.GetConfiguration();

        // get project includes and defines
        const depMerge = prjConfig.GetAllMergeDep();
        const defMacros: string[] = ['__VSCODE_CPPTOOL']; // it's for internal force include header
        const intrDefs = this._getCompilerIntrDefsForCpptools(toolchain, <any>prjConfig.config.toolchainConfig, builderOpts);
        const defLi = defMacros.concat(depMerge.defineList, intrDefs);
        depMerge.incList = depMerge.incList.concat(this.getSourceIncludeList()).map(p => this.ToAbsolutePath(p));

        // update includes and defines 
        this.cppToolsConfig.includePath = ArrayDelRepetition(depMerge.incList.map((_path) => File.ToUnixPath(platform.realpathSync(_path))));
        this.cppToolsConfig.defines = ArrayDelRepetition(defLi);

        // update intellisence info
        {
            // clear old value
            this.cppToolsConfig.compilerArgs = undefined;
            this.cppToolsConfig.cCompilerArgs = undefined;
            this.cppToolsConfig.cppCompilerArgs = undefined;

            // preset cpu info for arm project
            if (prjConfig.toolchainConfigModel instanceof ArmBaseCompileConfigModel) {
                builderOpts.global = builderOpts.global || {};
                const cpuName: string = prjConfig.toolchainConfigModel.data.cpuType.toLowerCase();
                const fpuName: string = prjConfig.toolchainConfigModel.data.floatingPointHardware;
                const archExt: string = prjConfig.toolchainConfigModel.data.archExtensions || '';
                // 将 cpu 信息作为上下文传递给 updateCppIntellisenceCfg，
                // 以便 toolchain 能够生成合适的 compiler args 用于执行 Intellisence
                builderOpts.global['_cpuName'] = cpuName;
                builderOpts.global['_fpuType'] = fpuName;
                builderOpts.global['_archExt'] = archExt;
            }

            // update
            toolchain.updateCppIntellisenceCfg(builderOpts, this.cppToolsConfig);

            // merge c compiler args
            if (this.cppToolsConfig.compilerArgs || this.cppToolsConfig.cCompilerArgs) {

                this.cppToolsConfig.cCompilerArgs = (this.cppToolsConfig.compilerArgs || [])
                    .concat(this.cppToolsConfig.cCompilerArgs || []);

                this.cppToolsConfig.cCompilerArgs = this.cppToolsConfig.cCompilerArgs.map((param) => {
                    return param.replace('${c_cppStandard}', this.cppToolsConfig.cStandard || 'c11');
                });
            }

            // merge c++ compiler args
            if (this.cppToolsConfig.compilerArgs || this.cppToolsConfig.cppCompilerArgs) {

                this.cppToolsConfig.cppCompilerArgs = (this.cppToolsConfig.compilerArgs || [])
                    .concat(this.cppToolsConfig.cppCompilerArgs || []);

                this.cppToolsConfig.cppCompilerArgs = this.cppToolsConfig.cppCompilerArgs.map((param) => {
                    return param.replace('${c_cppStandard}', this.cppToolsConfig.cppStandard || 'c++11');
                });
            }

            // replace var value for global args
            if (this.cppToolsConfig.compilerArgs) {
                this.cppToolsConfig.compilerArgs = (<string[]>this.cppToolsConfig.compilerArgs).map((param) => {
                    return param.replace('${c_cppStandard}', this.cppToolsConfig.cStandard || 'c99');
                });
            }
        }

        // replace env variables for config
        {
            this.cppToolsConfig.defines = this.cppToolsConfig.defines.map((arg) => {
                return this.replacePathEnv(arg);
            });

            if (this.cppToolsConfig.compilerArgs) {
                this.cppToolsConfig.compilerArgs = (<string[]>this.cppToolsConfig.compilerArgs).map((arg) => {
                    return this.replacePathEnv(arg);
                });
            }

            if (this.cppToolsConfig.cCompilerArgs) {
                this.cppToolsConfig.cCompilerArgs = (<string[]>this.cppToolsConfig.cCompilerArgs).map((arg) => {
                    return this.replacePathEnv(arg);
                });
            }

            if (this.cppToolsConfig.cppCompilerArgs) {
                this.cppToolsConfig.cppCompilerArgs = (<string[]>this.cppToolsConfig.cppCompilerArgs).map((arg) => {
                    return this.replacePathEnv(arg);
                });
            }
        }

        // filter unhandled env variables
        {
            const varMatcher = /\$\{.+\}/;

            if (this.cppToolsConfig.compilerArgs) {
                this.cppToolsConfig.compilerArgs = this.cppToolsConfig.compilerArgs.filter(a => !varMatcher.test(a));
            }

            if (this.cppToolsConfig.cCompilerArgs) {
                this.cppToolsConfig.cCompilerArgs = this.cppToolsConfig.cCompilerArgs.filter(a => !varMatcher.test(a));
            }

            if (this.cppToolsConfig.cppCompilerArgs) {
                this.cppToolsConfig.cppCompilerArgs = this.cppToolsConfig.cppCompilerArgs.filter(a => !varMatcher.test(a));
            }
        }

        // update source browse path
        const srcBrowseFolders: string[] = [];

        this.vSourceList.clear();
        this.getVirtualSourceManager().traverse((vFolder) => {
            vFolder.folder.files.forEach((vFile) => {
                const fAbsPath = platform.realpathSync(this.ToAbsolutePath(vFile.path)); // resolve symbol link
                const virtPath = `${vFolder.path}/${NodePath.basename(vFile.path)}`;
                this.vSourceList.set(fAbsPath, virtPath);
                srcBrowseFolders.push(`${File.ToUnixPath(NodePath.dirname(fAbsPath))}/*`);
            });
        });

        this.getNormalSourceManager().getFileGroups().forEach(fGrp => {
            if (fGrp.disabled) { return; } // skip disabled group
            fGrp.files.forEach(fItem => {
                if (fItem.disabled) { return; } // skip disabled file
                srcBrowseFolders.push(`${File.ToUnixPath(platform.realpathSync(fItem.file.dir))}/*`);
            });
        });

        // update includes to browse info
        this.cppToolsConfig.browse = {
            limitSymbolsToIncludedHeaders: true,
            path: ArrayDelRepetition(srcBrowseFolders)
        };

        // compiler path
        this.cppToolsConfig.compilerPath = this.getToolchain().getGccFamilyCompilerPathForCpptools();
        if (this.cppToolsConfig.compilerPath == undefined) {
            // Set "compilerPath" to "" to disable detection of system includes and defines.
            this.cppToolsConfig.compilerPath = "";
        }

        // update forceinclude headers
        this.cppToolsConfig.forcedInclude = [];

        toolchain.getForceIncludeHeaders()?.forEach((f_path) => {
            this.cppToolsConfig.forcedInclude?.push(File.normalize(f_path));
        });

        SettingManager.GetInstance().getForceIncludeList().forEach((path) => {
            this.cppToolsConfig.forcedInclude?.push(this.ToAbsolutePath(path));
        });

        // notify config changed
        this.emit('cppConfigChanged');
        console.log(this.cppToolsConfig);

        // clear timeout obj
        this.__cpptools_updateTimeout = undefined;
    }

    canProvideConfiguration(uri: vscode.Uri, token?: vscode.CancellationToken | undefined): Thenable<boolean> {

        return new Promise((resolve) => {

            const realPath = platform.realpathSync(uri.fsPath);
            const lowcasePath = uri.fsPath.toLowerCase();
            const prjRoot = platform.realpathSync(this.GetRootDir().path);
            const allIncPaths = this.cppToolsConfig.includePath.map(p => File.ToLocalPath(p.toLowerCase()));

            // filter source files that can provide
            let result: boolean =
                realPath.startsWith(prjRoot) ||                      // All source files in current workspace
                allIncPaths.some(p => lowcasePath.startsWith(p)) ||  // All files in IncludePaths
                this.vSourceList.has(realPath) ||                    // All virtual source files
                this.sourceRoots.isIncludes(realPath);               // All source files in linked source folders

            // other .h files
            if (!result && AbstractProject.headerFilter.test(lowcasePath)) {
                const allHeaders = this.getSourceRefsAll().map(p => File.ToLocalPath(p.toLowerCase()));
                result = result ||
                    allHeaders.some(p => p == lowcasePath) || // All .h files for this project
                    lowcasePath.startsWith(this.getToolchain().getToolchainDir().path.toLowerCase()); // All .h files in toolchain dir
            }

            resolve(result);
        });
    }

    private readonly cFileMatcher = /\.(?:c|h)$/i;

    provideConfigurations(uris: vscode.Uri[], token?: vscode.CancellationToken | undefined): Thenable<SourceFileConfigurationItem[]> {

        return new Promise((resolve) => {

            resolve(uris.map((uri) => {

                let fileArgs: string[] | undefined;

                if (this.cppToolsConfig.compilerPath) { // if compiler is available, parse file options
                    const filePath = platform.realpathSync(uri.fsPath);
                    const vPath = this.vSourceList.get(filePath);
                    fileArgs = this.getExtraCompilerOptionsBySrcFile(filePath, vPath);
                }

                // c files
                if (this.cFileMatcher.test(uri.fsPath)) {

                    let compilerArgs = this.cppToolsConfig.cCompilerArgs;
                    if (fileArgs) {
                        compilerArgs = (compilerArgs || []).concat(fileArgs);
                    }

                    return {
                        from_: `${this.getProjectName()}:${this.getCurrentTarget()} (${this.getUid()})`,
                        uri: uri,
                        configuration: {
                            standard: <any>this.cppToolsConfig.cStandard,
                            includePath: this.cppToolsConfig.includePath,
                            defines: this.cppToolsConfig.defines,
                            forcedInclude: this.cppToolsConfig.forcedInclude,
                            compilerPath: this.cppToolsConfig.compilerPath,
                            compilerArgs: compilerArgs
                        }
                    };
                }

                // c++ files
                else {

                    const compilerArgs: string[] = [];
                    const compilerPath = this.getToolchain().getGccFamilyCompilerPathForCpptools('c++');

                    // We need to tell gcc compiler: this is a c++ file
                    if (compilerPath) {
                        compilerArgs.push('-xc++');
                    }

                    this.cppToolsConfig.cppCompilerArgs?.forEach(arg => compilerArgs.push(arg));
                    if (fileArgs) {
                        fileArgs.forEach(arg => compilerArgs.push(arg));
                    }

                    return {
                        from_: `${this.getProjectName()}:${this.getCurrentTarget()} (${this.getUid()})`,
                        uri: uri,
                        configuration: {
                            standard: <any>this.cppToolsConfig.cppStandard,
                            includePath: this.cppToolsConfig.includePath,
                            defines: this.cppToolsConfig.defines,
                            forcedInclude: this.cppToolsConfig.forcedInclude,
                            compilerPath: compilerPath || "",
                            compilerArgs: compilerArgs
                        }
                    };
                }
            }));
        });
    }

    canProvideBrowseConfigurationsPerFolder(token?: vscode.CancellationToken | undefined): Thenable<boolean> {
        return new Promise((resolve) => {
            resolve(true);
        });
    }

    provideFolderBrowseConfiguration(uri: vscode.Uri, token?: vscode.CancellationToken | undefined): Thenable<WorkspaceBrowseConfiguration | null> {
        return new Promise((resolve) => {
            const prjRoot = this.GetRootDir().path;
            if (platform.realpathSync(prjRoot) == platform.realpathSync(uri.fsPath)) {
                resolve({
                    browsePath: this.cppToolsConfig.browse?.path || [],
                    compilerPath: this.cppToolsConfig.compilerPath,
                    compilerArgs: this.cppToolsConfig.compilerArgs
                });
            } else {
                resolve(null);
            }
        });
    }

    canProvideBrowseConfiguration(token?: vscode.CancellationToken | undefined): Thenable<boolean> {
        return new Promise((resolve) => {
            resolve(false);
        });
    }

    provideBrowseConfiguration(token?: vscode.CancellationToken | undefined): Thenable<WorkspaceBrowseConfiguration | null> {
        return new Promise((resolve) => {
            resolve(null);
        });
    }

    dispose() {
        // nothing todo
    }
}

export function NewProject(workspaceState: vscode.Memento): AbstractProject {
    return new EIDEProject(workspaceState);
}
