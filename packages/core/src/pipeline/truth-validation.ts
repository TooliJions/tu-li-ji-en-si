import { LLMProvider } from '../llm/provider';
import type { Manifest, Fact, WorldRule, Character, Hook } from '../models/state';

// ─── Types ──────────────────────────────────────────────────────

export interface TruthIssue {
  fact: string;
  contradiction: string;
  severity: 'critical' | 'warning';
  suggestion: string;
}

export interface TruthValidationInput {
  content: string;
  genre: string;
  chapterNumber: number;
  facts: Fact[];
  worldRules: WorldRule[];
  characters: Character[];
}

export interface TruthValidationResult {
  passed: boolean;
  conflicts: TruthIssue[];
  error?: string;
}

export interface TruthValidationConfig {
  provider: LLMProvider;
}

// ─── TruthValidation ──────────────────────────────────────────

export class TruthValidation {
  private provider: LLMProvider;

  constructor(config: TruthValidationConfig) {
    this.provider = config.provider;
  }

  /**
   * 校验章节内容是否与已建立的事实和世界规则一致。
   */
  async validate(input: TruthValidationInput): Promise<TruthValidationResult> {
    if (!input.content || input.content.trim().length === 0) {
      return { passed: false, conflicts: [], error: '章节内容不能为空' };
    }
    if (input.chapterNumber < 1) {
      return { passed: false, conflicts: [], error: '章节号必须从 1 开始' };
    }

    const genreLabel = this.#getGenreLabel(input.genre);

    const prompt = `你是一位真相校验师。请检查以下章节内容是否与已建立的事实和世界规则一致。

## 基本信息
- **章节**: 第 ${input.chapterNumber} 章
- **题材**: ${genreLabel}

## 已建立的事实
${input.facts.length > 0 ? input.facts.map((f) => `- [${f.category}] ${f.content} (置信度: ${f.confidence})`).join('\n') : '无'}

## 世界规则
${input.worldRules.length > 0 ? input.worldRules.map((r) => `- [${r.category}] ${r.rule}${r.exceptions.length > 0 ? ` (例外: ${r.exceptions.join(', ')})` : ''}`).join('\n') : '无'}

## 角色设定
${input.characters.length > 0 ? input.characters.map((c) => `- ${c.name} (${c.role}): ${c.traits.join('、') || '无特征'}`).join('\n') : '无'}

## 章节内容
${input.content.substring(0, 5000)}

## 校验要求
1. 检查内容是否与已建立事实矛盾
2. 检查是否违反世界规则
3. 检查角色设定是否一致
4. 区分严重矛盾（critical）和轻微偏差（warning）

请以 JSON 格式输出：
{
  "conflicts": [
    { "fact": "矛盾的事实或规则", "contradiction": "文中的矛盾点", "severity": "critical|warning", "suggestion": "修正建议" }
  ],
  "overallStatus": "pass|warning|fail",
  "summary": "校验总结"
}`;

    try {
      const result = await this.provider.generateJSON<{
        conflicts: TruthIssue[];
        overallStatus: 'pass' | 'warning' | 'fail';
        summary: string;
      }>(prompt);

      // critical 冲突或 fail 状态 → 拒绝
      const hasCritical = result.conflicts.some((c) => c.severity === 'critical');
      const passed = !hasCritical && result.overallStatus !== 'fail';

      return {
        passed,
        conflicts: result.conflicts,
      };
    } catch (error) {
      return {
        passed: false,
        conflicts: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 从 Manifest 提取数据并校验。
   */
  async validateFromManifest(input: {
    content: string;
    chapterNumber: number;
    manifest: Manifest;
  }): Promise<TruthValidationResult> {
    const genre = this.#extractGenre(input.manifest);

    return this.validate({
      content: input.content,
      genre,
      chapterNumber: input.chapterNumber,
      facts: input.manifest.facts,
      worldRules: input.manifest.worldRules,
      characters: input.manifest.characters,
    });
  }

  /**
   * 生成人类可读的校验总结。
   */
  getValidationSummary(result: TruthValidationResult): string {
    if (result.error) {
      return `校验失败: ${result.error}`;
    }

    if (result.passed && result.conflicts.length === 0) {
      return '✅ 真相校验通过，无矛盾。';
    }

    if (result.passed) {
      return `⚠️ 真相校验通过（有警告），发现 ${result.conflicts.length} 个问题：\n${this.#formatConflicts(result.conflicts)}`;
    }

    return `❌ 真相校验未通过，发现 ${result.conflicts.length} 个矛盾：\n${this.#formatConflicts(result.conflicts)}`;
  }

  // ── Private helpers ───────────────────────────────────────────

  #getGenreLabel(genre: string): string {
    const labels: Record<string, string> = {
      xianxia: '仙侠',
      urban: '都市',
      scifi: '科幻',
      fantasy: '奇幻',
    };
    return labels[genre] ?? genre;
  }

  #extractGenre(manifest: Manifest): string {
    // Try to infer genre from facts/worldRules/hooks
    const allText = JSON.stringify({
      facts: manifest.facts.map((f) => f.content),
      rules: manifest.worldRules.map((r) => r.rule),
    });

    const genres = ['xianxia', 'urban', 'scifi', 'fantasy'] as const;
    for (const g of genres) {
      if (allText.includes(g)) return g;
    }
    return 'unknown';
  }

  #formatConflicts(conflicts: TruthIssue[]): string {
    return conflicts
      .map((c) => `- [${c.severity}] ${c.fact}: ${c.contradiction} → ${c.suggestion}`)
      .join('\n');
  }
}
