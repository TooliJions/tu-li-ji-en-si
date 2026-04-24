/**
 * ChapterExecutor 测试数据配置
 *
 * 集中管理所有测试用大纲、文风违禁词表、验证阈值等配置，
 * 避免在测试文件中硬编码任何题材相关数据。
 * 所有数据均可通过参数覆盖，支持灵活扩展新题材。
 */

import type { ChapterPlan } from './chapter-planner';
import type { ChapterExecutionInput } from './executor';

// ─── 题材测试大纲配置 ────────────────────────────────────────

export interface GenreTestPlan {
  genre: string;
  input: Omit<ChapterExecutionInput, 'plan'>;
  plan: ChapterPlan;
  /** 该题材不应出现的违禁词（用于文风一致性验证） */
  forbiddenWords: string[];
  /** 该题材 prompt 中应包含的文风关键词 */
  styleKeywords: string[];
}

/** 所有题材的测试配置，按题材名索引 */
export const GENRE_TEST_PLANS: Record<string, GenreTestPlan> = {
  xianxia: {
    genre: 'xianxia',
    input: {
      title: '修仙之路',
      genre: 'xianxia',
      brief: '一个普通少年从山村走出，踏上修仙之路的故事',
      chapterNumber: 1,
    },
    plan: {
      chapterNumber: 1,
      title: '山村少年',
      intention: '介绍主角林风的身份、性格和山村生活，并引出修仙世界',
      wordCountTarget: 3000,
      characters: ['林风', '老猎人', '村长'],
      keyEvents: [
        '林风在打猎时发现神秘玉佩',
        '老猎人讲述修仙世界的存在',
        '林风决定离开山村探索玉佩秘密',
      ],
      hooks: [
        { description: '神秘玉佩的来历', type: 'narrative', priority: 'critical' },
        { description: '老猎人的真实身份', type: 'character', priority: 'high' },
      ],
      worldRules: ['修炼分为炼气、筑基、金丹三个阶段', '凡人无法感知灵气'],
      emotionalBeat: '平静→好奇→向往',
      sceneTransition: '从山村日常过渡到修仙世界的门槛',
      openingHook: '林风手中的玉佩突然散发出微弱的蓝光，照亮了黑暗的山洞',
      closingHook: '老猎人临别时的话在林风耳边回响：玉佩选择你，便是天命',
      sceneBreakdown: [
        {
          title: '山中猎行',
          description: '林风独自进山打猎，展示其生存技能和性格坚毅',
          characters: ['林风'],
          mood: '平静',
          wordCount: 800,
        },
        {
          title: '洞穴奇遇',
          description: '林风追猎进入山洞，发现玉佩，玉佩发光震动',
          characters: ['林风'],
          mood: '惊奇',
          wordCount: 1000,
        },
        {
          title: '老人述秘',
          description: '老猎人辨认玉佩来历，讲述修仙世界',
          characters: ['林风', '老猎人'],
          mood: '震撼',
          wordCount: 1200,
        },
      ],
      characterGrowthBeat: '林风从懵懂少年开始觉醒对未知世界的渴望',
      hookActions: [
        { action: 'plant', description: '神秘玉佩首次展露异常' },
        { action: 'advance', description: '老猎人暗示自己曾见过修仙者' },
      ],
      pacingTag: 'slow_build',
    },
    forbiddenWords: ['公司', '经理', '职场', '办公室', '打卡', '开会', '项目'],
    styleKeywords: ['修炼描写须有具体的境界感知和灵气运行', '斗法场景须有招式名'],
  },

  urban: {
    genre: 'urban',
    input: {
      title: '都市逆袭',
      genre: 'urban',
      brief: '一个农村青年在大都市的职场逆袭之路',
      chapterNumber: 1,
    },
    plan: {
      chapterNumber: 1,
      title: '初入职场',
      intention: '主角陆风初到都市，展示其不屈性格和职场初遇',
      wordCountTarget: 3000,
      characters: ['陆风', '苏晴', '王经理'],
      keyEvents: [
        '陆风第一天入职遭遇冷落',
        '苏晴主动帮助陆风熟悉公司',
        '王经理布置不可能完成的任务',
      ],
      hooks: [{ description: '王经理的针对意图', type: 'character', priority: 'high' }],
      worldRules: ['公司内部派系斗争激烈'],
      emotionalBeat: '紧张→感动→不甘',
      sceneTransition: '从陌生环境到逐渐适应',
      openingHook: '陆风推开公司大门的那一刻，就感受到了异样的目光',
      closingHook: '王经理嘴角露出一丝不易察觉的冷笑',
      sceneBreakdown: [
        {
          title: '入职',
          description: '陆风入职第一天',
          characters: ['陆风'],
          mood: '紧张',
          wordCount: 800,
        },
        {
          title: '相遇',
          description: '苏晴帮助陆风',
          characters: ['陆风', '苏晴'],
          mood: '温暖',
          wordCount: 1000,
        },
        {
          title: '刁难',
          description: '王经理布置任务',
          characters: ['陆风', '王经理'],
          mood: '压抑',
          wordCount: 1200,
        },
      ],
      characterGrowthBeat: '陆风在逆境中展现韧性',
      hookActions: [{ action: 'plant', description: '王经理对陆风的态度暗示背后隐情' }],
      pacingTag: 'rising',
    },
    forbiddenWords: ['修炼', '灵气', '飞剑', '道友', '筑基', '金丹', '法宝', '仙人'],
    styleKeywords: ['对话贴近真实口语', '行业术语和流程细节'],
  },

  romance: {
    genre: 'romance',
    input: {
      title: '倾城之恋',
      genre: 'romance',
      brief: '一段跨越时空的爱恋',
      chapterNumber: 1,
    },
    plan: {
      chapterNumber: 1,
      title: '初见倾心',
      intention: '男女主角初次相遇，建立情感起点',
      wordCountTarget: 2500,
      characters: ['沈婉', '顾南城'],
      keyEvents: ['沈婉在书店偶遇顾南城', '两人因同一本书产生交集', '顾南城留下联系方式后匆匆离去'],
      hooks: [{ description: '顾南城的神秘身份', type: 'character', priority: 'critical' }],
      worldRules: ['故事发生在现代都市背景下'],
      emotionalBeat: '好奇→心动→期待',
      sceneTransition: '从独处到相遇',
      openingHook: '沈婉伸手去拿书架上那本旧版诗集时，另一只手同时伸了过来',
      closingHook: '那张名片上的名字，她总觉得在哪里见过',
      sceneBreakdown: [
        {
          title: '书店',
          description: '沈婉独自逛书店',
          characters: ['沈婉'],
          mood: '安静',
          wordCount: 800,
        },
        {
          title: '交集',
          description: '两人因书结缘',
          characters: ['沈婉', '顾南城'],
          mood: '心动',
          wordCount: 900,
        },
        {
          title: '离别',
          description: '顾南城留下名片离去',
          characters: ['沈婉', '顾南城'],
          mood: '期待',
          wordCount: 800,
        },
      ],
      characterGrowthBeat: '沈婉从封闭自我到重新产生对人际关系的期待',
      hookActions: [{ action: 'plant', description: '顾南城名片上的公司名暗示其不凡身份' }],
      pacingTag: 'slow_build',
    },
    forbiddenWords: ['修炼', '灵气', '飞剑', '公司经理', '项目经理'],
    styleKeywords: ['情感描写须有具体的心理活动和身体语言', '关系进展须有可见的行为变化'],
  },

  'sci-fi': {
    genre: 'sci-fi',
    input: {
      title: '星际迷途',
      genre: 'sci-fi',
      brief: '人类在星际间的冒险故事',
      chapterNumber: 1,
    },
    plan: {
      chapterNumber: 1,
      title: '飞船启航',
      intention: '主角踏上星际探索旅程',
      wordCountTarget: 2500,
      characters: ['陈舰长', 'AI助手'],
      keyEvents: ['陈舰长接收远航指令', '飞船进入跃迁状态', '发现异常信号源'],
      hooks: [{ description: '异常信号的来源', type: 'narrative', priority: 'critical' }],
      worldRules: ['星际航行依赖跃迁引擎', 'AI系统辅助决策但不拥有自主意识'],
      emotionalBeat: '平静→紧张→警觉',
      sceneTransition: '从港口出发到深空航行',
      openingHook: '跃迁引擎的嗡鸣声中，陈舰长凝视着星图上那片空白区域',
      closingHook: '那个不该存在的信号，正从空白区域深处传来',
      sceneBreakdown: [
        {
          title: '启航',
          description: '接收指令启航',
          characters: ['陈舰长'],
          mood: '沉稳',
          wordCount: 800,
        },
        {
          title: '跃迁',
          description: '进入跃迁状态',
          characters: ['陈舰长', 'AI助手'],
          mood: '紧张',
          wordCount: 900,
        },
        {
          title: '信号',
          description: '发现异常信号',
          characters: ['陈舰长', 'AI助手'],
          mood: '警觉',
          wordCount: 800,
        },
      ],
      characterGrowthBeat: '陈舰长从服从命令到独立判断',
      hookActions: [{ action: 'plant', description: '异常信号与陈舰长过去的经历可能相关' }],
      pacingTag: 'rising',
    },
    forbiddenWords: ['修炼', '灵气', '飞剑', '道友'],
    styleKeywords: ['科技描写须有原理解释和使用限制', '未来场景须有具体的设备、界面、环境描写'],
  },

  history: {
    genre: 'history',
    input: {
      title: '权谋天下',
      genre: 'history',
      brief: '春秋战国间的权谋故事',
      chapterNumber: 1,
    },
    plan: {
      chapterNumber: 1,
      title: '朝堂风云',
      intention: '主角入朝，展现朝堂权谋博弈',
      wordCountTarget: 2500,
      characters: ['韩相', '赵使'],
      keyEvents: ['韩相设宴款待赵使', '赵使暗藏图谋', '韩相识破来意'],
      hooks: [{ description: '赵使真实目的', type: 'narrative', priority: 'critical' }],
      worldRules: ['列国纵横捭阖，朝堂之上暗流涌动'],
      emotionalBeat: '从容→暗涌→锋芒',
      sceneTransition: '从觥筹交错到暗藏杀机',
      openingHook: '韩相端起酒盏，目光越过满堂宾客，落在赵使微微颤抖的手上',
      closingHook: '赵使退下时，韩相对侍从低语：加强城防',
      sceneBreakdown: [
        {
          title: '设宴',
          description: '韩相设宴',
          characters: ['韩相'],
          mood: '从容',
          wordCount: 800,
        },
        {
          title: '试探',
          description: '赵使暗藏图谋',
          characters: ['韩相', '赵使'],
          mood: '暗涌',
          wordCount: 900,
        },
        {
          title: '识破',
          description: '韩相识破来意',
          characters: ['韩相', '赵使'],
          mood: '锋芒',
          wordCount: 800,
        },
      ],
      characterGrowthBeat: '韩相从隐忍到果断出击',
      hookActions: [{ action: 'advance', description: '赵使的来意与先前情报相互印证' }],
      pacingTag: 'slow_build',
    },
    forbiddenWords: ['修炼', '灵气', '公司', '经理', '职场'],
    styleKeywords: ['语言风格须贴近所设定时代', '权谋斗争须有具体的利益考量和博弈过程'],
  },

  horror: {
    genre: 'horror',
    input: {
      title: '迷雾追踪',
      genre: 'horror',
      brief: '连环失踪案的追踪故事',
      chapterNumber: 1,
    },
    plan: {
      chapterNumber: 1,
      title: '第一具尸体',
      intention: '侦探接到案件，建立悬疑基调',
      wordCountTarget: 2500,
      characters: ['周探', '法医'],
      keyEvents: ['周探接到报案赶赴现场', '尸体呈现异常死状', '现场发现指向旧案的线索'],
      hooks: [{ description: '尸体上的旧案标记', type: 'narrative', priority: 'critical' }],
      worldRules: ['所有超自然现象最终须有合理解释'],
      emotionalBeat: '平静→不安→恐惧',
      sceneTransition: '从日常到踏入迷雾',
      openingHook: '凌晨三点的电话铃声，总是带来坏消息',
      closingHook: '法医颤抖着说：这个伤口形状，我十年前见过',
      sceneBreakdown: [
        {
          title: '来电',
          description: '周探接到报案',
          characters: ['周探'],
          mood: '平静',
          wordCount: 700,
        },
        {
          title: '现场',
          description: '赶赴现场勘查',
          characters: ['周探', '法医'],
          mood: '不安',
          wordCount: 900,
        },
        {
          title: '线索',
          description: '发现旧案关联',
          characters: ['周探', '法医'],
          mood: '恐惧',
          wordCount: 900,
        },
      ],
      characterGrowthBeat: '周探从旁观者转变为执念于真相的追查者',
      hookActions: [{ action: 'plant', description: '尸体上的旧案标记暗示连环作案' }],
      pacingTag: 'slow_build',
    },
    forbiddenWords: ['修炼', '灵气', '公司', '经理', '飞剑'],
    styleKeywords: ['氛围营造须有感官细节', '悬念须通过反常细节和角色心理渐进构建'],
  },

  game: {
    genre: 'game',
    input: {
      title: '全服第一',
      genre: 'game',
      brief: '从零开始的游戏逆袭之路',
      chapterNumber: 1,
    },
    plan: {
      chapterNumber: 1,
      title: '新手村',
      intention: '主角进入游戏，展现游戏机制魅力',
      wordCountTarget: 2500,
      characters: ['玩家叶秋', 'NPC引导员'],
      keyEvents: ['叶秋创建角色进入游戏', '完成新手任务获得首件装备', '触发隐藏任务'],
      hooks: [{ description: '隐藏任务的奖励', type: 'narrative', priority: 'critical' }],
      worldRules: ['游戏有等级、技能、装备三大系统', '隐藏任务触发条件极其苛刻'],
      emotionalBeat: '好奇→兴奋→惊喜',
      sceneTransition: '从现实登录到虚拟世界',
      openingHook: '当叶秋按下确认键的那一刻，整个视野被蓝光吞没',
      closingHook: '系统提示：您触发了隐藏任务——失落的王冠',
      sceneBreakdown: [
        {
          title: '登录',
          description: '创建角色进入游戏',
          characters: ['玩家叶秋'],
          mood: '好奇',
          wordCount: 800,
        },
        {
          title: '新手',
          description: '完成新手任务',
          characters: ['玩家叶秋', 'NPC引导员'],
          mood: '兴奋',
          wordCount: 900,
        },
        {
          title: '隐藏',
          description: '触发隐藏任务',
          characters: ['玩家叶秋'],
          mood: '惊喜',
          wordCount: 800,
        },
      ],
      characterGrowthBeat: '叶秋从随意玩玩到认真对待游戏',
      hookActions: [{ action: 'plant', description: '隐藏任务暗示游戏背后有更大的秘密' }],
      pacingTag: 'rising',
    },
    forbiddenWords: ['修炼', '灵气', '飞剑', '道友', '筑基'],
    styleKeywords: ['游戏机制须通过角色操作自然展示', '升级/获得装备须有属性数据和能力描述'],
  },
};

// ─── 验证阈值配置 ──────────────────────────────────────────────

export interface ValidationThresholds {
  /** 角色名覆盖率下限（0~1） */
  characterCoverageMin: number;
  /** 关键事件覆盖率下限（0~1） */
  keyEventCoverageMin: number;
  /** 字数与目标比率下限 */
  wordCountRatioMin: number;
  /** 字数与目标比率上限 */
  wordCountRatioMax: number;
  /** 世界观关键词匹配率下限（0~1） */
  worldRuleKeywordMatchMin: number;
  /** 伏笔覆盖数量下限 */
  hookCoverageMin: number;
  /** 最小段落数 */
  minParagraphCount: number;
  /** LLM 测试超时（ms） */
  llmTestTimeout: number;
}

export const DEFAULT_THRESHOLDS: ValidationThresholds = {
  characterCoverageMin: 2 / 3,
  keyEventCoverageMin: 2 / 3,
  wordCountRatioMin: 0.5,
  wordCountRatioMax: 1.5,
  worldRuleKeywordMatchMin: 0.3,
  hookCoverageMin: 1,
  minParagraphCount: 3,
  llmTestTimeout: 120_000,
};

// ─── 工具函数 ─────────────────────────────────────────────────

/** 从 GenreTestPlan 构建完整的 ChapterExecutionInput */
export function buildInput(config: GenreTestPlan): ChapterExecutionInput {
  return {
    ...config.input,
    plan: config.plan,
  };
}

/** 从 GenreTestPlan 的 plan 构建带 overrides 的新 plan */
export function buildPlan(
  config: GenreTestPlan,
  overrides: Partial<ChapterPlan> = {}
): ChapterPlan {
  return { ...config.plan, ...overrides };
}
