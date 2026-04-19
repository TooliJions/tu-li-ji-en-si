// ─── Fanfic Mode Definition ──────────────────────────────────────

export enum FanficMode {
  CANON = 'canon',
  AU = 'au',
  OOC = 'ooc',
  CP = 'cp',
}

export interface FanficConstraint {
  mode: string;
  must: string[];
  can: string[];
  cannot: string[];
}

// ─── Mode-specific Constraint Definitions ────────────────────────

const CANON_CONSTRAINTS: FanficConstraint = {
  mode: FanficMode.CANON,
  must: [
    '遵循原作世界观和角色设定',
    '不改变已确立的情节线和人物关系',
    '保持角色的语言风格和行为习惯一致',
    '新情节必须与现有时间线兼容',
  ],
  can: ['填充原作中未详细描写的场景', '从配角视角补充叙事', '深化已有角色互动'],
  cannot: ['更改角色死亡、身份等关键设定', '引入与原作矛盾的世界观元素'],
};

const AU_CONSTRAINTS: FanficConstraint = {
  mode: FanficMode.AU,
  must: ['角色核心特质必须保留', '新世界观设定需自洽', '在新设定下重新诠释角色关系'],
  can: ['自由构建世界观', '改变时代背景、社会制度、职业设定', '重新设计角色相遇方式'],
  cannot: ['完全抹除角色辨识度和核心动机', '让设定与角色行为产生内在矛盾'],
};

const OOC_CONSTRAINTS: FanficConstraint = {
  mode: FanficMode.OOC,
  must: [
    '角色性格可以发生显著偏离',
    '性格变化需要有合理的触发事件或内心动机',
    '探索"如果TA不是这样"的可能性',
  ],
  can: [
    '反转角色性格（如内向变外向）',
    '改变角色的价值观和优先级',
    '让角色做出与原作截然不同的选择',
  ],
  cannot: ['无理由的性格突变', '让角色变成完全陌生的存在'],
};

const CP_CONSTRAINTS: FanficConstraint = {
  mode: FanficMode.CP,
  must: ['以角色配对关系为核心驱动', '情感线是叙事的主要推动力', '角色互动需服务于配对发展'],
  can: ['围绕配对设计情节冲突和解决', '深入刻画配对双方的心理变化', '引入配角推动配对关系发展'],
  cannot: ['让主线叙事完全脱离配对关系', '忽略配对中任何一方的角色发展'],
};

const CONSTRAINT_MAP: Record<string, FanficConstraint> = {
  [FanficMode.CANON]: CANON_CONSTRAINTS,
  [FanficMode.AU]: AU_CONSTRAINTS,
  [FanficMode.OOC]: OOC_CONSTRAINTS,
  [FanficMode.CP]: CP_CONSTRAINTS,
};

// ─── Public API ──────────────────────────────────────────────────

/**
 * Build constraint object for a given fanfic mode.
 */
export function buildFanficConstraints(mode: string): FanficConstraint {
  const c = CONSTRAINT_MAP[mode];
  if (!c) {
    return { mode, must: [], can: [], cannot: [] };
  }
  return { ...c };
}

/**
 * Build a complete prompt with fanfic constraints injected.
 */
export function buildFanficPrompt(
  mode: string,
  description: string,
  canonReference?: string
): string {
  const constraints = buildFanficConstraints(mode);
  const modeLabel = mode.toUpperCase();

  const parts: string[] = [`【同人模式：${modeLabel}】`, '', '## 创作约束', ''];

  if (constraints.must.length > 0) {
    parts.push('### 必须做到');
    parts.push(...constraints.must.map((c) => `- ${c}`), '');
  }

  if (constraints.can.length > 0) {
    parts.push('### 允许');
    parts.push(...constraints.can.map((c) => `- ${c}`), '');
  }

  if (constraints.cannot.length > 0) {
    parts.push('### 禁止');
    parts.push(...constraints.cannot.map((c) => `- ${c}`), '');
  }

  if (description) {
    parts.push('## 同人设定描述', '', description, '');
  }

  if (canonReference) {
    parts.push('## 正典参考', '', canonReference, '');
  }

  return parts.join('\n');
}

/**
 * Apply fanfic mode constraints to an existing base prompt.
 * Returns the augmented prompt.
 */
export function applyFanficMode(mode: string, basePrompt: string, canonReference?: string): string {
  if (!mode) {
    throw new Error('同人模式不能为空');
  }
  const constraintBlock = buildFanficPrompt(mode, '', canonReference);
  return `${constraintBlock}\n\n---\n\n${basePrompt}`;
}
