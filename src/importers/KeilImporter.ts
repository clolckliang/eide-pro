
import * as vscode from 'vscode';
import * as NodePath from 'path';
import * as os from 'os';
import * as ini from 'ini';
import * as yaml from 'yaml';
import { isArray } from 'util';

import { File } from '../../lib/node-utility/File';
import { AbstractProject, VirtualSource, SourceFileOptions, EIDE_FILE_OPTION_VERSION } from '../EIDEProject';
import {
    VirtualFolder,
    ImportOptions,
    ProjectTargetInfo,
    MAPPED_KEYS_IN_TARGET_INFO,
    BuilderOptions,
    FileGroup
} from '../EIDETypeDefine';
import {
    ARMStorageLayout,
    ArmBaseCompileData,
    ArmBaseCompileConfigModel
} from "../EIDEProjectModules";
import { KeilParser, C51Parser, ARMParser, ICommonOptions, KeilARMOption, KeilC51Option, KeilParserResult, KeilRteDependence } from '../KeilXmlParser';
import { ResManager } from '../ResManager';
import { SevenZipper } from '../Compress';
import { GlobalEvent } from '../GlobalEvents';
import { view_str$operation$import_done, continue_text, cancel_text, WARNING, view_str$prompt$unresolved_deps, view_str$prompt$prj_location, view_str$prompt$filesOptionsComment } from '../StringTable';
import { WorkspaceManager } from '../WorkspaceManager';
import { getGlobalState } from '../Platform';
import { copyObject, toArray } from '../utility';
import { newMessage, ExceptionToMessage } from '../Message';
import { ToolchainManager } from '../ToolchainManager';

export class KeilImporter {

    public static async importToConfig(project: AbstractProject, forceProjectFile?: File): Promise<File | undefined> {

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
                    return undefined;
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

        try {
            const mdk_prod = (<any>miscInfo)?.uid || 'C51';
            const isC51 = project.getProjectType() === 'C51' || project.getToolchain().name === 'Keil_C51';

            // Instantiate parser
            let parser: KeilParser<any>;

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

            // Sync Compiler Options (For All Keil Projects)
            {
                const keilOptions = <any>keilTarget.compileOption;
                const toolConfig = <any>prjConfig.config.toolchainConfig;

                if (keilOptions.optionsGroup) {
                    const toolchain = keilOptions.toolchain;
                    const options = keilOptions.optionsGroup[toolchain];

                    if (options) {
                        // merge options
                        for (const groupName in options) {
                            if (!toolConfig[groupName]) toolConfig[groupName] = {};
                            const group = options[groupName];
                            for (const key in group) {
                                toolConfig[groupName][key] = group[key];
                            }
                        }
                    }
                }
            }

            return projectFile;

        } catch (error) {
            vscode.window.showErrorMessage('Refresh Failed: ' + (<Error>error).message);
            return undefined;
        }
    }

    public static async importProject(option: ImportOptions): Promise<void> {

        const keilPrjFile = option.projectFile;
        // Use NewInstance via reflection or import
        // Since KeilParser is imported, we can use it if it has static NewInstance
        const keilParser = KeilParser.NewInstance(option.projectFile, <any>option.mdk_prod);
        const targets = keilParser.ParseData();

        if (targets.length == 0) {
            throw Error(`Not found any target in '${keilPrjFile.path}' !`);
        }

        const nPrjOutDir = <File>option.outDir;

        const baseInfo = AbstractProject.NewProject(getGlobalState()).createBase({
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
                    const newFolder: VirtualFolder = { name: name, files: [], folders: [] };
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
                        const optLi: string[] = [];
                        fopts.includes.forEach(item => {
                            if (keilTarget.type === 'C51') {
                                optLi.push(`INCDIR(${baseInfo.rootFolder.ToRelativePath(item) || item})`);
                            } else {
                                optLi.push(`-I${baseInfo.rootFolder.ToRelativePath(item) || item}`);
                            }
                        });
                        fopts.defines.forEach((item: string) => {
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
            const incs: string[] = KeilImporter.importCmsisHeaders(baseInfo.rootFolder);

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

    private static importCmsisHeaders(rootDir: File): string[] {

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
}
