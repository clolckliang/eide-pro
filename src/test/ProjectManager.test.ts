import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import * as sinon from 'sinon';
import { ProjectManager } from '../ProjectManager';

// Mock AbstractProject for testing
class MockProject {
    private uid: string;
    private name: string;

    constructor(uid: string, name: string = 'Test Project') {
        this.uid = uid;
        this.name = name;
    }

    getUid(): string {
        return this.uid;
    }

    getName(): string {
        return this.name;
    }

    dispose(): void {
        // Mock dispose
    }
}

describe('ProjectManager', () => {
    let sandbox: sinon.SinonSandbox;
    let manager: ProjectManager;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        // Get instance (note: singleton means state persists)
        manager = ProjectManager.getInstance();
        // Clear projects for clean state
        manager['prjList'] = [];
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('Singleton Pattern', () => {
        it('should return same instance', () => {
            const instance1 = ProjectManager.getInstance();
            const instance2 = ProjectManager.getInstance();

            expect(instance1).to.equal(instance2);
        });

        it('should maintain state across getInstance calls', () => {
            const manager1 = ProjectManager.getInstance();
            const mockProject = new MockProject('test-uid-1') as any;

            // Directly add to internal list
            manager1['prjList'].push(mockProject);

            const manager2 = ProjectManager.getInstance();
            expect(manager2.getProjectCount()).to.equal(1);
        });
    });

    describe('Project List Management', () => {
        it('should start with zero projects', () => {
            expect(manager.getProjectCount()).to.equal(0);
        });

        it('should get project count correctly', () => {
            const mock1 = new MockProject('uid-1') as any;
            const mock2 = new MockProject('uid-2') as any;

            manager['prjList'].push(mock1, mock2);

            expect(manager.getProjectCount()).to.equal(2);
        });

        it('should get all projects', () => {
            const mock1 = new MockProject('uid-1') as any;
            const mock2 = new MockProject('uid-2') as any;

            manager['prjList'].push(mock1, mock2);

            const projects = manager.getProjects();
            expect(projects).to.have.lengthOf(2);
            expect(projects[0].getUid()).to.equal('uid-1');
            expect(projects[1].getUid()).to.equal('uid-2');
        });

        it('should get project by index', () => {
            const mock1 = new MockProject('uid-1', 'Project 1') as any;
            const mock2 = new MockProject('uid-2', 'Project 2') as any;

            manager['prjList'].push(mock1, mock2);

            const project = manager.getProjectByIndex(1);
            expect(project).to.not.be.undefined;
            expect(project?.getUid()).to.equal('uid-2');
        });

        it('should return undefined for invalid index', () => {
            const mock = new MockProject('uid-1') as any;
            manager['prjList'].push(mock);

            expect(manager.getProjectByIndex(-1)).to.be.undefined;
            expect(manager.getProjectByIndex(10)).to.be.undefined;
        });
    });

    describe('Record Management (Public API)', () => {
        beforeEach(() => {
            // Clear records
            manager['slnRecord'] = [];
        });

        it('should get empty records initially', () => {
            const records = manager.getRecords();
            expect(records).to.be.an('array').that.is.empty;
        });

        it('should clear all records', () => {
            manager['slnRecord'] = ['path1', 'path2'];

            manager.clearAllRecords();

            const records = manager.getRecords();
            expect(records).to.be.empty;
        });

        it('should remove specific record', () => {
            manager['slnRecord'] = ['path1', 'path2', 'path3'];

            manager.removeRecord('path2');

            const records = manager.getRecords();
            expect(records).to.deep.equal(['path1', 'path3']);
        });

        it('should handle removing non-existent record', () => {
            manager['slnRecord'] = ['path1', 'path2'];

            manager.removeRecord('non-existent');

            const records = manager.getRecords();
            expect(records).to.deep.equal(['path1', 'path2']);
        });
    });

    describe('Project Lifecycle', () => {
        it('should close project by index', () => {
            const mock1 = new MockProject('uid-1') as any;
            const mock2 = new MockProject('uid-2') as any;

            manager['prjList'].push(mock1, mock2);

            const result = manager.Close(0);

            expect(result).to.equal('uid-1');
            expect(manager.getProjectCount()).to.equal(1);
            expect(manager.getProjects()[0].getUid()).to.equal('uid-2');
        });

        it('should return undefined when closing invalid index', () => {
            const mock = new MockProject('uid-1') as any;
            manager['prjList'].push(mock);

            const result = manager.Close(10);

            expect(result).to.be.undefined;
            expect(manager.getProjectCount()).to.equal(1);
        });
    });

    describe('Event Emission', () => {
        it('should emit project_list_changed event', (done) => {
            manager.on('project_list_changed', () => {
                done();
            });

            manager.emit('project_list_changed');
        });

        it('should emit project.opened event', (done) => {
            const mock = new MockProject('test-uid') as any;

            manager.on('project.opened', (prj) => {
                expect(prj.getUid()).to.equal('test-uid');
                done();
            });

            manager.emit('project.opened', mock);
        });

        it('should emit project.closed event', (done) => {
            manager.on('project.closed', (uid) => {
                expect(uid).to.equal('test-uid');
                done();
            });

            manager.emit('project.closed', 'test-uid');
        });
    });
});
