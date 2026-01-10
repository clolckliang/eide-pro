# EIDEProject.ts 重构计划

## 📊 文件分析

**当前大小**: 4316 行
**主要类**:
1. `CheckError` - 错误类
2. `VirtualSource` - 虚拟源管理
3. `AbstractProject` - 主项目类 (~4000行)

## 🎯 拆分策略

### 模块 1: 文件管理相关
**提取内容**:
- `getFile()`
- `addFile()`
- `removeFile()`
- `addFolder()`
- `removeFolder()`
- 文件树遍历逻辑

**目标文件**: `src/project-managers/FileManager.ts`

### 模块 2: 配置管理相关
**提取内容**:
- `GetConfiguration()`
- 配置加载/保存
- 配置验证

**目标文件**: `src/project-managers/ConfigurationManager.ts`

### 模块 3: IntelliSense 相关
**提取内容**:
- CppTools 集成
- 配置提供者
- 浏览配置

**目标文件**: `src/providers/ProjectIntelliSenseProvider.ts`

### 模块 4: 构建相关
**提取内容**:
- 构建配置
- 环境变量管理
- 工具链配置

**目标文件**: `src/project-managers/BuildManager.ts`

## 📁 新文件结构

```
src/
├── project-managers/
│   ├── AbstractProject.ts          # 主项目类（简化版）
│   ├── FileManager.ts              # 文件管理
│   ├── ConfigurationManager.ts     # 配置管理
│   └── BuildManager.ts              # 构建管理
├── providers/
│   ├── ProjectIntelliSenseProvider.ts  # IntelliSense
│   └── CppConfigProvider.ts            # 已存在
├── models/
│   ├── VirtualSource.ts             # 虚拟源（从 EIDEProject 提取）
│   └── ProjectTreeItem.ts           # 已存在
└── utils/
    └── ErrorHandler.ts              # 已创建
```

## 🔄 迁移步骤

### 阶段 1: 提取 VirtualSource
- [ ] 创建 `src/models/VirtualSource.ts`
- [ ] 移动 VirtualSource 类
- [ ] 更新导入

### 阶段 2: 提取 FileManager
- [ ] 创建 `src/project-managers/FileManager.ts`
- [ ] 提取文件管理方法
- [ ] 添加导入到 AbstractProject

### 阶段 3: 提取 ConfigurationManager
- [ ] 创建 `src/project-managers/ConfigurationManager.ts`
- [ ] 提取配置方法
- [ ] 更新引用

### 阶段 4: 提取 IntelliSenseProvider
- [ ] 创建 `src/providers/ProjectIntelliSenseProvider.ts`
- [ ] 提取 CppTools 相关代码
- [ ] 实现接口

### 阶段 5: 简化 AbstractProject
- [ ] 保留核心逻辑
- [ ] 使用提取的模块
- [ ] 更新所有导入

## ✅ 预期结果

**拆分后**:
- AbstractProject.ts: ~800 行 (从 4000+)
- FileManager.ts: ~600 行
- ConfigurationManager.ts: ~500 行
- BuildManager.ts: ~400 行
- IntelliSenseProvider.ts: ~800 行
- VirtualSource.ts: ~400 行

**优势**:
- ✅ 更易维护
- ✅ 职责清晰
- ✅ 更易测试
- ✅ 更好的代码复用

## 🚀 执行时间估算

- 阶段 1: 30 分钟
- 阶段 2: 1 小时
- 阶段 3: 1 小时
- 阶段 4: 1.5 小时
- 阶段 5: 1 小时

**总计**: 约 5 小时
