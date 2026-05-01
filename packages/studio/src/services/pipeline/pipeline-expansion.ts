import {
  type LLMProvider,
  type LLMOutputRule,
  generateJSONWithValidation,
  fillDefaults,
} from '@cybernovelist/core';
import type { ExpandedInspiration } from './pipeline-helpers';

export async function expandInspiration(
  provider: LLMProvider,
  title: string,
  genre: string,
  brief: string,
  targetChapters?: number,
): Promise<ExpandedInspiration> {
  const genreExpansionHints: Record<string, string> = {
    xianxia:
      '核心设定须包含修炼体系的境界划分和突破规则；能力体系须明确灵气/真元/仙力的获取与消耗机制；演变阶段须体现从凡人到仙人到超脱的递进',
    fantasy:
      '核心设定须包含魔法/异能体系的运作规则和限制；能力体系须明确魔力来源、使用代价和成长路径；演变阶段须体现能力觉醒→掌握→超越的递进',
    urban:
      '核心设定须基于现实可推演的商业模式/技术/社会趋势；能力体系须符合现实逻辑（如商业头脑、技术专长、人脉资源）；时代背景须对应具体的现代都市社会结构',
    'sci-fi':
      '核心设定须包含可自洽推演的科技设定；能力体系须明确技术来源、使用限制和副作用；演变阶段须体现技术突破→社会冲击→适应/抵抗的辩证发展',
    history:
      '核心设定须明确具体的历史时期和年号；能力体系须受时代技术和社会制度约束；时代背景须包含该时期的权力结构、社会矛盾和关键历史事件；禁止跨时代设定',
    game: '核心设定须包含完整的游戏机制规则体系；能力体系须明确等级、技能、装备的获取路径和限制；演变阶段须体现游戏进度的新手→进阶→巅峰',
    horror:
      '核心设定须包含悬疑/恐怖事件的逻辑因果链；能力体系须明确角色可用的推理/对抗手段及其限制；演变阶段须体现谜团→线索→推理→真相的递进',
    romance:
      '核心设定须包含角色情感发展的核心驱动因素；能力体系侧重角色的人格魅力、情感表达方式和成长变化；演变阶段须体现情感从试探到深化的递进',
    fanfic:
      '核心设定须在原作世界观框架内展开；能力体系须与原作设定一致；时代背景须与原作设定对齐；禁止与原作核心设定冲突',
  };

  const genreHint = genreExpansionHints[genre] ?? '';

  const scaleHint =
    targetChapters && targetChapters > 100
      ? `\n## 目标规模\n本书计划 ${targetChapters} 章以上（超长篇），核心设定和演变阶段须足以支撑长线叙事，至少规划5个以上明确的演变阶段，矛盾主线须有多层升级路径。`
      : targetChapters && targetChapters > 30
        ? `\n## 目标规模\n本书计划约 ${targetChapters} 章（中长篇），核心设定须有3-4个演变阶段，矛盾主线须有明确的升级路径。`
        : '';

  const prompt = `你是一位资深网络小说策划师。用户给出了一个创作灵感，请将其扩展为结构化创作简报。\n\n## 书名\n${title}\n\n## 题材\n${genre}\n\n## 用户灵感\n${brief}\n${scaleHint}\n\n## 关键词分析\n请仔细分析用户灵感中的核心概念，忠实还原用户意图，不可曲解或替换用户使用的词汇。例如：\n- 如果用户说"仓库"，指的是物理仓储/物资存储空间，不可理解为"知识库""策略库""技能库"\n- 如果用户说"穿越"，指的是现代人穿越到古代，不可理解为"时空旅行者"或"本地人觉醒"\n- 如果用户说"战略"，在军事语境下指的是战略级别的物资/资源/军事能力，不可理解为"策略""计策""兵法"\n- 如果用户说"战略仓库"，这是一个整体概念，指军事战略级别的物资储备仓库，包含武器、装备、粮草、军需品等实体物资，而不是游戏化的"背包"或"空间"系统\n- 禁止自行添加用户灵感中未提及的设定（如"精神力""灵力""修仙体系"等），能力体系的限制和代价必须基于现实军事/物流逻辑\n\n## 题材扩展指引\n${genreHint}\n\n## 输出要求\n\n请输出 JSON，包含以下字段：\n\n1. corePremise（字符串）：核心设定，**必须忠实还原用户灵感中的核心概念**。详细描述：\n   - 用户灵感中的金手指到底是什么（不可擅自替换为"知识""策略""技能"等概念）\n   - 金手指如何运作：来源、触发条件、使用方式\n   - 有什么限制和代价（数量限制、使用代价、副作用）\n   - 随故事推进会经历什么演变阶段（至少3个阶段，每阶段要有具体变化）\n\n2. eraContext（字符串）：时代背景。包括：\n   - 具体历史时期和年号（不可跨时代）\n   - 该时代的权力结构和社会特征\n   - 与主角设定相关的关键历史事件\n\n3. centralConflict（字符串）：贯穿全书的矛盾主线。需具体描述：\n   - 主角面临的核心两难（需与核心设定直接绑定）\n   - 外部压力的来源和升级路径\n   - 矛盾的最终解决方向\n\n4. protagonistPosition（字符串）：主角定位。包括：\n   - 起始身份（现代人穿越后的初始处境）\n   - 核心优势（来自金手指）和致命弱点（对金手指的依赖）\n   - 终局目标和代价\n\n5. powerSystem（字符串）：能力体系的约束与成长。包括：\n   - 金手指的资源/能力具体是什么（不可笼统说"知识"或"策略"，必须具体到物资类型、功能范围）\n   - 使用代价和限制条件（每次使用的消耗、恢复机制、容量限制）\n   - 成长/升级的里程碑（容量扩大、功能解锁、副作用减弱等）\n\n每个字段至少 200 字，确保内容具体、有细节、可操作。**核心设定必须与用户灵感的原始含义一致，不可自由曲解。**`;

  const EXPANSION_RULES: LLMOutputRule[] = [
    { field: 'corePremise', type: 'min_string_length', min: 50 },
    { field: 'eraContext', type: 'min_string_length', min: 50 },
    { field: 'centralConflict', type: 'min_string_length', min: 50 },
    { field: 'protagonistPosition', type: 'min_string_length', min: 50 },
    { field: 'powerSystem', type: 'min_string_length', min: 50 },
  ];

  const genreDefaultFallbacks: Record<string, ExpandedInspiration> = {
    xianxia: {
      corePremise: `${brief}的核心设定：主角踏上修仙之路，修炼体系有明确的境界划分与突破规则，随故事推进会逐步提升修为，但有天劫和心魔等限制与代价。`,
      eraContext: `故事设定在一个修仙世界，存在宗门、散修和妖族等势力，权力结构以修为境界为尊。`,
      centralConflict: `主角在修仙之路上面临资源争夺、宗门倾轧和天劫考验，须在修炼与入世之间寻找平衡。`,
      protagonistPosition: `主角从凡人起步，凭借机缘和悟性逐步崛起，但过度依赖外力可能导致根基不稳，终局目标是超脱天道。`,
      powerSystem: `修炼体系分练气、筑基、金丹等境界，突破需机缘和资源，每次突破都有心魔考验，境界越高天劫越强。`,
    },
    fantasy: {
      corePremise: `${brief}的核心设定：主角觉醒了独特的魔法/异能，有明确的运作规则和限制，随故事推进会逐步掌握和超越。`,
      eraContext: `故事设定在一个魔法与异能并存的世界，存在公会、王国和暗势力等多方势力。`,
      centralConflict: `主角在探索自身能力的同时，卷入了更大的势力纷争，必须在成长与抉择中找到自己的道路。`,
      protagonistPosition: `主角从能力觉醒起步，凭借独特异能逐步崛起，但能力使用有代价，终局目标是掌握真正的力量。`,
      powerSystem: `能力体系有明确的魔力来源和使用限制，过度使用会导致反噬，随修为提升可解锁新能力但代价递增。`,
    },
    urban: {
      corePremise: `${brief}的核心设定：主角在现代社会中获得了独特优势，基于现实可推演的商业/技术/人脉体系运作。`,
      eraContext: `故事设定在当代都市，社会结构以商业和人际网络为核心，权力来自财富和影响力。`,
      centralConflict: `主角在利用自身优势获得发展空间的同时，面临职场竞争、人际纠葛和道德抉择。`,
      protagonistPosition: `主角从底层起步，凭借独特优势逐步逆袭，但过度依赖可能导致信任危机，终局目标是实现真正的自我价值。`,
      powerSystem: `核心优势基于现实逻辑（商业头脑、技术专长、人脉资源），使用需付出时间或信誉代价，成长路径依赖积累和决策。`,
    },
    'sci-fi': {
      corePremise: `${brief}的核心设定：基于可自洽推演的科技设定，主角的技术突破有明确的科学依据和使用限制。`,
      eraContext: `故事设定在科技高度发展的未来或平行世界，社会结构受技术深度影响，存在技术垄断和资源争夺。`,
      centralConflict: `主角的技术突破引发了社会冲击，必须在技术进步与伦理边界之间做出抉择。`,
      protagonistPosition: `主角从技术突破者起步，在技术与社会碰撞中逐步成长，但技术依赖可能带来副作用，终局目标是找到技术与人文的平衡。`,
      powerSystem: `技术体系有明确的运作规则和副作用，过度使用会导致不可逆的后果，技术升级需要解决新的难题。`,
    },
    history: {
      corePremise: `${brief}的核心设定：主角置身于特定历史时期，必须在真实的历史框架和权力结构中寻找生存与发展之路。`,
      eraContext: `故事设定在具体的历史时期，权力结构和社会制度受时代约束，重大历史事件不可更改。`,
      centralConflict: `主角在历史洪流中面临权谋与道义的抉择，须在维护自身利益与顺应大势之间寻找出路。`,
      protagonistPosition: `主角从小人物或特殊身份起步，凭借对历史的洞察逐步崛起，但改变历史可能带来不可预知的后果。`,
      powerSystem: `能力受时代技术和社会制度约束，成长依赖人脉和时机，不可逾越时代限制。`,
    },
    game: {
      corePremise: `${brief}的核心设定：故事在游戏或类游戏世界中展开，有完整的等级、技能和装备体系。`,
      eraContext: `故事设定在虚拟游戏世界或游戏化的现实，规则明确、数据可见，存在玩家和NPC的复杂关系。`,
      centralConflict: `主角在游戏世界中追求巅峰，但游戏规则的深层秘密和现实世界的联系构成了核心矛盾。`,
      protagonistPosition: `主角从新手起步，凭借独特策略和机遇逐步升级，但过度投入游戏可能导致现实与虚拟的失衡。`,
      powerSystem: `游戏机制明确（等级、技能、装备），升级需经验和资源，存在稀有道具和隐藏职业，成长路径依赖策略选择。`,
    },
    horror: {
      corePremise: `${brief}的核心设定：故事围绕悬疑/恐怖事件展开，事件背后有严密的逻辑因果链，真相逐步揭示。`,
      eraContext: `故事设定在一个暗藏秘密的环境中，表面平静下暗流涌动，每个角色都可能隐藏着关键信息。`,
      centralConflict: `主角在追寻真相的过程中面临层层危险和心理考验，必须在恐惧与理性之间保持平衡。`,
      protagonistPosition: `主角从旁观者或意外卷入者起步，凭借推理能力和勇气逐步接近真相，但每次深入都伴随更大的风险。`,
      powerSystem: `推理和对抗手段受现实约束，信息获取需付出代价（冒险、信任风险），线索拼接是成长的核心方式。`,
    },
    romance: {
      corePremise: `${brief}的核心设定：故事围绕角色之间的情感发展展开，核心驱动因素与人物性格和处境深度绑定。`,
      eraContext: `故事设定在特定的社交和情感环境中，人物关系错综复杂，情感发展受社会规范和个人经历影响。`,
      centralConflict: `主角在情感追求与现实阻碍之间挣扎，必须在自我成长与亲密关系之间找到平衡。`,
      protagonistPosition: `主角从情感试探起步，在相处中逐步深化情感，但情感依赖可能导致自我迷失，终局目标是实现独立而深刻的情感联结。`,
      powerSystem: `情感能力体现为人格魅力、共情能力和表达方式，成长表现为从自我封闭到开放信任，每步推进需面对内心创伤。`,
    },
    fanfic: {
      corePremise: `${brief}的核心设定：故事在原作世界观框架内展开，与原作设定保持一致，不可与原作核心设定冲突。`,
      eraContext: `故事沿用原作的时代背景和世界观，权力结构和社会规则与原作对齐。`,
      centralConflict: `主角在原作世界线中面临新的挑战，必须在遵循原作逻辑的同时探索新的可能性。`,
      protagonistPosition: `主角从原作中的特定位置起步，凭借对原作剧情的了解或独特能力介入，但改变剧情可能引发蝴蝶效应。`,
      powerSystem: `能力体系与原作设定一致，成长路径受原作规则约束，新能力需与原作逻辑自洽。`,
    },
  };

  const EXPANSION_DEFAULTS: ExpandedInspiration = genreDefaultFallbacks[genre] ?? {
    corePremise: `${brief}的核心设定：主角拥有独特的优势，能在特定条件下触发使用，但有明确的限制和代价，随故事推进会逐步演变和升级。`,
    eraContext: `故事设定在一个具有独特社会结构和权力体系的时代，主角需要在其中找到自己的位置和生存之道。`,
    centralConflict: `主角在利用自身优势获得发展空间的同时，面临外部环境的压力和内部成长的挑战，需要在矛盾中不断抉择和突破。`,
    protagonistPosition: `主角从一个特殊身份起步，凭借独特优势逐步崛起，但也面临依赖优势的风险，最终目标是实现真正的独立和成长。`,
    powerSystem: `主角的核心能力有明确的运作规则、使用限制和成长路径，每次使用都有消耗和代价，能力随故事推进逐步解锁新功能。`,
  };

  try {
    const result = await generateJSONWithValidation<ExpandedInspiration>(
      provider,
      prompt,
      EXPANSION_RULES,
      {
        temperature: 0.7,
        agentName: 'InspirationExpander',
        retry: { maxRetries: 2, retryDelayMs: 1000 },
      },
    );
    return fillDefaults(
      {
        corePremise: typeof result.corePremise === 'string' ? result.corePremise : '',
        eraContext: typeof result.eraContext === 'string' ? result.eraContext : '',
        centralConflict: typeof result.centralConflict === 'string' ? result.centralConflict : '',
        protagonistPosition:
          typeof result.protagonistPosition === 'string' ? result.protagonistPosition : '',
        powerSystem: typeof result.powerSystem === 'string' ? result.powerSystem : '',
      },
      EXPANSION_DEFAULTS,
    );
  } catch {
    return EXPANSION_DEFAULTS;
  }
}
