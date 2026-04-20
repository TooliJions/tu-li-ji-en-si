// ─── Types ──────────────────────────────────────────────────────

import { evalCondition } from './safe-condition-eval';

export interface CompiledRule {
  id: string;
  type: 'hook' | 'fact' | 'character' | 'world-rule' | 'custom';
  matcher: (item: Record<string, unknown>) => boolean;
  reason: string;
}

export interface RuleStackResult {
  id: string;
  bookId: string;
  chapterNumber: number;
  versionToken: number;
  rules: CompiledRule[];
  compiledAt: string;
  error?: string;
}

export interface RuleStackInput {
  bookId: string;
  genre: string;
  chapterNumber: number;
  versionToken: number;
  customRules?: CompiledRule[];
}

// ─── Genre-specific rule templates ─────────────────────────────

const GENRE_RULES: Record<
  string,
  Array<{ type: CompiledRule['type']; reason: string; condition: string }>
> = {
  xianxia: [
    {
      type: 'world-rule',
      reason: '修仙体系一致性检查',
      condition: 'item.category == "magic-system"',
    },
    { type: 'fact', reason: '修仙世界事实校验', condition: 'item.category == "world"' },
    {
      type: 'character',
      reason: '角色修仙境界一致性',
      condition: 'item.role == "protagonist" || item.role == "antagonist"',
    },
  ],
  urban: [
    { type: 'world-rule', reason: '都市背景规则校验', condition: 'item.category == "society"' },
    { type: 'fact', reason: '都市生活事实校验', condition: 'item.category == "world"' },
    { type: 'character', reason: '角色社会关系一致性', condition: 'item.role == "protagonist"' },
  ],
  scifi: [
    { type: 'world-rule', reason: '科幻设定一致性', condition: 'item.category == "technology"' },
    { type: 'fact', reason: '科技事实校验', condition: 'item.category == "world"' },
  ],
  fantasy: [
    {
      type: 'world-rule',
      reason: '奇幻世界规则一致性',
      condition: 'item.category == "magic-system"',
    },
    { type: 'fact', reason: '奇幻世界事实校验', condition: 'item.category == "world"' },
  ],
};

const DEFAULT_RULES: Array<{
  id: string;
  type: CompiledRule['type'];
  reason: string;
  condition: string;
}> = [
  {
    id: 'default-hook',
    type: 'hook',
    reason: '活跃伏笔必须推进',
    condition: 'item.status == "open" || item.status == "progressing"',
  },
  {
    id: 'default-fact',
    type: 'fact',
    reason: '高置信度事实必须遵守',
    condition: 'item.confidence == "high"',
  },
  {
    id: 'default-char',
    type: 'character',
    reason: '主角和配角必须保持一致性',
    condition: 'item.role == "protagonist" || item.role == "supporting"',
  },
  { id: 'default-world', type: 'world-rule', reason: '世界规则不可违反', condition: 'true' },
];

// ─── RuleStackCompiler ────────────────────────────────────────

export class RuleStackCompiler {
  /**
   * 编译规则栈：合并默认规则 + 题材规则 + 自定义规则。
   */
  compile(input: RuleStackInput): RuleStackResult {
    if (!input.bookId || input.bookId.trim().length === 0) {
      return this.#errorResult(input, 'bookId 不能为空');
    }
    if (input.chapterNumber < 1) {
      return this.#errorResult(input, '章节号必须从 1 开始');
    }
    if (!input.genre || input.genre.trim().length === 0) {
      return this.#errorResult(input, '题材不能为空');
    }

    const rules: CompiledRule[] = [];

    // 1. 自定义规则优先
    if (input.customRules && input.customRules.length > 0) {
      rules.push(...input.customRules);
    }

    // 2. 默认规则
    for (const tmpl of DEFAULT_RULES) {
      rules.push({
        id: tmpl.id,
        type: tmpl.type,
        matcher: this.#buildMatcher(tmpl.condition),
        reason: tmpl.reason,
      });
    }

    // 3. 题材规则
    const genreRules = GENRE_RULES[input.genre] ?? [];
    for (const tmpl of genreRules) {
      rules.push({
        id: `genre-${input.genre}-${tmpl.type}`,
        type: tmpl.type,
        matcher: this.#buildMatcher(tmpl.condition),
        reason: tmpl.reason,
      });
    }

    return {
      id: `rulestack-${input.bookId}-${input.chapterNumber}`,
      bookId: input.bookId,
      chapterNumber: input.chapterNumber,
      versionToken: input.versionToken,
      rules,
      compiledAt: new Date().toISOString(),
    };
  }

  /**
   * 生成 rule-stack.yaml 字符串。
   */
  generateRuleStackYaml(result: RuleStackResult): string {
    const lines: string[] = [
      `# Rule Stack for ${result.bookId} chapter ${result.chapterNumber}`,
      `id: ${result.id}`,
      `bookId: ${result.bookId}`,
      `chapterNumber: ${result.chapterNumber}`,
      `versionToken: ${result.versionToken}`,
      `compiledAt: ${result.compiledAt}`,
      `rules:`,
    ];

    for (const rule of result.rules) {
      lines.push(`  - id: ${rule.id}`);
      lines.push(`    type: ${rule.type}`);
      lines.push(`    reason: ${rule.reason}`);
    }

    return lines.join('\n');
  }

  // ── Private helpers ───────────────────────────────────────────

  #buildMatcher(condition: string): (item: Record<string, unknown>) => boolean {
    return (item: Record<string, unknown>) => evalCondition(condition, item);
  }

  #errorResult(input: RuleStackInput, error: string): RuleStackResult {
    return {
      id: '',
      bookId: input.bookId,
      chapterNumber: input.chapterNumber,
      versionToken: input.versionToken,
      rules: [],
      compiledAt: '',
      error,
    };
  }
}
