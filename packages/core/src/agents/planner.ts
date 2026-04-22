import { BaseAgent, type AgentContext, type AgentResult } from './base';
import { generateJSONWithValidation, type LLMOutputRule } from '../llm/output-validator';
import { GENRE_OUTLINE_GUIDANCE as GENRE_GUIDANCE } from './genre-guidance';

export interface OutlineBrief {
  title: string;
  genre: string;
  brief: string;
  targetChapters?: number;
}

export interface ChapterBeat {
  chapterNumber: number;
  title: string;
  summary: string;
}

export interface ActOutline {
  actNumber: number;
  title: string;
  summary: string;
  chapters: ChapterBeat[];
}

export interface OutlineResult {
  acts: ActOutline[];
}

export class OutlinePlanner extends BaseAgent {
  readonly name = 'OutlinePlanner';
  readonly temperature = 0.8;

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const brief = ctx.promptContext?.brief as OutlineBrief | undefined;
    if (!brief) {
      return { success: false, error: '缺少创作简报' };
    }

    // Validate required fields
    if (!brief.title || brief.title.trim().length === 0) {
      return { success: false, error: '书名不能为空' };
    }
    if (!brief.brief || brief.brief.trim().length === 0) {
      return { success: false, error: '作品简介不能为空' };
    }

    const isLongForm = (brief.targetChapters ?? 0) > 50;

    try {
      if (isLongForm) {
        // 两阶段生成：先生成卷概要，再逐卷补齐章节beat
        const volumeCount = Math.min(Math.ceil((brief.targetChapters ?? 50) / 50), 12);
        const skeleton = await this.#generateSkeleton(brief, volumeCount);
        const outline = await this.#fillChapterBeats(brief, skeleton, volumeCount);
        const validated = this.#validateAndFixOutline(outline, volumeCount, brief);
        return { success: true, data: validated };
      } else {
        // 三幕结构也使用两阶段生成以获得足够的 beat 密度
        const skeleton = await this.#generateThreeActSkeleton(brief);
        const outline = await this.#fillThreeActBeats(brief, skeleton);
        const validated = this.#validateAndFixOutline(outline, 3, brief);
        return { success: true, data: validated };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `LLM 调用失败: ${message}` };
    }
  }

  /** 第一阶段：生成只含卷概要的大纲骨架（不含章节beat），带校验和重试 */
  async #generateSkeleton(brief: OutlineBrief, volumeCount: number): Promise<OutlineResult> {
    const prompt = this.#buildSkeletonPrompt(brief, volumeCount);
    const rules: LLMOutputRule[] = [{ field: 'acts', type: 'min_array_length', min: volumeCount }];
    return generateJSONWithValidation<OutlineResult>(this.provider, prompt, rules, {
      temperature: this.temperature,
      maxTokens: 4096,
      agentName: this.name,
      retry: { maxRetries: 2, retryDelayMs: 500 },
    });
  }

  /** 三幕结构：先生成幕概要骨架 */
  async #generateThreeActSkeleton(brief: OutlineBrief): Promise<OutlineResult> {
    const prompt = this.#buildThreeActSkeletonPrompt(brief);
    const rules: LLMOutputRule[] = [{ field: 'acts', type: 'min_array_length', min: 3 }];
    return generateJSONWithValidation<OutlineResult>(this.provider, prompt, rules, {
      temperature: this.temperature,
      maxTokens: 4096,
      agentName: this.name,
      retry: { maxRetries: 2, retryDelayMs: 500 },
    });
  }

  /** 第二阶段：逐卷补齐章节beat */
  async #fillChapterBeats(
    brief: OutlineBrief,
    skeleton: OutlineResult,
    volumeCount: number
  ): Promise<OutlineResult> {
    const acts = Array.isArray(skeleton.acts) ? skeleton.acts : [];
    const filledActs: ActOutline[] = [];

    for (let i = 0; i < acts.length; i++) {
      const act = acts[i];
      const existingChapters = Array.isArray(act.chapters) ? act.chapters : [];

      // 如果已有章节beat且数量>=3，则跳过补齐
      if (existingChapters.length >= 3) {
        filledActs.push(act);
        continue;
      }

      // 每卷预计章节数
      const chaptersPerVolume = Math.round((brief.targetChapters ?? 100) / volumeCount);
      // 本卷的起始章节号
      const startChapter = i * chaptersPerVolume + 1;

      const beatPrompt = this.#buildBeatFillPrompt(brief, act, startChapter, chaptersPerVolume);
      const beatRules: LLMOutputRule[] = [{ field: 'chapters', type: 'min_array_length', min: 3 }];
      const beatResult = await generateJSONWithValidation<{ chapters: ChapterBeat[] }>(
        this.provider,
        beatPrompt,
        beatRules,
        {
          maxTokens: 2048,
          temperature: 0.7,
          agentName: `${this.name}-BeatFill`,
          retry: { maxRetries: 2, retryDelayMs: 500 },
        }
      );

      filledActs.push({
        ...act,
        chapters: Array.isArray(beatResult.chapters) ? beatResult.chapters : existingChapters,
      });
    }

    return { acts: filledActs };
  }

  /** 三幕结构：逐幕补齐章节beat */
  async #fillThreeActBeats(brief: OutlineBrief, skeleton: OutlineResult): Promise<OutlineResult> {
    const acts = Array.isArray(skeleton.acts) ? skeleton.acts : [];
    const totalChapters = brief.targetChapters ?? 30;
    const filledActs: ActOutline[] = [];

    // 三幕比例：1:2:1（开端:发展:结局）
    const actRatios = [0.25, 0.5, 0.25];

    for (let i = 0; i < acts.length; i++) {
      const act = acts[i];
      const existingChapters = Array.isArray(act.chapters) ? act.chapters : [];

      // 如果已有章节beat且数量>=5，则跳过补齐
      if (existingChapters.length >= 5) {
        filledActs.push(act);
        continue;
      }

      const chaptersPerAct = Math.max(5, Math.round(totalChapters * (actRatios[i] ?? 0.33)));
      const prevTotal = filledActs.reduce(
        (sum, a) => sum + (Array.isArray(a.chapters) ? a.chapters.length : 0),
        0
      );
      const startChapter = prevTotal + 1;

      const beatPrompt = this.#buildBeatFillPrompt(brief, act, startChapter, chaptersPerAct);
      const beatRules: LLMOutputRule[] = [{ field: 'chapters', type: 'min_array_length', min: 5 }];
      const beatResult = await generateJSONWithValidation<{ chapters: ChapterBeat[] }>(
        this.provider,
        beatPrompt,
        beatRules,
        {
          maxTokens: 2048,
          temperature: 0.7,
          agentName: `${this.name}-ActBeatFill`,
          retry: { maxRetries: 2, retryDelayMs: 500 },
        }
      );

      filledActs.push({
        ...act,
        chapters: Array.isArray(beatResult.chapters) ? beatResult.chapters : existingChapters,
      });
    }

    return { acts: filledActs };
  }

  /** 校验大纲完整性并修补缺失 */
  #validateAndFixOutline(
    outline: OutlineResult,
    expectedCount: number,
    brief: OutlineBrief
  ): OutlineResult {
    const acts = Array.isArray(outline.acts) ? outline.acts : [];

    // 补齐缺失的卷
    while (acts.length < expectedCount) {
      const missingIndex = acts.length + 1;
      acts.push({
        actNumber: missingIndex,
        title: `${brief.title}第${missingIndex}卷`,
        summary: `第${missingIndex}卷的故事发展，主角继续面对新的挑战和机遇，情节持续升级。`,
        chapters: [],
      });
    }

    // 确保每卷的 summary 不为空
    for (const act of acts) {
      if (!act.summary || act.summary.trim().length === 0) {
        act.summary = `${act.title}阶段的故事发展，情节持续推进。`;
      }
      // 确保 chapters 为数组
      if (!Array.isArray(act.chapters)) {
        act.chapters = [];
      }
    }

    return { acts };
  }

  #buildSkeletonPrompt(brief: OutlineBrief, volumeCount: number): string {
    const genreHint = GENRE_GUIDANCE[brief.genre] ?? '';

    let prompt = `你是一位专业的网络小说大纲策划师。请根据以下创作简报，生成多卷结构大纲的**卷级概要**。

## 创作简报

- **书名**: ${brief.title}
- **题材**: ${brief.genre}${genreHint ? `（${genreHint}）` : ''}
- **简介**: ${brief.brief}`;

    if (brief.targetChapters) {
      prompt += `
- **目标章节数**: ${brief.targetChapters} 章`;
    }

    prompt += `

## 输出要求

请以 JSON 格式输出多卷大纲骨架，包含以下字段：
- acts: 数组，包含恰好 ${volumeCount} 个卷
  - actNumber: 卷序号（1-${volumeCount}）
  - title: 卷标题
  - summary: 卷概要（100字以上，包含本卷核心看点、关键转折、主角成长节点）
  - chapters: 暂时留空数组 []（章节beat将在后续步骤补齐）

多卷大纲要求：
1. 必须输出恰好 ${volumeCount} 个卷，不可减少。如果输出少于 ${volumeCount} 个卷，大纲将被视为无效
2. 每卷需有明确的叙事目标和核心冲突
3. 相邻卷之间要有情节递进和升级关系
4. 伏笔需跨卷铺设和回收
5. 每卷的 summary 必须具体、有细节，不可空泛

注意：chapters 字段留空数组即可，不要在此步骤中生成章节beat。`;

    return prompt;
  }

  #buildThreeActSkeletonPrompt(brief: OutlineBrief): string {
    const genreHint = GENRE_GUIDANCE[brief.genre] ?? '';
    const totalChapters = brief.targetChapters ?? 30;

    return `你是一位专业的网络小说大纲策划师。请根据以下创作简报，生成三幕结构大纲的**幕级概要**。

## 创作简报

- **书名**: ${brief.title}
- **题材**: ${brief.genre}${genreHint ? `（${genreHint}）` : ''}
- **简介**: ${brief.brief}
- **目标章节数**: ${totalChapters} 章（三幕比例约 1:2:1，即第1幕约${Math.round(totalChapters * 0.25)}章、第2幕约${Math.round(totalChapters * 0.5)}章、第3幕约${Math.round(totalChapters * 0.25)}章）

## 输出要求

请以 JSON 格式输出三幕大纲骨架，包含以下字段：
- acts: 数组，包含恰好 3 个幕
  - actNumber: 幕序号（1-3）
  - title: 幕标题
  - summary: 幕概要（200字以上，包含本幕核心看点、关键转折、主角成长节点、本幕预计覆盖的主要情节线索）
  - chapters: 暂时留空数组 []（章节beat将在后续步骤补齐）

三幕大纲要求：
1. 必须输出恰好 3 个幕，不可减少
2. 第1幕（开端/引入）：建立世界观、引入主角与核心设定、展示初始矛盾
3. 第2幕（发展/冲突）：矛盾升级、势力博弈、核心设定深度开发、中点转折
4. 第3幕（高潮/结局）：终极对决、核心矛盾解决、主角蜕变完成
5. 相邻幕之间要有情节递进和升级关系
6. 伏笔需跨幕铺设和回收
7. 每幕的 summary 必须具体、有细节，不可空泛

注意：chapters 字段留空数组即可，不要在此步骤中生成章节beat。`;
  }

  #buildBeatFillPrompt(
    brief: OutlineBrief,
    act: ActOutline,
    startChapter: number,
    chaptersPerVolume: number
  ): string {
    const genreHint = GENRE_GUIDANCE[brief.genre] ?? '';

    return `你是一位专业的网络小说章节策划师。请为以下卷生成关键章节beat。

## 书名
${brief.title}

## 题材
${brief.genre}${genreHint ? `（${genreHint}）` : ''}

## 第${act.actNumber}卷概要
- **卷标题**: ${act.title}
- **卷概要**: ${act.summary}
- **本卷预计章节数**: 约${chaptersPerVolume}章（起始章节号：第${startChapter}章）

## 输出要求

请以 JSON 格式输出本卷的关键章节beat列表，包含以下字段：
- chapters: 数组，包含 5-8 个关键章节beat
  - chapterNumber: 章节号（从 ${startChapter} 开始，使用该卷内的关键节点章节号，不需要列出全部章节）
  - title: 章节标题
  - summary: 章节内容摘要（30-50字，描述该章节的核心事件和叙事目标）

每个beat须与本卷概要中的核心看点和转折点对应，体现情节递进。`;
  }
}
