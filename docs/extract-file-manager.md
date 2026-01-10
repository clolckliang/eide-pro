# FileManager 提取指南

## 目标

从 `EIDEProject.ts` (AbstractProject 类) 提取文件管理逻辑到独立模块 `src/project-managers/FileManager.ts`

## 提取内容

### 需要提取的方法 (约 600 行)

1. **文件操作**:
   - `getFile(vpath: string)` - 获取虚拟文件
   - `addFile(vfolder_path, fspath)` - 添加文件
   - `addFiles(folder_path, pathList[])` - 批量添加
   - `removeFile(vpath)` - 删除文件

2. **文件夹操作**:
   - `getFolder(vpath?)` - 获取虚拟文件夹
   - `addFolder(name, parent_path?)` - 添加文件夹
   - `removeFolder(path)` - 删除文件夹
   - `renameFolder(vpath, newName)` - 重命名
   - `isFolder(path)` - 检查是否为文件夹

3. **遍历操作**:
   - `traverse(func)` - 遍历文件树
   - `getFileGroups()` - 获取文件组

4. **辅助方法**:
   - `getFolderByName(vFolder, name)` - 按名查找
   - `getRoot()` - 获取根目录
   - `isExcluded(path)` - 检查是否排除

## 实现步骤

### 步骤 1: 创建新文件

```bash
mkdir -p src/project-managers
touch src/project-managers/FileManager.ts
```

### 步骤 2: 定义 FileManager 类框架

```typescript
/*
    MIT License
    Copyright (c) 2019 github0null
*/

import * as NodePath from 'path';
import { File } from '../../lib/node-utility/File';
import { AbstractProject } from '../EIDEProject';
import {
    FileGroup, ProjectFileGroup,
    VirtualFolder, VirtualFile
} from '../EIDETypeDefine';

/**
 * FileManager handles virtual file system operations
 * Manages virtual folders and files for EIDE projects
 */
export class FileManager {

    private project: AbstractProject;

    constructor(project: AbstractProject) {
        this.project = project;
    }

    // 文件操作方法
    getFile(vpath: string): VirtualFile | undefined {
        // 从 EIDEProject.ts 提取实现
    }

    addFile(vfolder_path: string, fspath: string): VirtualFile | undefined {
        // 从 EIDEProject.ts 提取实现
    }

    // ... 其他方法
}
```

### 步骤 3: 从 AbstractProject 提取方法

在 `EIDEProject.ts` 中，找到以下方法并移动到 `FileManager.ts`:

1. 找到方法定义（行 228-239 附近）
2. 复制方法实现到 FileManager
3. 在 FileManager 中，将 `this.project` 替换为 `this.project`
4. 测试编译

### 步骤 4: 更新 AbstractProject

```typescript
// 在 EIDEProject.ts 中
import { FileManager } from './project-managers/FileManager';

export class AbstractProject {
    private fileManager: FileManager;

    constructor() {
        // ...
        this.fileManager = new FileManager(this);
    }

    // 代理方法
    getFile(vpath: string): VirtualFile | undefined {
        return this.fileManager.getFile(vpath);
    }

    // ... 其他代理方法
}
```

### 步骤 5: 测试

```bash
npm run compile
npm test
```

## 注意事项

1. **保持向后兼容**: 使用代理方法保持 API 不变
2. **类型安全**: 确保所有类型正确导入
3. **事件处理**: VirtualSource 的事件系统需要保留
4. **路径处理**: 虚拟路径和实际路径的转换
5. **测试**: 每个方法都要测试

## 预期结果

- EIDEProject.ts: ~4016 → ~3416 行 (-600)
- FileManager.ts: ~600 行 (新建)
- 代码组织改善
- 更易维护和测试

## 预计时间

- 提取代码: 30 分钟
- 更新导入: 15 分钟
- 测试: 15 分钟
- 总计: 1 小时
