import { BaseAgent, type AgentContext, type AgentResult } from './base';
import { generateJSONWithValidation, type LLMOutputRule } from '../llm/output-validator';
import type { StoryBlueprint } from '../workflow/contracts/outline';
import type {
  ChapterEntry,
  CreateDetailedOutlineInput,
  VolumeEntry,
} from '../workflow/contracts/detailed-outline';

export interface DetailedOutlineGeneratorInput {
  blueprint: StoryBlueprint;
  totalChapters?: number;
  chaptersPerVolume?: number;
}

interface VolumeSkeleton {
  volumeNumber: number;
  title: string;
  arcSummary: string;
  chapterCount: number;
  startChapter: number;
  endChapter: number;
}

interface VolumeSkeletonResult {
  volumes: VolumeSkeleton[];
}

interface VolumeChaptersResult {
  chapters: ChapterEntry[];
}

/**
 * 细纲生成器:从 StoryBlueprint 一次产出全书章节地图。
 *
 * 两阶段生成:
 * - 阶段 A:卷骨架(每卷 title / arcSummary / chapterCount / 起止章节号)
 * - 阶段 B:逐卷补章节(含 contextForWriter)
 *
 * Token 控制:阶段 B 一次只生成 1 卷,卷间独立请求避免单次超长。
 */
export class DetailedOutlineGenerator extends BaseAgent {
  readonly name = 'DetailedOutlineGenerator';
  readonly temperature = 0.75;

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const input = ctx.promptContext?.input as DetailedOutlineGeneratorInput | undefined;
    if (!input?.blueprint) {
      return { success: false, error: '缺少 StoryBlueprint' };
    }

    try {
      const totalChapters = this.#resolveTotalChapters(input);
      const chaptersPerVolume = input.chaptersPerVolume ?? 20;
      const volumeCount = Math.max(1, Math.ceil(totalChapters / chaptersPerVolume));

      const skeleton = await this.#generateVolumeSkeleton(
        input.blueprint,
        volumeCount,
        totalChapters,
      );
      const filledVolumes: VolumeEntry[] = [];

      for (const volSkel of skeleton.volumes) {
        const chapters = await this.#fillVolumeChapters(input.blueprint, volSkel);
        filledVolumes.push({
          volumeNumber: volSkel.volumeNumber,
          title: volSkel.title,
          arcSummary: volSkel.arcSummary,
          chapterCount: volSkel.chapterCount,
          startChapter: volSkel.startChapter,
          endChapter: volSkel.endChapter,
          chapters,
        });
      }

      const draft: Omit<CreateDetailedOutlineInput, 'storyBlueprintId'> = {
        totalChapters,
        estimatedTotalWords: input.blueprint.meta.estimatedWordCount,
        volumes: filledVolumes,
      };

      return { success: true, data: draft };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `细纲生成失败: ${message}` };
    }
  }

  #resolveTotalChapters(input: DetailedOutlineGeneratorInput): number {
    if (input.totalChapters && input.totalChapters > 0) {
      return Math.floor(input.totalChapters);
    }
    const wordEstimate = input.blueprint.meta.estimatedWordCount.match(/\d+/);
    if (!wordEstimate) {
      return 30;
    }
    const wordCount = Number(wordEstimate[0]);
    if (!wordCount) {
      return 30;
    }
    const isWan = /[万萬]/.test(input.blueprint.meta.estimatedWordCount);
    const totalWords = isWan ? wordCount * 10000 : wordCount;
    const chapterTarget = Number(input.blueprint.base.writingStyle.chapterWordCountTarget) || 3000;
    const estimated = Math.max(10, Math.round(totalWords / chapterTarget));
    return Math.min(estimated, 600);
  }

  async #generateVolumeSkeleton(
    blueprint: StoryBlueprint,
    volumeCount: number,
    totalChapters: number,
  ): Promise<VolumeSkeletonResult> {
    const prompt = this.#buildSkeletonPrompt(blueprint, volumeCount, totalChapters);
    const rules: LLMOutputRule[] = [
      { field: 'volumes', type: 'min_array_length', min: volumeCount },
    ];
    const result = await generateJSONWithValidation<VolumeSkeletonResult>(
      this.provider,
      prompt,
      rules,
      {
        temperature: this.temperature,
        maxTokens: 4096,
        agentName: `${this.name}-Skeleton`,
        retry: { maxRetries: 2, retryDelayMs: 500 },
      },
    );

    return this.#normalizeSkeleton(result, volumeCount, totalChapters);
  }

  async #fillVolumeChapters(
    blueprint: StoryBlueprint,
    skel: VolumeSkeleton,
  ): Promise<ChapterEntry[]> {
    const prompt = this.#buildChaptersPrompt(blueprint, skel);
    const rules: LLMOutputRule[] = [
      { field: 'chapters', type: 'min_array_length', min: skel.chapterCount },
    ];
    const result = await generateJSONWithValidation<VolumeChaptersResult>(
      this.provider,
      prompt,
      rules,
      {
        temperature: 0.7,
        maxTokens: 6144,
        agentName: `${this.name}-Vol${skel.volumeNumber}`,
        retry: { maxRetries: 2, retryDelayMs: 500 },
      },
    );

    return this.#normalizeChapters(result, skel);
  }

  #normalizeSkeleton(
    raw: VolumeSkeletonResult,
    expected: number,
    totalChapters: number,
  ): VolumeSkeletonResult {
    const volumes = Array.isArray(raw.volumes) ? raw.volumes.slice(0, expected) : [];
    while (volumes.length < expected) {
      volumes.push({
        volumeNumber: volumes.length + 1,
        title: `第 ${volumes.length + 1} 卷`,
        arcSummary: '主线持续推进,情节升级。',
        chapterCount: 0,
        startChapter: 0,
        endChapter: 0,
      });
    }

    const baseChapters = Math.floor(totalChapters / expected);
    let cursor = 1;
    const normalized = volumes.map((vol, index) => {
      const isLast = index === volumes.length - 1;
      const chapterCount = isLast
        ? Math.max(1, totalChapters - (cursor - 1))
        : Math.max(1, vol.chapterCount > 0 ? vol.chapterCount : baseChapters);
      const startChapter = cursor;
      const endChapter = startChapter + chapterCount - 1;
      cursor = endChapter + 1;
      return {
        volumeNumber: index + 1,
        title: vol.title?.trim() || `第 ${index + 1} 卷`,
        arcSummary: vol.arcSummary?.trim() || '主线持续推进,情节升级。',
        chapterCount,
        startChapter,
        endChapter,
      };
    });

    return { volumes: normalized };
  }

  #normalizeChapters(raw: VolumeChaptersResult, skel: VolumeSkeleton): ChapterEntry[] {
    const list = Array.isArray(raw.chapters) ? raw.chapters : [];
    const normalized: ChapterEntry[] = [];
    for (let i = 0; i < skel.chapterCount; i++) {
      const chapterNumber = skel.startChapter + i;
      const chapter = list[i];
      if (!chapter) {
        normalized.push(this.#fallbackChapter(chapterNumber, skel));
        continue;
      }
      normalized.push({
        chapterNumber,
        title: chapter.title?.trim() || `第 ${chapterNumber} 章`,
        wordCountTarget: chapter.wordCountTarget?.trim() || '',
        sceneSetup: chapter.sceneSetup?.trim() || '',
        charactersPresent: this.#cleanArray(chapter.charactersPresent),
        coreEvents: this.#ensureNonEmpty(this.#cleanArray(chapter.coreEvents), [
          `第 ${chapterNumber} 章关键事件待补全`,
        ]),
        emotionArc: chapter.emotionArc?.trim() || '',
        chapterEndHook: chapter.chapterEndHook?.trim() || '',
        foreshadowingOps: Array.isArray(chapter.foreshadowingOps)
          ? chapter.foreshadowingOps.map((op) => ({
              foreshadowingId: op.foreshadowingId?.trim() || 'unknown',
              operation: op.operation ?? 'plant',
              description: op.description?.trim() || '',
            }))
          : [],
        satisfactionType: chapter.satisfactionType,
        keyDialogueHints: this.#cleanArray(chapter.keyDialogueHints),
        writingNotes: chapter.writingNotes?.trim() || '',
        contextForWriter: this.#normalizeContext(chapter.contextForWriter, chapterNumber, skel),
      });
    }
    return normalized;
  }

  #fallbackChapter(chapterNumber: number, skel: VolumeSkeleton): ChapterEntry {
    return {
      chapterNumber,
      title: `第 ${chapterNumber} 章`,
      wordCountTarget: '',
      sceneSetup: '',
      charactersPresent: [],
      coreEvents: ['关键事件待补全'],
      emotionArc: '',
      chapterEndHook: '',
      foreshadowingOps: [],
      keyDialogueHints: [],
      writingNotes: '',
      contextForWriter: {
        storyProgress: `${skel.title} 进行中:${skel.arcSummary}`,
        chapterPositionNote: `本卷第 ${chapterNumber - skel.startChapter + 1} / ${skel.chapterCount} 章`,
        characterStates: [],
        activeWorldRules: [],
        activeForeshadowingStatus: [],
        precedingChapterBridge: { cliffhanger: '', emotionalCarry: '', unresolvedTension: '' },
        nextChapterSetup: { seedForNext: '', expectedDevelopment: '' },
      },
    };
  }

  #normalizeContext(
    raw: ChapterEntry['contextForWriter'] | undefined,
    chapterNumber: number,
    skel: VolumeSkeleton,
  ): ChapterEntry['contextForWriter'] {
    const fallback = this.#fallbackChapter(chapterNumber, skel).contextForWriter;
    if (!raw) {
      return fallback;
    }
    return {
      storyProgress: raw.storyProgress?.trim() || fallback.storyProgress,
      chapterPositionNote: raw.chapterPositionNote?.trim() || fallback.chapterPositionNote,
      characterStates: Array.isArray(raw.characterStates)
        ? raw.characterStates.map((s) => ({
            characterId: s.characterId?.trim() || 'unknown',
            powerLevel: s.powerLevel?.trim() || '',
            emotionalState: s.emotionalState?.trim() || '',
            keySecret: s.keySecret?.trim() || '',
            relationshipWithPov: s.relationshipWithPov?.trim() || '',
          }))
        : [],
      activeWorldRules: this.#cleanArray(raw.activeWorldRules),
      activeForeshadowingStatus: Array.isArray(raw.activeForeshadowingStatus)
        ? raw.activeForeshadowingStatus.map((s) => ({
            foreshadowingId: s.foreshadowingId?.trim() || 'unknown',
            status: s.status ?? 'planted',
            note: s.note?.trim() || '',
          }))
        : [],
      precedingChapterBridge: {
        cliffhanger: raw.precedingChapterBridge?.cliffhanger?.trim() || '',
        emotionalCarry: raw.precedingChapterBridge?.emotionalCarry?.trim() || '',
        unresolvedTension: raw.precedingChapterBridge?.unresolvedTension?.trim() || '',
      },
      nextChapterSetup: {
        seedForNext: raw.nextChapterSetup?.seedForNext?.trim() || '',
        expectedDevelopment: raw.nextChapterSetup?.expectedDevelopment?.trim() || '',
      },
    };
  }

  #cleanArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item.length > 0);
  }

  #ensureNonEmpty(arr: string[], fallback: string[]): string[] {
    return arr.length > 0 ? arr : fallback;
  }

  #buildSkeletonPrompt(
    blueprint: StoryBlueprint,
    volumeCount: number,
    totalChapters: number,
  ): string {
    const characters = blueprint.base.characters
      .slice(0, 5)
      .map((c) => `${c.name}(${c.role}): ${c.motivation || ''}`)
      .join('\n  - ');
    const foreshadowingSeeds = blueprint.base.foreshadowingSeed.entries
      .slice(0, 6)
      .map((f) => `${f.id}: ${f.content}`)
      .join('\n  - ');

    return `你是一位资深网络小说细纲策划师。请根据 StoryBlueprint 生成 ${volumeCount} 卷的细纲骨架。

## StoryBlueprint 关键字段

- 小说类型: ${blueprint.meta.novelType}(${blueprint.meta.novelSubgenre || '通用子类型'})
- 架构模式: ${blueprint.meta.architectureMode}
- 一句话简介: ${blueprint.meta.oneLineSynopsis}
- 核心主题: ${blueprint.base.theme.coreTheme}
- 情感弧线: ${blueprint.base.theme.narrativeArc.opening} → ${blueprint.base.theme.narrativeArc.development} → ${blueprint.base.theme.narrativeArc.climax} → ${blueprint.base.theme.narrativeArc.resolution}
- 总字数目标: ${blueprint.meta.estimatedWordCount}
- 主要角色:
  - ${characters || '(无)'}
- 伏笔种子(${blueprint.base.foreshadowingSeed.entries.length} 条):
  - ${foreshadowingSeeds || '(无)'}
- 完本设计: 终极对手=${blueprint.base.completionDesign.finalBoss},终极冲突=${blueprint.base.completionDesign.finalConflict}

## 输出要求

请输出严格符合以下结构的 JSON:

{
  "volumes": [
    {
      "volumeNumber": 1,
      "title": "卷标题",
      "arcSummary": "本卷叙事弧线 100 字以上",
      "chapterCount": 章节数(整数),
      "startChapter": 起始章节号,
      "endChapter": 终止章节号
    },
    ...
  ]
}

约束:
1. 必须输出恰好 ${volumeCount} 卷,总章节数应接近 ${totalChapters} 章。
2. 卷之间必须有情节递进,呼应情感弧线 4 阶段(开端 / 发展 / 高潮 / 收束)。
3. arcSummary 必须包含本卷核心冲突、关键转折、主角成长节点。
4. 章节号连续不重复,startChapter / endChapter 由 chapterCount 推导。`;
  }

  #buildChaptersPrompt(blueprint: StoryBlueprint, skel: VolumeSkeleton): string {
    const characters = blueprint.base.characters
      .slice(0, 5)
      .map((c) => `${c.id}|${c.name}(${c.role})`)
      .join('; ');
    const foreshadowingIds = blueprint.base.foreshadowingSeed.entries.map((f) => f.id).join(', ');

    return `你是一位资深网络小说章节细纲师。请为以下卷输出每章细纲(含 contextForWriter 自给自足上下文)。

## 上下文

- 小说类型: ${blueprint.meta.novelType}(${blueprint.meta.novelSubgenre || ''})
- 全书一句话简介: ${blueprint.meta.oneLineSynopsis}
- 主要角色 id|name(role): ${characters || '(无)'}
- 伏笔种子 ID 列表: ${foreshadowingIds || '(无)'}
- 单章字数目标: ${blueprint.base.writingStyle.chapterWordCountTarget}
- 卖点钩子: ${blueprint.base.sellingPoints.coreSellingPoint} | ${blueprint.base.sellingPoints.hookSentence}

## 当前卷信息

- volumeNumber: ${skel.volumeNumber}
- title: ${skel.title}
- arcSummary: ${skel.arcSummary}
- 本卷章节范围: 第 ${skel.startChapter} 章 ~ 第 ${skel.endChapter} 章(共 ${skel.chapterCount} 章)

## 输出要求

请输出 JSON,字段如下:

{
  "chapters": [
    {
      "chapterNumber": ${skel.startChapter},
      "title": "章节标题",
      "wordCountTarget": "${blueprint.base.writingStyle.chapterWordCountTarget}",
      "sceneSetup": "场景设定(地点/时间/初始情境)",
      "charactersPresent": ["角色 id 或 name"],
      "coreEvents": ["核心事件 1", "核心事件 2", "核心事件 3"],
      "emotionArc": "本章情感弧线",
      "chapterEndHook": "结尾钩子",
      "foreshadowingOps": [{ "foreshadowingId": "f1", "operation": "plant|advance|resolve", "description": "操作说明" }],
      "satisfactionType": "face_slap|level_up|revelation|emotional_burst|power_display|reversal|harvest",
      "keyDialogueHints": ["对话提示 1"],
      "writingNotes": "执笔提醒",
      "contextForWriter": {
        "storyProgress": "故事进度(必填,40 字以上,含主角处境/前情提要)",
        "chapterPositionNote": "本章在卷中位置/作用",
        "characterStates": [
          { "characterId": "mc", "powerLevel": "境界/能力", "emotionalState": "情绪", "keySecret": "持有的核心秘密", "relationshipWithPov": "与主角关系" }
        ],
        "activeWorldRules": ["本章相关世界设定"],
        "activeForeshadowingStatus": [
          { "foreshadowingId": "f1", "status": "planted|advanced|ready", "note": "备注" }
        ],
        "precedingChapterBridge": { "cliffhanger": "上一章悬念", "emotionalCarry": "情绪延续", "unresolvedTension": "未解张力" },
        "nextChapterSetup": { "seedForNext": "为下一章埋下的种子", "expectedDevelopment": "下一章预期" }
      }
    }
  ]
}

强约束:
1. 必须输出恰好 ${skel.chapterCount} 章。
2. chapterNumber 严格连续,从 ${skel.startChapter} 到 ${skel.endChapter}。
3. coreEvents 至少 1 条,可空时用占位 "本章关键事件待补全"。
4. contextForWriter.storyProgress 必填(空字符串视为无效)。
5. foreshadowingOps.foreshadowingId 应来自伏笔种子列表 [${foreshadowingIds}]。`;
  }
}

import { agentRegistry } from './registry';
agentRegistry.register('detailed-outline-generator', (p) => new DetailedOutlineGenerator(p));
