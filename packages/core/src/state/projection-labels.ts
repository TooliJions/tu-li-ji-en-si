// ─── Projection Label Maps ─────────────────────────────────────
// Markdown 投影渲染使用的标签映射常量。

export const HOOK_STATUS_LABELS: Record<string, string> = {
  open: '进行中 (open)',
  progressing: '推进中 (progressing)',
  deferred: '延后 (deferred)',
  dormant: '休眠 (dormant)',
  resolved: '已回收 (resolved)',
  abandoned: '已废弃 (abandoned)',
};

export const CHARACTER_ROLE_LABELS: Record<string, string> = {
  protagonist: '主角',
  antagonist: '反派',
  supporting: '配角',
  minor: '路人',
};

export const FACT_CATEGORY_LABELS: Record<string, string> = {
  character: '角色',
  world: '世界观',
  plot: '剧情',
  timeline: '时间线',
  resource: '资源',
};

export const CONFIDENCE_LABELS: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
};
