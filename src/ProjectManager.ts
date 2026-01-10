
import * as vscode from 'vscode';
import * as events from 'events';
import * as NodePath from 'path';

import { File } from '../lib/node-utility/File';
import { AbstractProject } from './EIDEProject';
import { ResManager } from './ResManager';
import { GlobalEvent } from './GlobalEvents';
import { CreateOptions, ImportOptions } from './EIDETypeDefine';
import { newMessage, ExceptionToMessage } from './Message';
import { getGlobalState } from './Platform';
import { WorkspaceManager } from './WorkspaceManager';
import { ProjectCreator } from './ProjectCreator';
import { KeilImporter } from './importers/KeilImporter';
import { EclipseImporter } from './importers/EclipseImporter';
import { IarImporter } from './importers/IarImporter';
import { CMakeImporter } from './importers/CMakeImporter';
import {
    project_load_failed,
    continue_text,
    cancel_text,
    invalid_project_path,
    switch_workspace_hint,
    view_str$operation$import_failed
} from './StringTable';
import { doMigration, detectProject } from './EIDEProjectMigration';

export class ProjectManager {

    private static readonly recName = 'sln.record';
    private static readonly RecMaxNum = 50;

    private static _instance: ProjectManager;

    private prjList: AbstractProject[] = [];
    private slnRecord: string[] = [];
    private recFile: File;
    private context: vscode.ExtensionContext;
    private _event: events.EventEmitter;

    private constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this._event = new events.EventEmitter();
        this.recFile = File.fromArray([ResManager.GetInstance().getEideHomeFolder().path, ProjectManager.recName]);
        this.loadRecord();

        // register project hook
        GlobalEvent.on('project.opened', (prj) => this.onProjectOpened(prj));
        GlobalEvent.on('project.closed', (uid) => { if (uid) this.onProjectClosed(uid); });
    }

    public static getInstance(context?: vscode.ExtensionContext): ProjectManager {
        if (!ProjectManager._instance) {
            if (context) {
                ProjectManager._instance = new ProjectManager(context);
            } else {
                throw new Error("ProjectManager not initialized! Call getInstance with context first.");
            }
        }
        return ProjectManager._instance;
    }

    // Events
    public on(event: 'project_list_changed', listener: () => void): void;
    public on(event: 'project.opened', listener: (prj: AbstractProject) => void): void;
    public on(event: 'project.closed', listener: (uid: string) => void): void;
    public on(event: any, listener: (arg?: any) => void): void {
        this._event.on(event, listener);
    }

    public emit(event: any, arg?: any): void {
        this._event.emit(event, arg);
    }

    // Project List Management
    public getProjects(): AbstractProject[] {
        return this.prjList;
    }

    public getProjectByIndex(index: number): AbstractProject | undefined {
        if (index >= 0 && index < this.prjList.length) {
            return this.prjList[index];
        }
        return undefined;
    }

    public getProjectCount(): number {
        return this.prjList.length;
    }

    private registerProject(proj: AbstractProject) {
        this.prjList.push(proj);
        this.addRecord(proj.getWsPath());
        this.emit('project_list_changed');
    }

    // Record Management
    public getRecords(): string[] {
        return Array.from(this.slnRecord);
    }

    public clearAllRecords() {
        this.slnRecord = [];
        this.saveRecord();
    }

    public removeRecord(record: string) {
        const i = this.slnRecord.findIndex(str => { return str === record; });
        if (i !== -1) {
            this.slnRecord.splice(i, 1);
        }
    }

    public saveRecord() {
        if (this.slnRecord.length > ProjectManager.RecMaxNum) {
            this.slnRecord.splice(0, this.slnRecord.length - ProjectManager.RecMaxNum);
        }
        this.recFile.Write(JSON.stringify(this.slnRecord));
    }

    private addRecord(path: string) {
        if (!this.slnRecord.includes(path)) {
            this.slnRecord.push(path);
        }
        this.saveRecord();
    }

    private loadRecord() {
        if (this.recFile.IsFile()) {
            try {
                this.slnRecord = JSON.parse(this.recFile.Read());
            } catch (err) {
                this.slnRecord = [];
                GlobalEvent.emit('msg', ExceptionToMessage(err, 'Hidden'));
            }
        }
    }

    // Lifecycle Methods

    public async LoadWorkspaceProject(workspaceState: vscode.Memento) {
        const wsFolders = vscode.workspace.workspaceFolders;
        if (wsFolders && wsFolders.length > 0) {
            for (const ws of wsFolders) {
                // we only load valid eide project
                if (detectProject(File.from(ws.uri.fsPath))) {
                    const f = File.from(ws.uri.fsPath, AbstractProject.workspaceSuffix);
                    if (f.IsFile()) {
                        await this._OpenProject(f.path, workspaceState);
                    } else { // try to search .code-workspace file
                        const fList = new File(ws.uri.fsPath).GetList([/\.code-workspace$/], File.EXCLUDE_ALL_FILTER);
                        if (fList.length > 0) {
                            await this._OpenProject(fList[0].path, workspaceState);
                        }
                    }
                }
            }
        }
    }

    private async _OpenProject(workspaceFilePath: string, workspaceState: vscode.Memento): Promise<AbstractProject | undefined> {

        const wsFile: File = new File(workspaceFilePath);
        if (!wsFile.IsFile()) {
            GlobalEvent.emit('msg', {
                type: 'Warning',
                contentType: 'string',
                content: invalid_project_path + wsFile.path
            });
            return undefined;
        }

        if (!detectProject(File.from(wsFile.dir))) {
            GlobalEvent.emit('msg', newMessage('Warning', `File not existed, [path]: ${wsFile.dir}`));
            return undefined;
        }

        try {
            await doMigration(File.from(wsFile.dir));
            const prj = AbstractProject.NewProject(workspaceState);
            await prj.Load(wsFile);
            this.registerProject(prj);
            GlobalEvent.emit('project.opened', prj);
            return prj;
        } catch (err) {
            GlobalEvent.emit('msg', newMessage('Warning', project_load_failed));
            GlobalEvent.log_error(err);
            GlobalEvent.emit('globalLog.show');
            return undefined;
        }
    }

    public async OpenProject(workspaceFilePath: string, switchWorkspaceImmediately?: boolean): Promise<AbstractProject | undefined> {

        const wsFolder = new File(NodePath.dirname(workspaceFilePath));

        // check workspace
        if (!detectProject(wsFolder)) { // not found project file, open workspace ?
            const msg = `Not found eide project in this workspace !, Open this workspace directly ?`;
            const selection = await vscode.window.showInformationMessage(msg, continue_text, cancel_text);
            if (selection === continue_text) { WorkspaceManager.getInstance().openWorkspace(new File(workspaceFilePath)); }
            return undefined;
        }

        const prj = await vscode.window.withProgress({
            title: 'Open Project',
            location: vscode.ProgressLocation.Notification,
        }, (progress) => {
            progress.report({ message: `${workspaceFilePath}` });
            return this._OpenProject(workspaceFilePath, getGlobalState());
        });
        if (prj) {
            this.SwitchProject(prj, switchWorkspaceImmediately);
            return prj;
        }

        return undefined;
    }

    public async CreateProject(option: CreateOptions): Promise<AbstractProject | undefined> {
        const prj = await ProjectCreator.CreateProject(option);
        if (prj) {
            this.registerProject(prj);
            this.SwitchProject(prj);
            return prj;
        }
        return undefined;
    }

    public async CreateFromTemplate(option: CreateOptions) {
        await ProjectCreator.CreateFromTemplate(option);
    }

    public ImportProject(option: ImportOptions) {

        const catchErr = (error: any) => {
            const msg = `${view_str$operation$import_failed}: ${(<Error>error).message}`;
            GlobalEvent.emit('msg', newMessage('Warning', msg));
            GlobalEvent.emit('msg', ExceptionToMessage(error, 'Hidden'));
        };

        switch (option.type) {
            case 'mdk':
                KeilImporter.importProject(option).catch(err => catchErr(err));
                break;
            case 'eclipse':
                EclipseImporter.importProject(option).catch(err => catchErr(err));
                break;
            case 'iar':
                IarImporter.importProject(option).catch(err => catchErr(err));
                break;
            case 'cmake':
                CMakeImporter.importProject(option).catch(err => catchErr(err));
                break;
            default:
                break;
        }
    }

    public Close(index: number): string | undefined {

        if (index < 0 || index >= this.prjList.length) {
            GlobalEvent.emit('error', new Error('Project index out of range: ' + index.toString()));
            return;
        }

        const sln = this.prjList[index];

        sln.Close();
        this.prjList.splice(index, 1);
        this.emit('project_list_changed');
        GlobalEvent.emit('project.closed', sln.getUid());

        return sln.getUid();
    }

    public CloseAll() {
        this.prjList.forEach(sln => sln.Close());
        this.prjList = [];
        this.emit('project_list_changed');
    }

    public SaveAll(force?: boolean) {
        this.prjList.forEach(sln => sln.Save(force));
    }

    public async SwitchProject(prj: AbstractProject, immediately?: boolean) {
        if (immediately) {
            WorkspaceManager.getInstance().openWorkspace(prj.GetWorkspaceConfig().GetFile());
        } else {
            const selection = await vscode.window.showInformationMessage(switch_workspace_hint, continue_text, cancel_text);
            if (selection === continue_text) {
                WorkspaceManager.getInstance().openWorkspace(prj.GetWorkspaceConfig().GetFile());
            }
        }
    }

    // Hooks
    private onProjectOpened(prj: AbstractProject) {
        this.emit('project.opened', prj);
    }

    private onProjectClosed(uid: string) {
        this.emit('project.closed', uid);
    }
}
