// ─── Types ─────────────────────────────────────────────────────────

export type AICategory =
  | 'cliche-phrase'
  | 'monotonous-syntax'
  | 'analytical-report'
  | 'meta-narrative'
  | 'imagery-repetition'
  | 'semantic-repetition'
  | 'logic-gap'
  | 'false-emotion'
  | 'hollow-description';

export interface AIDetectionIssue {
  text: string;
  detail?: string;
  startOffset?: number;
  endOffset?: number;
}

export interface CategoryResult {
  category: AICategory;
  score: number; // 0-100
  severity: 'none' | 'low' | 'medium' | 'high';
  issues: AIDetectionIssue[];
}

export interface AIDetectionReport {
  text: string;
  categories: CategoryResult[];
  overallScore: number;
}

export interface DetectorOptions {
  weights?: Partial<Record<AICategory, number>>;
}

// ─── Constants ─────────────────────────────────────────────────────

const CATEGORY_NAMES: AICategory[] = [
  'cliche-phrase',
  'monotonous-syntax',
  'analytical-report',
  'meta-narrative',
  'imagery-repetition',
  'semantic-repetition',
  'logic-gap',
  'false-emotion',
  'hollow-description',
];

const DEFAULT_WEIGHTS: Record<AICategory, number> = {
  'cliche-phrase': 0.15,
  'monotonous-syntax': 0.12,
  'analytical-report': 0.16,
  'meta-narrative': 0.11,
  'imagery-repetition': 0.1,
  'semantic-repetition': 0.12,
  'logic-gap': 0.08,
  'false-emotion': 0.08,
  'hollow-description': 0.08,
};

// ─── Severity thresholds ───────────────────────────────────────────

export function classifySeverity(score: number): 'none' | 'low' | 'medium' | 'high' {
  if (score <= 15) return 'none';
  if (score <= 35) return 'low';
  if (score <= 65) return 'medium';
  return 'high';
}

// ─── Detectors ─────────────────────────────────────────────────────

interface DetectorFn {
  (text: string): { score: number; issues: AIDetectionIssue[] };
}

/**
 * AI套话检测：识别常见AI生成套话模式。
 */
export function detectClichePhrases(text: string): { score: number; issues: AIDetectionIssue[] } {
  const patterns = [
    { re: /夜幕降临|华灯初上|霓虹闪烁|灯火通明/, label: '夜景套话' },
    { re: /在这个.*时代|日新月异|前所未有|机遇与挑战/, label: '时代套话' },
    { re: /岁月如梭|光阴似箭|转眼间|弹指一挥/, label: '时间套话' },
    { re: /应运而生|应运而生|脱颖而出|熠熠生辉/, label: '成语套话' },
    { re: /心中涌起.*感觉|莫名的|说不清道不明/, label: '情感套话' },
    { re: /让我们一起|携手共进|为实现.*而.*奋斗/, label: '口号套话' },
  ];

  const issues: AIDetectionIssue[] = [];
  let totalHits = 0;

  for (const { re, label } of patterns) {
    const matches = text.match(re);
    if (matches) {
      for (const match of matches) {
        const idx = text.indexOf(match);
        issues.push({
          text: match,
          detail: label,
          startOffset: idx,
          endOffset: idx + match.length,
        });
      }
      totalHits++;
    }
  }

  const score = Math.min(
    100,
    totalHits >= 4 ? 85 : totalHits >= 3 ? 70 : totalHits >= 2 ? 50 : totalHits * 25,
  );
  return { score, issues };
}

/**
 * 句式单调检测：识别重复句型结构。
 */
export function detectMonotonousSyntax(text: string): {
  score: number;
  issues: AIDetectionIssue[];
} {
  // Split by sentence terminators (both Chinese and Western)
  const sentences = text.split(/[。！？.\n]+/).filter((l) => l.trim().length > 2);
  if (sentences.length < 3) return { score: 0, issues: [] };

  // Check for repeated sentence starters (use 1-char starter for Chinese text)
  const starters: string[] = [];
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    const starter = trimmed.substring(0, 1);
    starters.push(starter);
  }

  const starterCounts = new Map<string, number>();
  for (const s of starters) {
    starterCounts.set(s, (starterCounts.get(s) ?? 0) + 1);
  }

  const issues: AIDetectionIssue[] = [];
  let maxRepeat = 0;
  for (const [starter, count] of starterCounts) {
    if (count >= 3) {
      maxRepeat = Math.max(maxRepeat, count);
      const firstIdx = text.indexOf(starter);
      issues.push({
        text: `连续 ${count} 句以「${starter}」开头`,
        detail: '句型重复度过高',
        startOffset: firstIdx,
      });
    }
  }

  // Check for identical sentence length patterns
  const lengths = sentences.map((l) => l.length);
  const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((sum, l) => sum + (l - avgLen) ** 2, 0) / lengths.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev < avgLen * 0.15 && sentences.length >= 4) {
    issues.push({
      text: '句长分布过于均匀',
      detail: `标准差 ${stdDev.toFixed(1)} 远低于均值 ${avgLen.toFixed(0)}`,
    });
  }

  const score = Math.min(
    100,
    maxRepeat >= 5 ? 85 : maxRepeat >= 4 ? 70 : maxRepeat >= 3 ? 55 : issues.length * 20,
  );
  return { score, issues };
}

/**
 * 分析报告体检测：识别论文/报告式表达。
 */
export function detectAnalyticalReport(text: string): {
  score: number;
  issues: AIDetectionIssue[];
} {
  const patterns = [
    { re: /首先[^，]{0,20}我们需要|首先[^，]{0,20}明确的是/, label: '首先...需要' },
    { re: /其次|再次|最后[^，]{0,10}从.*来看/, label: '其次/再次' },
    { re: /综上所述|总而言之|总体而言|可以得出/, label: '综上所述' },
    { re: /从宏观.*角度|从微观.*层面|总体来看|整体而言/, label: '宏观/微观' },
    { re: /必须采取.*措施|加以解决|方能|方可/, label: '措施套话' },
    { re: /形势.*严峻|前景.*乐观|不懈努力|中国梦/, label: '政治套话' },
  ];

  const issues: AIDetectionIssue[] = [];
  let totalHits = 0;

  for (const { re, label } of patterns) {
    const match = text.match(re);
    if (match) {
      const idx = text.indexOf(match[0]);
      issues.push({
        text: match[0].substring(0, 30),
        detail: label,
        startOffset: idx,
      });
      totalHits++;
    }
  }

  const score = Math.min(100, totalHits >= 3 ? 85 : totalHits >= 2 ? 60 : totalHits * 30);
  return { score, issues };
}

/**
 * 元叙事检测：识别作者跳出来对读者讲话的模式。
 */
export function detectMetaNarrative(text: string): { score: number; issues: AIDetectionIssue[] } {
  const patterns = [
    { re: /这个故事告诉.*|这个故事说明.*|这个故事给我们/, label: '故事告诉' },
    { re: /让我们来看看|接下来会|让我们把目光转向/, label: '引导读者' },
    { re: /在此之前|先回顾|回顾一下之前/, label: '回顾提示' },
    { re: /正如大家所知|众所周知|正如.*所知/, label: '众所周知' },
    { re: /人生就像|人生如.*一场|生活就是/, label: '人生道理' },
    { re: /这一切都源于|一切都将从.*开始/, label: '命运宣言' },
  ];

  const issues: AIDetectionIssue[] = [];
  let totalHits = 0;

  for (const { re, label } of patterns) {
    const match = text.match(re);
    if (match) {
      const idx = text.indexOf(match[0]);
      issues.push({
        text: match[0].substring(0, 30),
        detail: label,
        startOffset: idx,
      });
      totalHits++;
    }
  }

  const score = Math.min(100, totalHits * 28);
  return { score, issues };
}

/**
 * 意象重复检测：识别同一意象反复出现。
 */
export function detectImageryRepetition(text: string): {
  score: number;
  issues: AIDetectionIssue[];
} {
  const imageryKeywords = [
    '月光',
    '月色',
    '皎洁',
    '银',
    '如梦',
    '如幻',
    '如水',
    '明月',
    '夕阳',
    '余晖',
    '晚霞',
    '霞光',
    '雨',
    '细雨',
    '蒙蒙',
    '淅沥',
    '风',
    '微风',
    '寒风',
    '凉风',
    '花',
    '花瓣',
    '花朵',
    '绽放',
    '雪',
    '雪花',
    '白雪',
    '飘雪',
  ];

  const found: Map<string, number> = new Map();
  const issues: AIDetectionIssue[] = [];

  for (const keyword of imageryKeywords) {
    let idx = 0;
    let count = 0;
    while ((idx = text.indexOf(keyword, idx)) !== -1) {
      count++;
      idx += keyword.length;
    }
    if (count >= 2) {
      found.set(keyword, count);
      const firstIdx = text.indexOf(keyword);
      issues.push({
        text: `「${keyword}」出现 ${count} 次`,
        detail: '意象重复',
        startOffset: firstIdx,
      });
    }
  }

  const score = Math.min(100, found.size >= 2 ? 50 + (found.size - 2) * 20 : found.size * 25);
  return { score, issues };
}

/**
 * 语义重复检测：识别同义反复。
 */
export function detectSemanticRepetition(text: string): {
  score: number;
  issues: AIDetectionIssue[];
} {
  const semanticGroups = [
    { group: ['高兴', '喜悦', '快乐', '愉悦', '开心', '欢喜', '愉快'], label: '快乐语义' },
    { group: ['悲伤', '痛苦', '悲伤', '难过', '哀伤', '悲痛', '忧伤'], label: '悲伤语义' },
    { group: ['愤怒', '怒火', '愤慨', '气愤', '恼怒', '暴怒'], label: '愤怒语义' },
    { group: ['害怕', '恐惧', '恐惧', '惊慌', '惊恐', '畏惧', '胆怯'], label: '恐惧语义' },
    { group: ['美丽', '好看', '漂亮', '动人', '秀丽', '秀美'], label: '美丽语义' },
    { group: ['爱', '温暖', '温馨', '关爱', '温情', '柔情'], label: '温情语义' },
  ];

  const issues: AIDetectionIssue[] = [];
  let totalHits = 0;

  for (const { group, label } of semanticGroups) {
    const found: string[] = [];
    for (const word of group) {
      if (text.includes(word)) {
        found.push(word);
      }
    }
    if (found.length >= 3) {
      totalHits += found.length;
      const firstWord = found[0];
      const idx = text.indexOf(firstWord);
      issues.push({
        text: `${label}：「${found.join('、')}」反复出现`,
        detail: `同一情感语义场重复使用 (${found.length} 个近义词)`,
        startOffset: idx,
      });
    }
  }

  const score = Math.min(100, totalHits * 15);
  return { score, issues };
}

/**
 * 逻辑跳跃检测：识别缺少过渡的情节推进。
 */
export function detectLogicGaps(text: string): { score: number; issues: AIDetectionIssue[] } {
  const lines = text.split(/[。\n]+/).filter((l) => l.trim().length > 2);
  if (lines.length < 3) return { score: 0, issues: [] };

  const issues: AIDetectionIssue[] = [];

  // Detect rapid state changes without transition
  const stateMarkers = [
    { re: /发现.*有|看到.*有|注意到/, label: '发现事件' },
    { re: /立刻明白|瞬间明白|一下子明白|立刻意识|顿时明白/, label: '瞬间理解' },
    { re: /于是.*决定|所以.*决定|便.*决定|当即决定/, label: '立即决定' },
    { re: /飞往|前往|来到|奔向|走向/, label: '位移事件' },
    { re: /遇见|遇到|碰见|重逢|相逢/, label: '相遇事件' },
  ];

  const detectedMarkers: Array<{ lineIdx: number; marker: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    for (const { re, label } of stateMarkers) {
      if (re.test(lines[i])) {
        detectedMarkers.push({ lineIdx: i, marker: label });
        break;
      }
    }
  }

  // Check for rapid sequence of state changes
  for (let i = 1; i < detectedMarkers.length; i++) {
    const gap = detectedMarkers[i].lineIdx - detectedMarkers[i - 1].lineIdx;
    if (gap <= 1) {
      const line = lines[detectedMarkers[i].lineIdx].trim().substring(0, 30);
      issues.push({
        text: `「${detectedMarkers[i].marker}」与前一个事件（${detectedMarkers[i - 1].marker}）之间缺少过渡`,
        detail: `连续事件缺少铺垫: ${line}`,
      });
    }
  }

  const score = Math.min(100, issues.length * 25);
  return { score, issues };
}

/**
 * 情感虚假检测：识别堆砌情感词汇但缺少具体描写。
 */
export function detectFalseEmotion(text: string): { score: number; issues: AIDetectionIssue[] } {
  const emotionStackPatterns = [
    { re: /悲痛欲绝|心如刀绞|痛不欲生|肝肠寸断/, label: '极端悲伤' },
    { re: /无比幸福|无比快乐|无比激动|无比兴奋/, label: '「无比」强化' },
    { re: /无尽.*爱|无尽.*温暖|充满.*爱/, label: '无尽情感' },
    { re: /仿佛整个世界.*美好|世界变得.*美好/, label: '世界美化' },
    { re: /灿烂.*笑容|露出了.*笑容|脸上露出了/, label: '笑容描写' },
    { re: /泪水.*流下|止不住.*泪|泪如雨下|潸然泪下/, label: '泪水描写' },
  ];

  const issues: AIDetectionIssue[] = [];
  let totalHits = 0;

  for (const { re, label } of emotionStackPatterns) {
    const match = text.match(re);
    if (match) {
      const idx = text.indexOf(match[0]);
      issues.push({
        text: match[0].substring(0, 20),
        detail: label,
        startOffset: idx,
      });
      totalHits++;
    }
  }

  // Bonus: check if emotions are told rather than shown
  const emotionWords = [
    '悲痛',
    '幸福',
    '快乐',
    '难过',
    '开心',
    '愤怒',
    '恐惧',
    '喜悦',
    '激动',
    '忧伤',
  ];
  let emotionWordCount = 0;
  for (const word of emotionWords) {
    const regex = new RegExp(word, 'g');
    const matches = text.match(regex);
    if (matches) emotionWordCount += matches.length;
  }

  if (emotionWordCount >= 3 && totalHits >= 2) {
    issues.push({
      text: `情感词汇堆砌（${emotionWordCount} 个直接情感词）`,
      detail: '情感表达倾向于直接陈述而非具体描写',
    });
    totalHits += 2;
  }

  const score = Math.min(100, totalHits * 22);
  return { score, issues };
}

/**
 * 描述空洞检测：识别缺少具体细节的抽象描写。
 */
export function detectHollowDescriptions(text: string): {
  score: number;
  issues: AIDetectionIssue[];
} {
  const hollowPatterns = [
    { re: /非常非常.*好看|特别特别.*好看|十分.*好看/, label: '叠词修饰' },
    { re: /说不出的感觉|总之就是.*特别|就是.*不一样/, label: '含糊表达' },
    { re: /无法用语言.*|难以言表|难以形容|不可名状/, label: '无法形容' },
    { re: /真的太棒了|真是太好了|简直.*极了/, label: '空洞评价' },
    { re: /一个美丽的地方|一个.*的地方.*让人.*舒服/, label: '笼统描写' },
    { re: /让人觉得.*很.*|给人.*感觉.*好/, label: '感觉替代' },
  ];

  const issues: AIDetectionIssue[] = [];
  let totalHits = 0;

  for (const { re, label } of hollowPatterns) {
    const match = text.match(re);
    if (match) {
      const idx = text.indexOf(match[0]);
      issues.push({
        text: match[0].substring(0, 30),
        detail: label,
        startOffset: idx,
      });
      totalHits++;
    }
  }

  const score = Math.min(100, totalHits * 28);
  return { score, issues };
}

// ─── Detector registry ─────────────────────────────────────────────

const DETECTORS: Record<AICategory, DetectorFn> = {
  'cliche-phrase': detectClichePhrases,
  'monotonous-syntax': detectMonotonousSyntax,
  'analytical-report': detectAnalyticalReport,
  'meta-narrative': detectMetaNarrative,
  'imagery-repetition': detectImageryRepetition,
  'semantic-repetition': detectSemanticRepetition,
  'logic-gap': detectLogicGaps,
  'false-emotion': detectFalseEmotion,
  'hollow-description': detectHollowDescriptions,
};

// ─── AIGCDetector ──────────────────────────────────────────────────
/**
 * 9 类 AI 痕迹检测器。
 * 使用正则匹配和启发式规则识别 AI 生成文本的典型特征。
 * 输出每类检测的评分、严重等级和具体问题位置。
 */
export class AIGCDetector {
  private weights: Record<AICategory, number>;

  constructor(options?: DetectorOptions) {
    this.weights = { ...DEFAULT_WEIGHTS, ...options?.weights };
  }

  /**
   * 对给定文本执行 9 类 AI 痕迹检测。
   */
  detect(text: string): AIDetectionReport {
    if (text.trim().length === 0) {
      return {
        text,
        categories: CATEGORY_NAMES.map((cat) => ({
          category: cat,
          score: 0,
          severity: 'none',
          issues: [],
        })),
        overallScore: 0,
      };
    }

    const categories: CategoryResult[] = [];

    for (const category of CATEGORY_NAMES) {
      const detector = DETECTORS[category];
      const { score, issues } = detector(text);
      categories.push({
        category,
        score,
        severity: classifySeverity(score),
        issues,
      });
    }

    const overallScore = this.#computeOverall(categories);

    return { text, categories, overallScore };
  }

  #computeOverall(categories: CategoryResult[]): number {
    let total = 0;
    for (const cat of categories) {
      total += cat.score * (this.weights[cat.category] ?? 0);
    }
    return Math.round(Math.min(100, Math.max(0, total)));
  }
}
