export interface GenreTemplate {
  value: string;
  summary: string;
  pace: string;
  focus: string;
}

export const GENRE_TEMPLATES: GenreTemplate[] = [
  {
    value: '都市',
    summary: '现实节奏快，强调职业、逆袭与连续爆点。',
    pace: '快节奏成长',
    focus: '身份跃迁 / 社会关系',
  },
  {
    value: '玄幻',
    summary: '等级体系明确，适合资源争夺和大世界推进。',
    pace: '阶段式升级',
    focus: '体系成长 / 宗门冲突',
  },
  {
    value: '科幻',
    summary: '强调设定自洽和技术想象，适合宏观议题展开。',
    pace: '设定递进',
    focus: '世界观 / 技术伦理',
  },
  {
    value: '仙侠',
    summary: '适合长线修行、因果布局和门派势力扩张。',
    pace: '长线修行',
    focus: '境界突破 / 因果回收',
  },
  {
    value: '历史',
    summary: '依赖时代氛围与权力博弈，适合稳态经营和群像。',
    pace: '稳步推进',
    focus: '时代细节 / 权谋演化',
  },
  {
    value: '悬疑',
    summary: '强依赖谜面与回收，适合高密度伏笔编排。',
    pace: '张力递增',
    focus: '线索设计 / 节奏控制',
  },
  {
    value: '游戏',
    summary: '系统反馈明确，适合任务链和规则升级驱动。',
    pace: '任务驱动',
    focus: '数值成长 / 副本结构',
  },
  {
    value: '同人',
    summary: '基于既有 IP 展开，适合关系改写与世界线变奏。',
    pace: '高识别进入',
    focus: '角色关系 / 世界线偏移',
  },
  {
    value: '其他',
    summary: '用于混合题材或实验表达，保留最大自由度。',
    pace: '自定义',
    focus: '自由组合 / 手工定义',
  },
];

export const BOOK_CREATE_GENRE_OPTIONS = GENRE_TEMPLATES.map((item) => item.value);
