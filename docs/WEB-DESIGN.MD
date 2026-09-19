# 前端结构化拆分方案

## 1. 文档目的

本文档用于记录前端大型文件的拆分方案。目标是在不影响现有 GUI 主流程、Agent 辅助流程、草图绘制和草图框选功能的前提下，降低文件复杂度和多人协作冲突。

本次工作的原则是：

```text
移动代码，不重写业务
保留入口，不破坏调用方
先抽纯函数，再抽 Hook，最后搬组件
每完成一个模块立即验证
```

## 2. 当前主要问题

当前前端已经完成初步模块化，但仍有几个大型文件同时承担状态、业务逻辑、事件处理和界面渲染：

| 文件 | 当前问题 |
|---|---|
| `apps/studio-web/src/features/stages/geometry/canvas/ParametricSketchCanvas.tsx` | 同时处理画布渲染、指针事件、绘制、拖拽、框选和吸附，约 2660 行 |
| `apps/studio-web/src/features/stages/geometry/GeometryStage.tsx` | 同时处理草图、几何配方、算子、语义面、扫掠路径和阶段布局，约 929 行 |
| `apps/studio-web/src/features/stages/material/MaterialStage.tsx` | 同时处理材料要求、毛坯、验证样本和绑定，约 724 行 |
| `apps/studio-web/src/features/stages/rules/RulesStage.tsx` | 同时处理规则列表、规则编辑、参数生成和参数值处理，约 645 行 |
| `apps/studio-web/src/types.ts` | 集中存放几何、草图、规则、材料、参数和工作流类型，约 687 行 |

## 3. 总体拆分顺序

```text
第一阶段：ParametricSketchCanvas.tsx
第二阶段：GeometryStage.tsx
第三阶段：MaterialStage.tsx
第四阶段：RulesStage.tsx
第五阶段：types.ts
第六阶段：测试、文档和协作边界整理
```

优先拆分几何画布，因为它是当前最大的文件，也是多人协作冲突最集中的位置。

## 4. 第一阶段：拆分 ParametricSketchCanvas

目标文件：

`apps/studio-web/src/features/stages/geometry/canvas/ParametricSketchCanvas.tsx`

### 4.1 目标目录

```text
canvas/
├── ParametricSketchCanvas.tsx
├── canvasTypes.ts
├── canvasGeometry.ts
├── useSketchPointerHandlers.ts
├── useSketchSelection.ts
├── useSketchDrag.ts
├── useSketchDrawing.ts
├── SketchEntityLayer.tsx
├── SketchPreviewLayer.tsx
├── SketchSelectionOverlay.tsx
└── index.ts
```

### 4.2 文件职责

#### `ParametricSketchCanvas.tsx`

保留为画布入口，负责：

- 接收外部 Props。
- 组合画布相关 Hook。
- 组合各个渲染层。
- 向 `GeometryStage` 暴露原有回调。

外部使用方式不变：

```tsx
<ParametricSketchCanvas
  draft={draft}
  onChange={onChange}
  ...
/>
```

#### `canvasTypes.ts`

存放画布内部类型：

- `ViewportState`
- `PointerMode`
- `DragState`
- `BoxSelectionState`
- `SnapCandidate`
- `PreviewState`

只放类型，不放业务逻辑。

#### `canvasGeometry.ts`

存放纯坐标和几何计算：

- 屏幕坐标与世界坐标转换。
- 视口缩放和视口平移。
- 框选范围计算。
- 点到线、点到圆弧的距离计算。
- 画布边界限制。

#### `useSketchPointerHandlers.ts`

处理：

- `pointerdown`。
- `pointermove`。
- `pointerup`。
- `pointercancel`。
- `wheel`。
- `Escape` 取消操作。

该 Hook 只识别用户操作，不负责 JSX 渲染。

#### `useSketchSelection.ts`

处理：

- 单选。
- 多选。
- 框选。
- 清除选择。
- 选中实体同步。
- 选中控制点同步。

必须保留现有草图框选行为和选中数据格式。

#### `useSketchDrag.ts`

处理：

- 拖动实体。
- 拖动控制点。
- 拖动圆心。
- 拖动圆弧端点。
- 正交约束。
- 拖动后的自动连接。
- 拖动取消和回滚。

#### `useSketchDrawing.ts`

处理：

- 画线。
- 连续折线。
- 画圆。
- 画圆弧。
- 绘制多边形。
- 绘制中的预览实体。
- 绘制完成后的实体提交。

#### `SketchEntityLayer.tsx`

只绘制已经存在的草图实体：

- 线段。
- 圆。
- 圆弧。
- 多边形。
- 辅助线。
- 约束标记。

#### `SketchPreviewLayer.tsx`

只绘制临时内容：

- 正在绘制的线。
- 正在拖拽的实体。
- 吸附预览。
- 自动连接预览。
- 鼠标辅助线。
- 绘制光标。

#### `SketchSelectionOverlay.tsx`

只绘制：

- 框选矩形。
- 选中高亮。
- 控制点高亮。
- 拖拽边界。
- 选中状态提示。

### 4.3 执行顺序

1. 先抽离坐标转换、视口计算和框选计算等纯函数。
2. 再抽离 `useSketchSelection`。
3. 再抽离 `useSketchDrag`。
4. 再抽离 `useSketchDrawing`。
5. 再抽离 `useSketchPointerHandlers`。
6. 最后拆分实体层、预览层和框选层 JSX。

不在第一步改变 React 状态来源，也不在第一步修改外部 Props。

## 5. 第二阶段：拆分 GeometryStage

目标文件：

`apps/studio-web/src/features/stages/geometry/GeometryStage.tsx`

### 5.1 目标目录

```text
geometry/
├── GeometryStage.tsx
├── logic/
│   ├── geometryStageLogic.ts
│   ├── useGeometryStageState.ts
│   ├── useSketchModeFlow.ts
│   └── geometryRecipeOperations.ts
├── panels/
│   └── workspace/
│       ├── GeometryAuthoringPanel.tsx
│       ├── GeometryRecipePanel.tsx
│       ├── SketchModePanel.tsx
│       ├── SketchWorkspaceToolbar.tsx
│       ├── SketchWorkspaceStatusBar.tsx
│       └── SweepPathDialog.tsx
└── canvas/
```

### 5.2 文件职责

#### `useGeometryStageState.ts`

负责：

- 当前草图状态。
- 当前几何配方。
- 当前选中实体。
- 当前编辑模式。
- 当前冲突状态。
- 当前远程 revision。

#### `useSketchModeFlow.ts`

负责：

- 进入和退出草图模式。
- 草图采集方式切换。
- 轮廓模式切换。
- 草图确认。
- 草图取消。

#### `geometryRecipeOperations.ts`

存放纯业务操作：

- 新增算子。
- 修改算子。
- 删除算子。
- 新增语义面。
- 修改语义面。
- 更新算子参数。

#### `SweepPathDialog.tsx`

将扫掠路径对话框从 `GeometryStage.tsx` 中独立出来，由扫掠相关功能负责人单独维护。

### 5.3 约束

- 不修改几何算子名称。
- 不修改几何配方数据结构。
- 不改变 GUI 与 Agent 的 revision 同步。
- 不改变草图冲突处理流程。

## 6. 第三阶段：拆分 MaterialStage

目标文件：

`apps/studio-web/src/features/stages/material/MaterialStage.tsx`

### 6.1 目标目录

```text
material/
├── MaterialStage.tsx
├── logic/
│   └── materialStageLogic.ts
├── panels/
│   ├── MaterialRequirementPanel.tsx
│   ├── MaterialBlankPanel.tsx
│   ├── MaterialValidationPanel.tsx
│   └── MaterialBindingPanel.tsx
└── index.ts
```

### 6.2 拆分内容

- 材料要求编辑。
- 毛坯参数编辑。
- 材料验证样本。
- 材料搜索和绑定。
- 厚度范围处理。
- 材料 CSV 或文本解析。

`MaterialStage.tsx` 最终只负责阶段布局和数据组合。

## 7. 第四阶段：拆分 RulesStage

目标文件：

`apps/studio-web/src/features/stages/rules/RulesStage.tsx`

已有的 `RuleParameterPanel.tsx` 继续复用，不重复创建同类组件。

### 7.1 目标目录

```text
rules/
├── RulesStage.tsx
├── logic/
│   ├── ruleDraftOperations.ts
│   ├── ruleParameterOperations.ts
│   └── ruleValueParsing.ts
├── panels/
│   ├── RuleListPanel.tsx
│   ├── RuleEditorPanel.tsx
│   ├── RuleArgumentPanel.tsx
│   └── RuleParameterPanel.tsx
└── index.ts
```

### 7.2 文件职责

#### `ruleDraftOperations.ts`

负责：

- 新增规则。
- 删除规则。
- 修改规则。
- 生成规则 ID。
- 生成参数 ID。

#### `ruleValueParsing.ts`

负责：

- 字符串转数字。
- 字符串转布尔值。
- 参数值标准化。
- 参数默认值处理。

#### `RuleListPanel.tsx`

负责规则列表、规则选择、规则新增和规则删除。

#### `RuleEditorPanel.tsx`

负责规则基本信息、特征类型、顶点或面选择以及轮廓尺寸。

## 8. 第五阶段：拆分 types.ts

当前不直接删除或重命名：

`apps/studio-web/src/types.ts`

原因是全项目可能存在大量：

```tsx
import type { Draft } from "./types";
```

### 8.1 目标目录

```text
apps/studio-web/src/contracts/
├── geometry.ts
├── sketch.ts
├── rules.ts
├── material.ts
├── parameters.ts
├── draft.ts
├── workflow.ts
└── index.ts
```

### 8.2 兼容方式

保留 `src/types.ts` 作为兼容出口：

```ts
export * from "./contracts/geometry";
export * from "./contracts/sketch";
export * from "./contracts/rules";
export * from "./contracts/material";
export * from "./contracts/parameters";
export * from "./contracts/draft";
export * from "./contracts/workflow";
```

这样可以先完成类型内部归类，再逐步修改业务模块的导入路径，避免一次性造成大量冲突。

## 9. 不变更的内容

拆分期间必须保持以下内容不变：

1. API 输入输出。
2. `Draft` 数据结构。
3. 草图实体结构。
4. 几何算子名称。
5. 参数 ID。
6. GUI 与 Agent 的同步协议。
7. 现有中文文案。
8. 保存、删除和回滚流程。
9. 草图绘制行为。
10. 草图框选行为。
11. Agent 工具输入输出。

## 10. 验证方式

每完成一个独立拆分模块，执行：

```powershell
cd apps/studio-web
npm run test
npm run build
```

重点回归：

- 草图绘制。
- 草图框选。
- 实体拖拽。
- 吸附。
- 约束编辑。
- 扫掠路径。
- 几何算子编辑。
- 规则新增、编辑和删除。
- 材料绑定。
- GUI 与 Agent revision 同步。

如果某一步失败，只回退当前拆分步骤，不继续进行下一阶段。

## 11. 完成后的结构

```text
src/
├── contracts/
├── features/
│   ├── stages/
│   │   ├── geometry/
│   │   │   ├── canvas/
│   │   │   ├── hooks/
│   │   │   ├── logic/
│   │   │   └── panels/
│   │   ├── material/
│   │   │   ├── logic/
│   │   │   └── panels/
│   │   └── rules/
│   │       ├── logic/
│   │       └── panels/
│   └── ...
├── components/
├── api.ts
├── types.ts
└── App.tsx
```

最终数据和组件关系：

```text
App.tsx
  → 阶段组件
    → 业务 Hook
      → 纯业务函数
        → 子面板
          → UI 组件
```

## 12. 推荐执行顺序

```text
ParametricSketchCanvas
→ GeometryStage
→ MaterialStage
→ RulesStage
→ types.ts
→ 测试和文档整理
```

本方案的核心是：保留原有入口和调用方式，只逐步移动内部职责，优先保证 GUI 主线、草图功能和 Agent 辅助流程不受影响。
