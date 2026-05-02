import { BaseAgent, type AgentContext, type AgentResult } from './base';
import { generateJSONWithValidation, type LLMOutputRule } from '../llm/output-validator';
import {
  GENRE_TO_ARCHITECTURE,
  GENRE_TO_TYPE_SPECIFIC,
  GENRE_OUTLINE_GUIDANCE,
} from './genre-guidance';
import type {
  ArchitectureMode,
  CreateStoryBlueprintInput,
  EndingType,
  GenderTarget,
  NovelType,
} from '../workflow/contracts/outline';

/**
 * OutlineGenerator 输入(从 InspirationSeed + PlanningBrief 提取)
 */
export interface OutlineGeneratorInput {
  /** 灵感原文 */
  sourceText: string;
  /** 题材(中文 or 英文均可,服务层会归一化) */
  genre?: string;
  /** 主题 */
  theme?: string;
  /** 核心冲突 */
  conflict?: string;
  /** 基调 */
  tone?: string;
  /** 受众描述 */
  audience: string;
  /** 题材策略 */
  genreStrategy: string;
  /** 风格目标 */
  styleTarget: string;
  /** 字数目标 */
  lengthTarget: string;
  /** 禁忌规则 */
  tabooRules: string[];
  /** 市场目标 */
  marketGoals: string[];
  /** 创作约束 */
  creativeConstraints: string[];
  /** 用户提示的小说类型(可选,影响置信度) */
  hintType?: NovelType;
}

/**
 * 单 Agent 一次 LLM 调用产出三层 StoryBlueprint
 *
 * 设计参考 C:/Users/18223/Desktop/AI 项目的 8 Agent 链路,
 * 但合并为单 Agent 以降低协作复杂度。
 *
 * - meta:类型识别 + 架构模式 + 字数 + 结局类型
 * - base:卖点 / 主题 / 黄金三章 / 写作风格 / 角色 / 伏笔种子 / 完本设计
 * - typeSpecific:按类型 5 选 1(Fantasy / Mystery / Urban / Romance / SciFi)
 *
 * 架构模式由 GENRE_TO_ARCHITECTURE 自动推断,LLM 只在该模式下生成对应子结构。
 */
export class OutlineGenerator extends BaseAgent {
  readonly name = 'OutlineGenerator';
  readonly temperature = 0.85;

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const input = ctx.promptContext?.input as OutlineGeneratorInput | undefined;
    if (!input) {
      return { success: false, error: '缺少 OutlineGenerator 输入' };
    }
    const validationError = this.#validate(input);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const novelType: NovelType = input.hintType ?? this.#inferNovelType(input);
    const architectureMode = GENRE_TO_ARCHITECTURE[novelType] ?? 'org_ensemble';
    const typeSpecificKind = GENRE_TO_TYPE_SPECIFIC[novelType] ?? 'urban';
    const endingType: EndingType = this.#inferEndingType(input);
    const genderTarget: GenderTarget = this.#inferGenderTarget(input);

    const prompt = this.#buildPrompt(
      input,
      novelType,
      architectureMode,
      typeSpecificKind,
      endingType,
      genderTarget,
    );

    try {
      const rules: LLMOutputRule[] = [
        { field: 'meta.titleSuggestions', type: 'min_array_length', min: 1 },
        { field: 'meta.oneLineSynopsis', type: 'min_string_length', min: 10 },
        { field: 'base.theme.toneKeywords', type: 'min_array_length', min: 3 },
        { field: 'base.characters', type: 'min_array_length', min: 1 },
        { field: 'base.sellingPoints.coreSellingPoint', type: 'min_string_length', min: 1 },
        { field: 'base.completionDesign.finalConflict', type: 'min_string_length', min: 1 },
      ];

      const draft = await generateJSONWithValidation<DraftBlueprint>(this.provider, prompt, rules, {
        temperature: this.temperature,
        maxTokens: 8192,
        agentName: this.name,
        retry: { maxRetries: 2, retryDelayMs: 500 },
      });

      const blueprint = this.#assemble(draft, {
        novelType,
        architectureMode,
        typeSpecificKind,
        endingType,
        genderTarget,
      });

      return { success: true, data: blueprint };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `总纲生成失败: ${message}` };
    }
  }

  // ── 校验 ──────────────────────────────────────

  #validate(input: OutlineGeneratorInput): string | null {
    if (!input.sourceText || input.sourceText.trim().length === 0) {
      return '原始灵感不能为空';
    }
    if (!input.audience || input.audience.trim().length === 0) {
      return '受众不能为空';
    }
    if (!input.genreStrategy || input.genreStrategy.trim().length === 0) {
      return '题材策略不能为空';
    }
    return null;
  }

  // ── 类型推断(简化版,实际场景由 LLM 补完) ──

  #inferNovelType(input: OutlineGeneratorInput): NovelType {
    const text = `${input.genre ?? ''} ${input.genreStrategy} ${input.sourceText}`.toLowerCase();
    if (/玄幻|玄换|玄换|fantasy.*ancient|玄/.test(text)) return 'xuanhuan';
    if (/仙侠|修仙|修真|xianxia/.test(text)) return 'xianxia';
    if (/奇幻|qihuan|fantasy/.test(text)) return 'qihuan';
    if (/科幻|kehuan|sci-fi|scifi/.test(text)) return 'kehuan';
    if (/游戏|youxi|game/.test(text)) return 'youxi';
    if (/末世|moshi|apocalypse/.test(text)) return 'moshi';
    if (/悬疑|xuanyi|mystery|推理/.test(text)) return 'xuanyi';
    if (/言情|yanqing|romance|爱情/.test(text)) return 'yanqing';
    if (/历史|lishi|history/.test(text)) return 'lishi';
    return 'dushi';
  }

  #inferEndingType(input: OutlineGeneratorInput): EndingType {
    const text = `${input.tone ?? ''} ${input.creativeConstraints.join(' ')}`.toLowerCase();
    if (/悲剧|be|tragic/.test(text)) return 'BE';
    if (/开放|open/.test(text)) return 'open';
    if (/虐恋|虐|angst/.test(text)) return 'angst_HE';
    return 'HE';
  }

  #inferGenderTarget(input: OutlineGeneratorInput): GenderTarget {
    const text = `${input.audience} ${input.genreStrategy}`.toLowerCase();
    if (/女频|女性|女主|female/.test(text)) return 'female';
    if (/男频|男性|男主|male/.test(text)) return 'male';
    return 'universal';
  }

  // ── Prompt 构造 ──────────────────────────────

  #buildPrompt(
    input: OutlineGeneratorInput,
    novelType: NovelType,
    architectureMode: ArchitectureMode,
    typeSpecificKind: 'fantasy' | 'mystery' | 'urban' | 'romance' | 'scifi',
    endingType: EndingType,
    genderTarget: GenderTarget,
  ): string {
    const genreHint = GENRE_OUTLINE_GUIDANCE[novelType] ?? '';

    return `你是一位资深网络小说总策划。请根据以下灵感与规划简报,产出**完整三层结构**的故事总纲(JSON 格式)。

## 输入

### 原始灵感
${input.sourceText}

### 题材方向
${input.genre ?? '未指定'}

### 主题 / 冲突 / 基调
- 主题:${input.theme ?? '未指定'}
- 核心冲突:${input.conflict ?? '未指定'}
- 基调:${input.tone ?? '未指定'}

### 规划简报
- 受众:${input.audience}
- 题材策略:${input.genreStrategy}
- 风格目标:${input.styleTarget}
- 字数目标:${input.lengthTarget}
${input.tabooRules.length > 0 ? `- 禁忌规则:${input.tabooRules.join(';')}` : ''}
${input.marketGoals.length > 0 ? `- 市场目标:${input.marketGoals.join(';')}` : ''}
${input.creativeConstraints.length > 0 ? `- 创作约束:${input.creativeConstraints.join(';')}` : ''}

## 已确定的结构性参数(必须严格遵循)

- 小说类型:**${novelType}**(${this.#novelTypeLabel(novelType)})${genreHint ? ` — ${genreHint}` : ''}
- 架构模式:**${architectureMode}**(${this.#architectureModeLabel(architectureMode)})
- typeSpecific.kind:**${typeSpecificKind}**
- 结局类型:**${endingType}**
- 性别向:**${genderTarget}**

## 输出 JSON 结构(三层)

输出必须是有效 JSON,严格按以下结构:

\`\`\`json
{
  "meta": {
    "titleSuggestions": ["书名1", "书名2"],
    "oneLineSynopsis": "一句话简介(<= 200 字)",
    "novelSubgenre": "细分子类",
    "estimatedWordCount": "200 万字"
  },
  "base": {
    "sellingPoints": {
      "coreSellingPoint": "核心卖点(<=50字)",
      "hookSentence": "宣传钩子句(<=150字)",
      "auxiliarySellingPoints": [
        { "point": "辅助卖点", "category": "情节爽感|人物魅力|世界观新奇|情感线|成长逆袭|系统数值|悬念伏笔|情感共鸣" }
      ],
      "differentiation": "差异化",
      "readerAppeal": "读者卖点"
    },
    "theme": {
      "coreTheme": "核心主题",
      "proposition": "命题",
      "narrativeArc": {
        "opening": "开端", "development": "发展", "climax": "高潮", "resolution": "结局"
      },
      "toneKeywords": ["热血", "燃", "坚韧"],
      "subthemes": [],
      "forbiddenTones": [],
      "writingAtmosphere": "氛围"
    },
    "goldenOpening": {
      "openingHookType": "high_burn|suspense|emotional|world_shock|reversal|instant_payoff",
      "chapter1": { "summary": "...", "hook": "...", "mustAchieve": ["..."], "wordCountTarget": "3500", "firstHook": "首句钩子" },
      "chapter2": { "summary": "...", "hook": "...", "mustAchieve": ["..."], "wordCountTarget": "3500" },
      "chapter3": { "summary": "...", "hook": "...", "mustAchieve": ["..."], "wordCountTarget": "3500", "signingHook": "签约钩子" }
    },
    "writingStyle": {
      "prose": { "tone": ["紧凑"], "forbiddenTones": [], "sentenceRhythm": "短句切割", "descriptionDensity": "中等" },
      "scene": { "sceneStructure": "动作-反应", "povRules": "主角第三人称", "sensoryPriority": ["视觉"] },
      "dialogue": { "dialogueToNarrationRatio": "4:6", "monologueHandling": "点到为止", "subtextGuidelines": "留白" },
      "chapterWordCountTarget": "3500"
    },
    "characters": [
      {
        "id": "mc",
        "name": "主角姓名",
        "role": "protagonist",
        "traits": ["...", "..."],
        "background": "...",
        "motivation": "...",
        "arc": "...",
        "abilities": [],
        "weaknesses": []
      }
    ],
    "relationships": [
      { "fromId": "mc", "toId": "其他角色 id", "relationType": "...", "evolution": "..." }
    ],
    "outlineArchitecture": {
      "modeReason": "为什么选择此架构模式",
      "satisfactionPacing": {
        "earlyGame": ["打脸"],
        "midGame": ["升级"],
        "lateGame": ["碾压"],
        "climax": ["反转"]
      },
      ${this.#architectureDataExample(architectureMode)}
    },
    "foreshadowingSeed": {
      "entries": [{ "id": "f1", "content": "伏笔内容", "category": "类别", "importance": "high|medium|low" }],
      "resolutionChecklist": ["..."]
    },
    "completionDesign": {
      "finalBoss": "终极对手",
      "finalConflict": "终极冲突",
      "epilogueHint": "尾声暗示",
      "looseEndsResolution": ["..."]
    }
  },
  ${this.#typeSpecificExample(typeSpecificKind)}
}
\`\`\`

## 关键约束

1. 至少 1 个角色 role='protagonist'(主角)
2. relationships 中的 fromId/toId 必须存在于 characters[].id
3. theme.toneKeywords 至少 3 个
4. characters 至少 2 个(含主角和一个配角)
5. 黄金三章(chapter1/2/3) summary 不能为空,每个 hook 都要有内容
6. typeSpecific 必须严格匹配 kind="${typeSpecificKind}",**不能填其他 kind**
7. outlineArchitecture.data.kind 必须等于 "${architectureMode}",字段必须严格匹配该模式

输出**只返回 JSON**,不要包含任何说明文字。`;
  }

  #architectureDataExample(mode: ArchitectureMode): string {
    if (mode === 'lotus_map') {
      return `"data": {
        "kind": "lotus_map",
        "lotusCore": {
          "name": "核心秘境名",
          "setting": "秘境设定",
          "protagonistInitialRelation": "主角与秘境关系",
          "secretLayers": [{ "layerId": "l1", "depth": "表层", "secretContent": "秘密", "unlockTrigger": "触发条件", "unlockTiming": "时机" }],
          "guardianCharacters": [],
          "returnTriggerDesign": "回归触发"
        },
        "petals": [
          { "petalId": "p1", "name": "花瓣单元名", "arcSummary": "弧光摘要", "keyConflict": "核心冲突", "newFactions": [], "worldExpansion": "", "lotusCoreConnection": "", "satisfactionType": "face_slap" }
        ],
        "historyLayers": [],
        "ultimateTheme": "终极主题"
      }`;
    }
    if (mode === 'multiverse') {
      return `"data": {
        "kind": "multiverse",
        "hubWorld": "枢纽世界",
        "worlds": [
          { "worldId": "w1", "name": "世界 1", "rules": "规则", "conflict": "冲突", "transferMechanism": "穿越机制" }
        ],
        "progressionLogic": "递进逻辑"
      }`;
    }
    if (mode === 'org_ensemble') {
      return `"data": {
        "kind": "org_ensemble",
        "coreOrg": "核心组织",
        "factions": [
          { "factionId": "f1", "name": "派系 1", "ideology": "理念", "leader": "首领", "stance": "立场" }
        ],
        "powerBalance": "势力平衡",
        "protagonistEntryPoint": "主角切入点"
      }`;
    }
    return `"data": {
      "kind": "map_upgrade",
      "startingZone": "起始区",
      "zones": [
        { "zoneId": "z1", "name": "区域 1", "levelRange": "1-10 级", "resources": "资源", "dangers": "危险" }
      ],
      "upgradeTriggers": [],
      "zoneTransitionLogic": "切换逻辑"
    }`;
  }

  #typeSpecificExample(kind: 'fantasy' | 'mystery' | 'urban' | 'romance' | 'scifi'): string {
    if (kind === 'fantasy') {
      return `"typeSpecific": {
    "kind": "fantasy",
    "powerSystem": {
      "systemName": "功法体系名",
      "cultivationType": "修炼类型",
      "levels": ["第一层", "第二层", "第三层"],
      "resourceCategories": [],
      "combatSystem": ""
    },
    "goldenFinger": {
      "name": "金手指名",
      "abilityType": "类型",
      "origin": "来源",
      "growthPath": "成长路径",
      "limitations": [],
      "keyAbilities": []
    }
  }`;
    }
    if (kind === 'mystery') {
      return `"typeSpecific": {
    "kind": "mystery",
    "mysteryDesign": [{ "mysteryId": "m1", "mysteryContent": "谜团", "clues": [], "redHerrings": [], "revealChapter": "", "impact": "" }],
    "revelationSchedule": [],
    "suspenseRhythm": ""
  }`;
    }
    if (kind === 'urban') {
      return `"typeSpecific": {
    "kind": "urban",
    "systemPanel": null,
    "worldBuilding": {
      "socialHierarchy": "",
      "economicSystem": "",
      "technologyLevel": "",
      "locationCards": []
    }
  }`;
    }
    if (kind === 'romance') {
      return `"typeSpecific": {
    "kind": "romance",
    "emotionalArc": [{ "phase": "初遇", "emotion": "好奇", "trigger": "", "readerSatisfactionType": "" }],
    "relationshipSystem": {
      "coreRelationshipType": "双向暗恋",
      "tensionSources": [],
      "milestoneEvents": []
    }
  }`;
    }
    return `"typeSpecific": {
    "kind": "scifi",
    "techLevels": [{ "levelId": "t1", "name": "等级 1", "capabilities": [], "limitations": [] }],
    "interstellarPolitics": "",
    "worldBuilding": { "socialHierarchy": "", "economicSystem": "", "technologyLevel": "" }
  }`;
  }

  #novelTypeLabel(t: NovelType): string {
    return {
      xuanhuan: '玄幻',
      xianxia: '仙侠',
      qihuan: '奇幻',
      kehuan: '科幻',
      youxi: '游戏',
      moshi: '末世',
      dushi: '都市',
      xuanyi: '悬疑',
      yanqing: '言情',
      lishi: '历史',
    }[t];
  }

  #architectureModeLabel(m: ArchitectureMode): string {
    return {
      lotus_map: '莲花地图:核心秘境 + 花瓣单元',
      multiverse: '平行宇宙:枢纽世界 + 平行世界',
      org_ensemble: '组织群像:核心组织 + 阵营博弈',
      map_upgrade: '地图升级:起始区域 + 分级地图',
    }[m];
  }

  // ── 装配 ─────────────────────────────────────

  #assemble(
    draft: DraftBlueprint,
    fixed: {
      novelType: NovelType;
      architectureMode: ArchitectureMode;
      typeSpecificKind: 'fantasy' | 'mystery' | 'urban' | 'romance' | 'scifi';
      endingType: EndingType;
      genderTarget: GenderTarget;
    },
  ): Omit<CreateStoryBlueprintInput, 'planningBriefId'> {
    return {
      meta: {
        novelType: fixed.novelType,
        novelSubgenre: draft.meta?.novelSubgenre ?? undefined,
        typeConfidence: draft.meta?.typeConfidence ?? 0.85,
        typeIsAuto: draft.meta?.typeIsAuto ?? true,
        genderTarget: fixed.genderTarget,
        architectureMode: fixed.architectureMode,
        titleSuggestions: draft.meta?.titleSuggestions ?? ['未命名'],
        estimatedWordCount: draft.meta?.estimatedWordCount ?? '100 万字',
        endingType: fixed.endingType,
        oneLineSynopsis: (draft.meta?.oneLineSynopsis ?? '').slice(0, 200),
      },
      base: {
        ...draft.base,
        outlineArchitecture: {
          ...draft.base.outlineArchitecture,
          mode: fixed.architectureMode,
          data: {
            ...draft.base.outlineArchitecture.data,
            kind: fixed.architectureMode,
          },
        } as DraftBlueprint['base']['outlineArchitecture'],
        completionDesign: {
          ...draft.base.completionDesign,
          endingType: fixed.endingType,
        },
      },
      typeSpecific: {
        ...draft.typeSpecific,
        kind: fixed.typeSpecificKind,
      } as CreateStoryBlueprintInput['typeSpecific'],
    };
  }
}

interface DraftBlueprint {
  meta: {
    titleSuggestions?: string[];
    oneLineSynopsis?: string;
    novelSubgenre?: string;
    estimatedWordCount?: string;
    typeConfidence?: number;
    typeIsAuto?: boolean;
  };
  base: CreateStoryBlueprintInput['base'];
  typeSpecific: CreateStoryBlueprintInput['typeSpecific'];
}

import { agentRegistry } from './registry';
agentRegistry.register('outline-generator', (p) => new OutlineGenerator(p));
