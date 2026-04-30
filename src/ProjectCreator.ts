
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as NodePath from 'path';

import { File } from '../lib/node-utility/File';
import { AbstractProject } from './EIDEProject';
import { CreateOptions, ProjectConfiguration } from './EIDETypeDefine';
import { GlobalEvent } from './GlobalEvents';
import { newMessage, ExceptionToMessage } from './Message';
import { getGlobalState } from './Platform';
import { ResManager } from './ResManager';
import { SevenZipper } from './Compress';
import { detectProject, doMigration } from './EIDEProjectMigration';
import { WorkspaceManager } from './WorkspaceManager';
import {
    WARNING,
    project_exist_txt,
    project_load_failed,
    view_str$operation$create_prj_done
} from './StringTable';

export class ProjectCreator {

    public static async CreateProject(option: CreateOptions): Promise<AbstractProject | undefined> {

        // check folder
        const dList = option.outDir.GetList(File.EXCLUDE_ALL_FILTER);
        if (dList.findIndex((_folder) => { return _folder.name === option.name; }) !== -1) {
            const item = await vscode.window.showWarningMessage(`${WARNING}: ${project_exist_txt}`, 'Yes', 'No');
            if (item === undefined || item === 'No') {
                return undefined;
            }
        }

        try {
            const prj = AbstractProject.NewProject(getGlobalState());
            await prj.Create(option);
            return prj;
        } catch (err) {
            GlobalEvent.emit('error', err);
            GlobalEvent.emit('msg', newMessage('Warning', project_load_failed));
            return undefined;
        }
    }

    public static async CreateFromTemplate(option: CreateOptions): Promise<File | undefined> {

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

            return targetWorkspaceFile;

        } catch (error) {
            GlobalEvent.emit('msg', newMessage('Warning', `Create project failed !, msg: ${(<Error>error).message}`));
            GlobalEvent.emit('msg', ExceptionToMessage(<Error>error, 'Hidden'));
            return undefined;
        }
    }
}
