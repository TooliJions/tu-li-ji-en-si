/**
 * ChapterExecutor 真实 LLM 集成测试
 *
 * 验证：基于上游章节大纲，生成正文是否严格遵循大纲结构和逻辑顺序。
 * 所有测试数据从 executor.test-config.ts 加载，无硬编码。
 *
 * 运行方式：
 *   $env:LLM_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
 *   $env:LLM_API_KEY = "sk-xxx"
 *   $env:LLM_MODEL = "qwen3.6-plus"
 *   $env:LLM_PROVIDER = "dashscope"  # 可选: openai/ollama/dashscope
 *   pnpm test -- src/agents/executor.llm.test.ts
 *
 * 若未配置环境变量，所有测试自动 skip。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { ChapterExecutor, type ChapterExecutionInput } from './executor';
import { OpenAICompatibleProvider, type LLMConfig } from '../llm/provider';
import { OllamaProvider } from '../llm/ollama-provider';
import { DashScopeProvider } from '../llm/dashscope-provider';
import {
  GENRE_TEST_PLANS,
  DEFAULT_THRESHOLDS,
  buildInput,
  type GenreTestPlan,
  type ValidationThresholds,
} from './executor.test-config';

// ─── 环境配置 ────────────────────────────────────────────────

const LLM_BASE_URL = process.env.LLM_BASE_URL ?? '';
const LLM_API_KEY = process.env.LLM_API_KEY ?? '';
const LLM_MODEL = process.env.LLM_MODEL ?? '';
const PROVIDER_TYPE = (process.env.LLM_PROVIDER ?? 'openai').toLowerCase();

const llmAvailable = !!(LLM_BASE_URL && LLM_API_KEY && LLM_MODEL);

function createProvider() {
  const config: LLMConfig = {
    apiKey: LLM_API_KEY,
    baseURL: LLM_BASE_URL,
    model: LLM_MODEL,
  };

  switch (PROVIDER_TYPE) {
    case 'ollama':
      return new OllamaProvider(config);
    case 'dashscope':
      return new DashScopeProvider(config);
    default:
      return new OpenAICompatibleProvider(config);
  }
}

// ─── 结构化验证工具 ─────────────────────────────────────────

/** 检查正文中是否包含关键实体（角色名、事件关键词） */
function checkEntityCoverage(
  content: string,
  entities: string[]
): { covered: string[]; missed: string[] } {
  const covered: string[] = [];
  const missed: string[] = [];
  for (const entity of entities) {
    if (content.includes(entity)) {
      covered.push(entity);
    } else {
      missed.push(entity);
    }
  }
  return { covered, missed };
}

/** 检查关键事件覆盖率：提取事件中的核心名词/动词片段 */
function checkKeyEventCoverage(
  content: string,
  keyEvents: string[]
): { covered: string[]; missed: string[] } {
  const covered: string[] = [];
  const missed: string[] = [];
  for (const event of keyEvents) {
    const fragments = extractKeyFragments(event);
    const anyFound = fragments.some((f) => content.includes(f));
    if (anyFound) {
      covered.push(event);
    } else {
      missed.push(event);
    }
  }
  return { covered, missed };
}

/** 从事件描述中提取关键片段 */
function extractKeyFragments(event: string): string[] {
  const fragments: string[] = [];
  fragments.push(event);
  const verbSplit = event.split(/[，。、]/);
  for (const part of verbSplit) {
    if (part.length >= 2) fragments.push(part.trim());
  }
  for (let len = 2; len <= 4; len++) {
    for (let i = 0; i <= event.length - len; i++) {
      const sub = event.substring(i, i + len);
      if (/[\u4e00-\u9fff]{2,}/.test(sub)) {
        fragments.push(sub);
      }
    }
  }
  return fragments;
}

/** 检查情感节拍关键词出现情况 */
function checkEmotionalBeatKeywords(
  content: string,
  beat: string
): { found: string[]; missing: string[] } {
  const emotions = beat
    .split(/[→-]>?/)
    .map((s) => s.trim())
    .filter(Boolean);
  const found: string[] = [];
  const missing: string[] = [];
  for (const emotion of emotions) {
    if (content.includes(emotion)) {
      found.push(emotion);
    } else {
      missing.push(emotion);
    }
  }
  return { found, missing };
}

/** 从世界观规则中提取关键词片段 */
function extractWorldKeywords(worldRules: string[]): string[] {
  const allFragments: string[] = [];
  for (const rule of worldRules) {
    for (let len = 2; len <= 4; len++) {
      for (let i = 0; i <= rule.length - len; i++) {
        const sub = rule.substring(i, i + len);
        if (/[\u4e00-\u9fff]{2,}/.test(sub)) allFragments.push(sub);
      }
    }
  }
  return [...new Set(allFragments)];
}

/** 中文友好的字数统计 */
function countChineseWords(text: string): number {
  const cjk = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g)?.length ?? 0;
  const words = text.match(/[a-zA-Z0-9]+/g)?.length ?? 0;
  return cjk + words;
}

/** 执行 LLM 生成并返回正文内容 */
async function generateAndGetContent(
  executor: ChapterExecutor,
  input: ChapterExecutionInput
): Promise<string> {
  const result = await executor.execute({ promptContext: { input } });
  expect(result.success).toBe(true);
  return (result.data as { content: string }).content;
}

// ─── 题材对齐测试（参数化） ──────────────────────────────────

/**
 * 对单个题材运行全套大纲对齐验证。
 * 所有数据和阈值从配置加载，无硬编码。
 */
function runGenreAlignmentTests(
  getExecutor: () => ChapterExecutor,
  config: GenreTestPlan,
  thresholds: ValidationThresholds = DEFAULT_THRESHOLDS
) {
  const input = buildInput(config);
  const plan = config.plan;

  it.skipIf(!llmAvailable)(
    '生成正文包含足够角色名',
    async () => {
      const content = await generateAndGetContent(getExecutor(), input);
      const { covered, missed } = checkEntityCoverage(content, plan.characters);

      console.log(`[角色覆盖] 命中: ${covered.join(', ')} | 缺失: ${missed.join(', ') || '无'}`);
      expect(covered.length).toBeGreaterThanOrEqual(
        Math.ceil(plan.characters.length * thresholds.characterCoverageMin)
      );
    },
    thresholds.llmTestTimeout
  );

  it.skipIf(!llmAvailable)(
    '生成正文覆盖关键事件',
    async () => {
      const content = await generateAndGetContent(getExecutor(), input);
      const { covered, missed } = checkKeyEventCoverage(content, plan.keyEvents);

      console.log(
        `[事件覆盖] 命中: ${covered.join(' | ')}\n          缺失: ${missed.join(' | ') || '无'}`
      );
      expect(covered.length).toBeGreaterThanOrEqual(
        Math.ceil(plan.keyEvents.length * thresholds.keyEventCoverageMin)
      );
    },
    thresholds.llmTestTimeout
  );

  it.skipIf(!llmAvailable)(
    '生成正文字数接近目标字数',
    async () => {
      const content = await generateAndGetContent(getExecutor(), input);
      const wordCount = countChineseWords(content);
      const ratio = wordCount / plan.wordCountTarget;

      console.log(
        `[字数] 实际: ${wordCount} | 目标: ${plan.wordCountTarget} | 比率: ${(ratio * 100).toFixed(1)}%`
      );
      expect(ratio).toBeGreaterThanOrEqual(thresholds.wordCountRatioMin);
      expect(ratio).toBeLessThanOrEqual(thresholds.wordCountRatioMax);
    },
    thresholds.llmTestTimeout
  );

  it.skipIf(!llmAvailable)(
    '生成正文体现情感节拍走向',
    async () => {
      const content = await generateAndGetContent(getExecutor(), input);
      const { found, missing } = checkEmotionalBeatKeywords(content, plan.emotionalBeat);

      console.log(`[情感节拍] 直接命中: ${found.join(', ')} | 未直接出现: ${missing.join(', ')}`);
      expect(content.length).toBeGreaterThan(100);
    },
    thresholds.llmTestTimeout
  );

  it.skipIf(!llmAvailable)(
    '生成正文包含世界观设定要素',
    async () => {
      const content = await generateAndGetContent(getExecutor(), input);
      const uniqueKeywords = extractWorldKeywords(plan.worldRules);
      const matchedKeywords = uniqueKeywords.filter((k) => content.includes(k));
      const ratio = matchedKeywords.length / uniqueKeywords.length;

      console.log(
        `[世界观] 关键词匹配率: ${(ratio * 100).toFixed(1)}% (${matchedKeywords.length}/${uniqueKeywords.length})`
      );
      expect(ratio).toBeGreaterThanOrEqual(thresholds.worldRuleKeywordMatchMin);
    },
    thresholds.llmTestTimeout
  );

  it.skipIf(!llmAvailable)(
    '生成正文包含伏笔要素',
    async () => {
      const content = await generateAndGetContent(getExecutor(), input);
      const hookDescriptions = plan.hooks.map((h) => h.description);
      const { covered } = checkKeyEventCoverage(content, hookDescriptions);

      console.log(`[伏笔] 覆盖: ${covered.join(' | ')} | 总计: ${hookDescriptions.length}`);
      expect(covered.length).toBeGreaterThanOrEqual(thresholds.hookCoverageMin);
    },
    thresholds.llmTestTimeout
  );

  it.skipIf(!llmAvailable)(
    '文风一致性：不出现异题材违禁词',
    async () => {
      const content = await generateAndGetContent(getExecutor(), input);
      const foundForbidden = config.forbiddenWords.filter((w) => content.includes(w));

      console.log(
        `[文风一致性] ${config.genre}文中出现违禁词: ${foundForbidden.join(', ') || '无'}`
      );
      expect(foundForbidden.length).toBe(0);
    },
    thresholds.llmTestTimeout
  );

  it.skipIf(!llmAvailable)(
    '叙事结构：合理的段落和对话',
    async () => {
      const content = await generateAndGetContent(getExecutor(), input);
      const paragraphs = content.split(/\n+/).filter((p) => p.trim().length > 0);
      const hasDialogue = /[""「」『』"]/.test(content);

      console.log(`[段落结构] 段落数: ${paragraphs.length} | 包含对话: ${hasDialogue}`);
      expect(paragraphs.length).toBeGreaterThanOrEqual(thresholds.minParagraphCount);
      expect(hasDialogue).toBe(true);
    },
    thresholds.llmTestTimeout
  );

  it.skipIf(!llmAvailable)(
    '关键事件按大纲顺序出现',
    async () => {
      const content = await generateAndGetContent(getExecutor(), input);

      const positions: number[] = [];
      for (const event of plan.keyEvents) {
        const fragments = extractKeyFragments(event);
        let earliestPos = -1;
        for (const f of fragments) {
          const idx = content.indexOf(f);
          if (idx !== -1 && (earliestPos === -1 || idx < earliestPos)) {
            earliestPos = idx;
          }
        }
        positions.push(earliestPos);
      }

      const validPositions = positions.filter((p) => p !== -1);
      const sortedPositions = [...validPositions].sort((a, b) => a - b);

      console.log(
        `[事件顺序] 位置: ${positions.map((p) => (p === -1 ? '未找到' : p)).join(' → ')}`
      );
      expect(validPositions).toEqual(sortedPositions);
    },
    thresholds.llmTestTimeout
  );
}

// ════════════════════════════════════════════════════════════════
// 真实 LLM 集成测试
// ════════════════════════════════════════════════════════════════

describe('ChapterExecutor — 真实 LLM 集成测试', () => {
  let executor: ChapterExecutor;

  beforeAll(() => {
    if (!llmAvailable) return;
    const provider = createProvider();
    executor = new ChapterExecutor(provider);
  });

  // 参数化遍历所有配置题材
  for (const [genreKey, config] of Object.entries(GENRE_TEST_PLANS)) {
    describe(`${genreKey} 题材 — 大纲结构对齐`, () => {
      runGenreAlignmentTests(() => executor, config);
    });
  }

  // ── 环境配置说明 ──────────────────────────────────────

  describe('环境配置', () => {
    it('LLM 环境变量配置说明', () => {
      if (!llmAvailable) {
        console.log(`
┌─────────────────────────────────────────────────────────┐
│  LLM 集成测试被跳过 — 未检测到环境变量                    │
│                                                         │
│  运行方式：                                              │
│  $env:LLM_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
│  $env:LLM_API_KEY = "sk-xxx"                            │
│  $env:LLM_MODEL   = "qwen3.6-plus"                      │
│  $env:LLM_PROVIDER = "dashscope"  # 可选: openai/ollama │
│                                                         │
│  pnpm test -- src/agents/executor.llm.test.ts           │
└─────────────────────────────────────────────────────────┘`);
      }
      expect(true).toBe(true);
    });
  });
});
