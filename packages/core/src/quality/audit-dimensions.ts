// ─── 33 维审计维度清单 ──────────────────────────────────────────
// 硬编码维度定义，确保每次审计覆盖完整维度。
// 参考：架构文档 33 维审计 + 业界最佳实践（Claude Code Subagents / NovelWriter）

import { z } from 'zod';

// ─── Dimension Definition ──────────────────────────────────────

export interface AuditDimension {
  id: number;
  name: string;
  displayName: string;
  tier: 'blocker' | 'warning' | 'suggestion';
  weight: number;
  description: string;
}

export const AUDIT_DIMENSIONS: AuditDimension[] = [
  // 阻断级 (12) — 必须修复，否则章节不能通过
  {
    id: 1,
    name: 'character_state_consistency',
    displayName: '角色状态一致性',
    tier: 'blocker',
    weight: 1.0,
    description: '角色状态（境界/伤势/情绪/位置）是否与上一章一致',
  },
  {
    id: 2,
    name: 'entity_existence',
    displayName: '实体存在性',
    tier: 'blocker',
    weight: 1.0,
    description: '提及的实体（功法/法宝/地点/组织）是否已在前文定义',
  },
  {
    id: 3,
    name: 'timeline_continuity',
    displayName: '时间线连续性',
    tier: 'blocker',
    weight: 1.0,
    description: '时间推进是否合理，是否存在时间矛盾',
  },
  {
    id: 4,
    name: 'world_rule_compliance',
    displayName: '世界观规则遵守',
    tier: 'blocker',
    weight: 1.0,
    description: '是否违反已建立的世界规则（修炼体系/社会结构/物理法则）',
  },
  {
    id: 5,
    name: 'hook_resolution_logic',
    displayName: '伏笔回收逻辑',
    tier: 'blocker',
    weight: 1.0,
    description: '伏笔回收是否符合前期铺垫，是否存在强行回收',
  },
  {
    id: 6,
    name: 'plot_coherence',
    displayName: '情节连贯性',
    tier: 'blocker',
    weight: 1.0,
    description: '情节发展是否符合逻辑，是否存在突兀转折',
  },
  {
    id: 7,
    name: 'cause_effect_chain',
    displayName: '因果链完整性',
    tier: 'blocker',
    weight: 1.0,
    description: '事件因果关系是否完整，是否存在无因之果',
  },
  {
    id: 8,
    name: 'spatial_consistency',
    displayName: '空间一致性',
    tier: 'blocker',
    weight: 1.0,
    description: '场景空间关系是否一致，移动路径是否合理',
  },
  {
    id: 9,
    name: 'power_system_balance',
    displayName: '能力体系平衡',
    tier: 'blocker',
    weight: 1.0,
    description: '能力使用是否符合设定等级，是否存在战力崩坏',
  },
  {
    id: 10,
    name: 'identity_consistency',
    displayName: '身份一致性',
    tier: 'blocker',
    weight: 1.0,
    description: '角色身份（姓名/称号/关系）是否前后一致',
  },
  {
    id: 11,
    name: 'lore_adherence',
    displayName: '设定遵守',
    tier: 'blocker',
    weight: 1.0,
    description: '是否遵守已建立的历史/文化/种族设定',
  },
  {
    id: 12,
    name: 'contract_fulfillment',
    displayName: '大纲履约',
    tier: 'blocker',
    weight: 1.0,
    description: '章节内容是否履行本章计划中的关键事件和角色',
  },

  // 警告级 (12) — 建议修复，但章节可通过
  {
    id: 13,
    name: 'pacing_rhythm',
    displayName: '节奏韵律',
    tier: 'warning',
    weight: 0.7,
    description: '章节节奏是否张弛有度，是否存在拖沓或过快',
  },
  {
    id: 14,
    name: 'narrative_voice',
    displayName: '叙事声音',
    tier: 'warning',
    weight: 0.7,
    description: '叙事语气是否稳定，是否存在风格突变',
  },
  {
    id: 15,
    name: 'dialogue_quality',
    displayName: '对话质量',
    tier: 'warning',
    weight: 0.7,
    description: '对话是否自然，是否推动情节或展现性格',
  },
  {
    id: 16,
    name: 'description_density',
    displayName: '描写密度',
    tier: 'warning',
    weight: 0.7,
    description: '描写与叙事比例是否恰当',
  },
  {
    id: 17,
    name: 'emotional_beats',
    displayName: '情感节拍',
    tier: 'warning',
    weight: 0.7,
    description: '情感转折是否自然，是否有足够的铺垫',
  },
  {
    id: 18,
    name: 'scene_transition',
    displayName: '场景过渡',
    tier: 'warning',
    weight: 0.7,
    description: '场景切换是否平滑，读者是否能跟上空间变化',
  },
  {
    id: 19,
    name: 'tension_arc',
    displayName: '张力弧',
    tier: 'warning',
    weight: 0.7,
    description: '本章张力曲线是否合理（起承转合）',
  },
  {
    id: 20,
    name: 'pov_consistency',
    displayName: '视角一致性',
    tier: 'warning',
    weight: 0.7,
    description: '叙事视角是否稳定，是否存在越界叙述',
  },
  {
    id: 21,
    name: 'show_dont_tell',
    displayName: '展示而非讲述',
    tier: 'warning',
    weight: 0.7,
    description: '是否过多使用直接讲述而非场景展示',
  },
  {
    id: 22,
    name: 'foreshadowing_clarity',
    displayName: '铺垫清晰度',
    tier: 'warning',
    weight: 0.7,
    description: '新伏笔的铺设是否清晰，读者是否能注意到',
  },
  {
    id: 23,
    name: 'character_voice',
    displayName: '角色声音区分',
    tier: 'warning',
    weight: 0.7,
    description: '不同角色的语言风格是否有区分度',
  },
  {
    id: 24,
    name: 'opening_hook',
    displayName: '开篇钩子',
    tier: 'warning',
    weight: 0.7,
    description: '开篇是否能吸引读者继续阅读',
  },

  // 建议级 (9) — 可选优化
  {
    id: 25,
    name: 'word_choice',
    displayName: '用词选择',
    tier: 'suggestion',
    weight: 0.3,
    description: '用词是否精准，是否存在更好的表达方式',
  },
  {
    id: 26,
    name: 'sentence_variety',
    displayName: '句式多样性',
    tier: 'suggestion',
    weight: 0.3,
    description: '句式是否有变化，是否存在过度重复的句式',
  },
  {
    id: 27,
    name: 'imagery_originality',
    displayName: '意象原创性',
    tier: 'suggestion',
    weight: 0.3,
    description: '意象是否新颖，是否过度使用陈词滥调',
  },
  {
    id: 28,
    name: 'metaphor_quality',
    displayName: '比喻质量',
    tier: 'suggestion',
    weight: 0.3,
    description: '比喻是否贴切，是否增强画面感',
  },
  {
    id: 29,
    name: 'atmosphere_building',
    displayName: '氛围营造',
    tier: 'suggestion',
    weight: 0.3,
    description: '环境描写是否有效营造氛围',
  },
  {
    id: 30,
    name: 'thematic_depth',
    displayName: '主题深度',
    tier: 'suggestion',
    weight: 0.3,
    description: '是否有机融入主题思考',
  },
  {
    id: 31,
    name: 'cultural_authenticity',
    displayName: '文化真实性',
    tier: 'suggestion',
    weight: 0.3,
    description: '文化元素（历史/民俗/礼仪）是否准确',
  },
  {
    id: 32,
    name: 'genre_convention',
    displayName: '类型惯例',
    tier: 'suggestion',
    weight: 0.3,
    description: '是否充分利用类型小说的读者期待',
  },
  {
    id: 33,
    name: 'reread_value',
    displayName: '重读价值',
    tier: 'suggestion',
    weight: 0.3,
    description: '章节是否包含值得回味的细节或暗示',
  },
];

// ─── Zod Schemas ───────────────────────────────────────────────

export const AuditDimensionResultSchema = z.object({
  dimensionId: z.number().int().min(1).max(33),
  passed: z.boolean(),
  score: z.number().min(0).max(1),
  feedback: z.string(),
});

export const AuditReportSchema = z.object({
  overallStatus: z.enum(['pass', 'warning', 'fail']),
  dimensions: z.array(AuditDimensionResultSchema).length(33),
  summary: z.string(),
});

export type AuditDimensionResult = z.infer<typeof AuditDimensionResultSchema>;
export type AuditReport = z.infer<typeof AuditReportSchema>;

// ─── Helpers ───────────────────────────────────────────────────

export function getDimensionById(id: number): AuditDimension | undefined {
  return AUDIT_DIMENSIONS.find((d) => d.id === id);
}

export function getDimensionByName(name: string): AuditDimension | undefined {
  return AUDIT_DIMENSIONS.find((d) => d.name === name);
}

export function getDimensionsByTier(tier: AuditDimension['tier']): AuditDimension[] {
  return AUDIT_DIMENSIONS.filter((d) => d.tier === tier);
}

/**
 * 生成包含所有 33 维的 prompt 片段，注入到 LLM prompt 中。
 */
export function buildDimensionPromptSection(): string {
  const lines: string[] = [];
  lines.push('## 审计维度清单（共 33 维）');
  lines.push('');

  for (const tier of ['blocker', 'warning', 'suggestion'] as const) {
    const dims = getDimensionsByTier(tier);
    const tierLabel = tier === 'blocker' ? '阻断级' : tier === 'warning' ? '警告级' : '建议级';
    lines.push(`### ${tierLabel}（${dims.length} 维）`);
    for (const d of dims) {
      lines.push(`${d.id}. ${d.displayName} [${d.name}] — ${d.description}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
