---
phase: 9
title: "Phase 9: 异常交互 — 验证现有实现"
goal: "验证 Phase 9 所有 3 个组件的实现满足成功标准"
wave: 1
---

# Phase 9: 异常交互 — 验证计划

## Objective

Phase 9 已在历史开发中实现。本计划验证现有代码满足 ROADMAP.md 定义的成功标准，不写新代码。

## Success Criteria (from ROADMAP.md)

1. 状态脱节时差异以自然语言呈现，不暴露 JSON 路径等技术术语
2. accept_with_warnings 章节有橙色边框+斜纹背景+「污染隔离」标签
3. 回滚操作通过时间回溯拨盘交互确认，有碎裂淡出动画

## Tasks

### 1. 验证 TimeDial（时间回溯拨盘）

**文件:** `packages/studio/src/components/time-dial.tsx`, `time-dial.test.tsx`

验证：
- 快照列表渲染正确
- 拖拽拨盘交互（pointer events + rotation 计算）
- CONFIRM_THRESHOLD 180° 确认阈值
- 碎裂动画（shattering state + shatter-piece/shatter-pieces CSS class）
- 自然语言提示："时间碎裂中…""正在回滚至选定快照"
- 测试覆盖：10 个测试用例

### 2. 验证 PollutionBadge（污染隔离标签）

**文件:** `packages/studio/src/components/pollution-badge.tsx`, `pollution-badge.test.tsx`

验证：
- level=high/medium 橙色边框 + 斜纹背景（repeating-linear-gradient 45deg）
- 「污染隔离」标签显示
- level=low 灰色样式 + 「已隔离」标签
- contaminationScore 百分比显示
- 测试覆盖：5 个测试用例

### 3. 验证 StateDiffView（状态差异视图）

**文件:** `packages/studio/src/components/state-diff-view.tsx`, `state-diff-view.test.tsx`

验证：
- 自然语言差异描述（naturalLanguage 字段）
- 左右对比布局（当前/新值，红色删除/绿色新增）
- 复选框选中 + 合并功能
- 全选/取消全选
- severity 颜色标签
- 空状态处理
- 测试覆盖：12 个测试用例

### 4. 运行测试确认

运行 `pnpm --filter @cybernovelist/studio test` 中的 Phase 9 相关测试。

## Acceptance

- 全部 3 个验证项通过
- 所有 Phase 9 测试通过（27 个测试用例）
- ROADMAP.md 3 个成功标准全部满足
- 更新 STATE.md 和 ROADMAP.md 标记 Phase 9 完成
