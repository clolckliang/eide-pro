import { expect } from 'chai';
import { describe, it, beforeEach } from 'mocha';
import {
    TreeItemType,
    ProjTreeItem,
    TreeItemValue,
    ModifiableDepInfo,
    getTreeItemTypeName
} from '../../models/ProjectTreeItem';
import { File } from '../../../lib/node-utility/File';

describe('ProjectTreeItem Module', () => {

    describe('TreeItemType Enum', () => {
        it('should have correct enum values starting from 0', () => {
            expect(TreeItemType.SOLUTION).to.equal(0);
            expect(TreeItemType.PROJECT).to.equal(1);
            expect(TreeItemType.PACK).to.equal(2);
        });

        it('should have all expected item types', () => {
            expect(TreeItemType.FILE_ITEM).to.exist;
            expect(TreeItemType.FOLDER).to.exist;
            expect(TreeItemType.V_FOLDER).to.exist;
            expect(TreeItemType.SETTINGS).to.exist;
        });
    });

    describe('getTreeItemTypeName', () => {
        it('should return correct string representation', () => {
            expect(getTreeItemTypeName(TreeItemType.SOLUTION)).to.equal('SOLUTION');
            expect(getTreeItemTypeName(TreeItemType.PROJECT)).to.equal('PROJECT');
            expect(getTreeItemTypeName(TreeItemType.FILE_ITEM)).to.equal('FILE_ITEM');
        });
    });

    describe('ModifiableDepInfo', () => {
        it('should create with explicit type', () => {
            const depInfo = new ModifiableDepInfo('INC_GROUP');
            expect(depInfo.type).to.equal('INC_GROUP');
        });

        it('should infer type from key', () => {
            const depInfo = new ModifiableDepInfo('None', 'incList');
            expect(depInfo.type).to.equal('INC_GROUP');
        });

        it('should map defineList to DEFINE_GROUP', () => {
            const depInfo = new ModifiableDepInfo('None', 'defineList');
            expect(depInfo.type).to.equal('DEFINE_GROUP');
        });

        it('should map libList to LIB_GROUP', () => {
            const depInfo = new ModifiableDepInfo('None', 'libList');
            expect(depInfo.type).to.equal('LIB_GROUP');
        });

        it('should default to None for unknown keys', () => {
            const depInfo = new ModifiableDepInfo('None', 'unknownKey');
            expect(depInfo.type).to.equal('None');
        });

        describe('GetItemDepType', () => {
            it('should convert INC_GROUP to INC_ITEM', () => {
                const depInfo = new ModifiableDepInfo('INC_GROUP');
                const itemType = depInfo.GetItemDepType();
                expect(itemType.type).to.equal('INC_ITEM');
            });

            it('should convert DEFINE_GROUP to DEFINE_ITEM', () => {
                const depInfo = new ModifiableDepInfo('DEFINE_GROUP');
                const itemType = depInfo.GetItemDepType();
                expect(itemType.type).to.equal('DEFINE_ITEM');
            });

            it('should convert LIB_GROUP to LIB_ITEM', () => {
                const depInfo = new ModifiableDepInfo('LIB_GROUP');
                const itemType = depInfo.GetItemDepType();
                expect(itemType.type).to.equal('LIB_ITEM');
            });

            it('should keep None as None', () => {
                const depInfo = new ModifiableDepInfo('None');
                const itemType = depInfo.GetItemDepType();
                expect(itemType.type).to.equal('None');
            });
        });
    });

    describe('ProjTreeItem', () => {
        describe('Construction', () => {
            it('should create item with string value', () => {
                const val: TreeItemValue = {
                    value: 'test value',
                    projectIndex: 0
                };
                const item = new ProjTreeItem(TreeItemType.ITEM, val);

                expect(item.label).to.equal('test value');
                expect(item.val).to.deep.equal(val);
                expect(item.type).to.equal(TreeItemType.ITEM);
            });

            it('should create item with File value', () => {
                const file = new File('/test/path/test.c');
                const val: TreeItemValue = {
                    value: file,
                    projectIndex: 0
                };
                const item = new ProjTreeItem(TreeItemType.FILE_ITEM, val);

                expect(item.label).to.equal('test.c');
            });

            it('should create item with key and value', () => {
                const val: TreeItemValue = {
                    key: 'myKey',
                    value: 'myValue',
                    projectIndex: 0
                };
                const item = new ProjTreeItem(TreeItemType.ITEM, val);

                expect(item.label).to.equal('myKey : myValue');
            });

            it('should use keyAlias if provided', () => {
                const val: TreeItemValue = {
                    key: 'actualKey',
                    keyAlias: 'DisplayKey',
                    value: 'myValue',
                    projectIndex: 0
                };
                const item = new ProjTreeItem(TreeItemType.ITEM, val);

                expect(item.label).to.equal('DisplayKey : myValue');
            });

            it('should override label if explicitly provided', () => {
                const val: TreeItemValue = {
                    label: 'Custom Label',
                    value: 'ignored',
                    projectIndex: 0
                };
                const item = new ProjTreeItem(TreeItemType.ITEM, val);

                expect(item.label).to.equal('Custom Label');
            });

            it('should set unique ID for SOLUTION type', () => {
                const val: TreeItemValue = {
                    value: 'test',
                    projectIndex: 0
                };
                const item = new ProjTreeItem(TreeItemType.SOLUTION, val, 'prj-123');

                expect(item.id).to.equal('prj-123');
            });

            it('should set unique ID for root item types', () => {
                const val: TreeItemValue = {
                    value: 'test',
                    projectIndex: 0
                };
                const item = new ProjTreeItem(TreeItemType.PROJECT, val, 'prj-123');

                expect(item.id).to.equal('prj-123:PROJECT');
            });
        });

        describe('Static Methods', () => {
            it('isItem should identify item types correctly', () => {
                expect(ProjTreeItem.isItem(TreeItemType.ITEM)).to.be.true;
                expect(ProjTreeItem.isItem(TreeItemType.FILE_ITEM)).to.be.true;
                expect(ProjTreeItem.isItem(TreeItemType.EXCFILE_ITEM)).to.be.true;
                expect(ProjTreeItem.isItem(TreeItemType.FOLDER)).to.be.false;
                expect(ProjTreeItem.isItem(TreeItemType.GROUP)).to.be.false;
            });

            it('isFileItem should identify file item types correctly', () => {
                expect(ProjTreeItem.isFileItem(TreeItemType.FILE_ITEM)).to.be.true;
                expect(ProjTreeItem.isFileItem(TreeItemType.EXCFILE_ITEM)).to.be.true;
                expect(ProjTreeItem.isFileItem(TreeItemType.V_FILE_ITEM)).to.be.true;
                expect(ProjTreeItem.isFileItem(TreeItemType.OUTPUT_FILE_ITEM)).to.be.true;
                expect(ProjTreeItem.isFileItem(TreeItemType.FOLDER)).to.be.false;
                expect(ProjTreeItem.isFileItem(TreeItemType.GROUP)).to.be.false;
            });

            it('isVirtualFolderItem should identify virtual folder types', () => {
                expect(ProjTreeItem.isVirtualFolderItem(TreeItemType.V_FOLDER)).to.be.true;
                expect(ProjTreeItem.isVirtualFolderItem(TreeItemType.V_FOLDER_ROOT)).to.be.true;
                expect(ProjTreeItem.isVirtualFolderItem(TreeItemType.V_EXCFOLDER)).to.be.true;
                expect(ProjTreeItem.isVirtualFolderItem(TreeItemType.FOLDER)).to.be.false;
                expect(ProjTreeItem.isVirtualFolderItem(TreeItemType.V_FILE_ITEM)).to.be.false;
            });
        });

        describe('Context Value', () => {
            it('should use ModifiableDepInfo type as context', () => {
                const depInfo = new ModifiableDepInfo('INC_GROUP');
                const val: TreeItemValue = {
                    value: 'test',
                    projectIndex: 0,
                    obj: depInfo
                };
                const item = new ProjTreeItem(TreeItemType.ITEM, val);

                expect(item.contextValue).to.equal('INC_GROUP');
            });

            it('should use custom contextVal if provided', () => {
                const val: TreeItemValue = {
                    value: 'test',
                    projectIndex: 0,
                    contextVal: 'CUSTOM_CONTEXT'
                };
                const item = new ProjTreeItem(TreeItemType.ITEM, val);

                expect(item.contextValue).to.equal('CUSTOM_CONTEXT');
            });

            it('should default to TreeItemType name', () => {
                const val: TreeItemValue = {
                    value: 'test',
                    projectIndex: 0
                };
                const item = new ProjTreeItem(TreeItemType.FOLDER, val);

                expect(item.contextValue).to.equal('FOLDER');
            });
        });

        describe('Tooltip', () => {
            it('should use custom tooltip if provided', () => {
                const val: TreeItemValue = {
                    value: 'test',
                    projectIndex: 0,
                    tooltip: 'Custom Tooltip'
                };
                const item = new ProjTreeItem(TreeItemType.ITEM, val);

                expect(item.tooltip).to.equal('Custom Tooltip');
            });

            it('should use file path for File values', () => {
                const file = new File('/test/path/test.c');
                const val: TreeItemValue = {
                    value: file,
                    projectIndex: 0
                };
                const item = new ProjTreeItem(TreeItemType.FILE_ITEM, val);

                expect(item.tooltip).to.include('test');
            });

            it('should use value for item types', () => {
                const val: TreeItemValue = {
                    value: 'test value',
                    projectIndex: 0
                };
                const item = new ProjTreeItem(TreeItemType.ITEM, val);

                expect(item.tooltip).to.equal('test value');
            });

            it('should use TreeItemType name for non-item types', () => {
                const val: TreeItemValue = {
                    value: 'test',
                    projectIndex: 0
                };
                const item = new ProjTreeItem(TreeItemType.FOLDER, val);

                expect(item.tooltip).to.equal('FOLDER');
            });
        });

        describe('Collapsible State', () => {
            it('should be None for item types', () => {
                const val: TreeItemValue = {
                    value: 'test',
                    projectIndex: 0
                };
                const item = new ProjTreeItem(TreeItemType.FILE_ITEM, val);

                expect(item.collapsibleState).to.equal(2); // vscode.TreeItemCollapsibleState.None = 2
            });

            it('should be Collapsed for group types', () => {
                const val: TreeItemValue = {
                    value: 'test',
                    projectIndex: 0
                };
                const item = new ProjTreeItem(TreeItemType.FOLDER, val);

                expect(item.collapsibleState).to.equal(1); // vscode.TreeItemCollapsibleState.Collapsed = 1
            });

            it('should use custom collapsibleState if provided', () => {
                const val: TreeItemValue = {
                    value: 'test',
                    projectIndex: 0,
                    collapsibleState: 0 // Expanded
                };
                const item = new ProjTreeItem(TreeItemType.FOLDER, val);

                expect(item.collapsibleState).to.equal(0);
            });
        });
    });
});
