import { GENRE_WRITER_STYLE_MAP } from '../agents/genre-guidance';
import type { WriteDraftInput, WriteNextChapterInput } from './types';
import type { ChapterPlan } from '../agents/chapter-planner';

// ── Prompt Builders ─────────────────────────────────────────────

export function buildDraftPrompt(input: WriteDraftInput): string {
  return `你是一位专业的网络小说作家。请根据以下信息撰写章节内容。

## 基本信息
- **章节**: 第 ${input.chapterNumber} 章 — ${input.title}
- **题材**: ${input.genre}
- **场景描述**: ${input.sceneDescription}
${input.previousChapterContent ? `\n## 上一章内容参考\n${input.previousChapterContent.substring(0, 500)}` : ''}
${(input as WriteDraftInput & { bookContext?: string }).bookContext ? `\n## 书籍上下文\n${(input as WriteDraftInput & { bookContext?: string }).bookContext}` : ''}

## 要求
1. 保持情节连贯性
2. 角色对话自然生动
3. 场景描写具体有画面感
4. 注意段落节奏，张弛有度
5. 保持题材风格统一

请直接输出正文内容。`;
}

/**
 * ChapterExecutor 的 generateScene 回调使用的 prompt 构建方法。
 */
export function buildAgentDraftPrompt(
  input: WriteNextChapterInput,
  plan: ChapterPlan,
  contextText: string,
  brief: string,
): string {
  const genreStyle = GENRE_WRITER_STYLE_MAP[input.genre] ?? '场景描写具体有画面感，对话自然生动';

  const characters = Array.isArray(plan.characters) ? plan.characters : [];
  const keyEvents = Array.isArray(plan.keyEvents) ? plan.keyEvents : [];
  const hooks = Array.isArray(plan.hooks) ? plan.hooks : [];
  const worldRules = Array.isArray(plan.worldRules) ? plan.worldRules : [];
  const sceneBreakdown = Array.isArray(plan.sceneBreakdown) ? plan.sceneBreakdown : [];
  const hookActions = Array.isArray(plan.hookActions) ? plan.hookActions : [];

  let sceneInstructions = '';
  if (sceneBreakdown.length > 0) {
    sceneInstructions = `
### 场景分解（按此结构写作，每个场景必须写到指定字数）
${sceneBreakdown
  .map(
    (s, i) => `**场景${i + 1}：${s.title}**（约${s.wordCount}字）
  - 内容：${s.description}
  - 出场：${Array.isArray(s.characters) ? s.characters.join('、') || '无特定角色' : '无特定角色'}
  - 调性：${s.mood}`,
  )
  .join('\n\n')}`;
  }

  let hookInstructions = '';
  if (hookActions.length > 0) {
    const actionLabels: Record<string, string> = {
      plant: '埋设',
      advance: '推进',
      payoff: '回收',
    };
    hookInstructions = `
### 伏笔动作（必须执行）
${hookActions.map((h) => `- [${actionLabels[h.action] ?? h.action}] ${h.description}`).join('\n')}`;
  }

  return `你是一位资深网络小说作家。请根据以下完整信息撰写章节正文。

## 上下文卡片
${contextText}

## 作品简介
${brief}

## 章节计划
- **章节**: 第 ${input.chapterNumber} 章 — ${plan.title}
- **本章意图**: ${plan.intention}
- **目标字数**: ${plan.wordCountTarget} 字（必须达到）
- **出场角色（仅限以下角色，禁止引入任何未列出的角色）**: ${characters.join('、') || '无'}
- **关键事件**:
${keyEvents.map((e) => `  - ${e}`).join('\n') || '  无'}
${hooks.length > 0 ? `- **伏笔（须自然融入情节，不可生硬点明）**：\n${hooks.map((h) => `  - [${h.priority}] ${h.description}`).join('\n')}` : ''}
${worldRules.length > 0 ? `- **世界观设定（正文须严格遵循，不可违反任何规则）**：\n${worldRules.map((r) => `  - ${r}`).join('\n')}` : ''}
- **情感节拍**: ${plan.emotionalBeat}
- **场景过渡**: ${plan.sceneTransition}
${plan.openingHook ? `- **开篇钩子**: ${plan.openingHook}` : ''}
${plan.closingHook ? `- **结尾悬念**: ${plan.closingHook}` : ''}
${plan.characterGrowthBeat ? `- **主角成长点**: ${plan.characterGrowthBeat}` : ''}
${plan.pacingTag ? `- **叙事节奏**: ${plan.pacingTag}` : ''}
${sceneInstructions}
${hookInstructions}

## 用户意图
${input.userIntent}

## 写作要求

### 硬性约束
1. **字数要求**：正文必须达到 ${plan.wordCountTarget} 字。如果内容不足，请增加场景细节、角色心理活动、对话交锋、环境描写等，而非空泛概括
2. **角色约束**：只允许使用"出场角色"列表中的角色。如需路人/龙套，用"小二""士兵"等泛称，不可为其取具名
3. **设定约束**：严格遵守世界观设定中的每一条规则。如有金手指/特殊能力，必须按规则描写其运作方式，不可自由发挥
4. **情节约束**：按照关键事件推进情节，不可跳过或替换
5. **场景约束**：如果上方有"场景分解"，必须按场景顺序写作，每个场景写到指定字数后再进入下一个
6. **伏笔约束**：如果上方有"伏笔动作"，必须在本章正文中执行，但须自然融入，不可生硬点明

### 文风要求
${genreStyle}

### 质量要求
1. 场景描写须有画面感——用感官细节（视觉、听觉、触觉、嗅觉）构建沉浸感
2. 角色对话须符合其身份和性格——不同角色的说话方式应有区分度
3. 叙事节奏张弛有度——紧张场景用短句和动作描写，舒缓场景用长句和心理描写
4. 避免"总结式叙述"——不要用"经过一番努力""在接下来的日子里"等概括，而是写具体场景
5. 开篇须有钩子——用悬念、冲突或画面直接抓住读者，不要缓慢铺陈

请直接输出正文内容，不要输出章节标题或其他格式标记。`;
}
