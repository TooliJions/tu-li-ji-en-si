import type { Manifest } from '../../models/state';
import {
  CHARACTER_ROLE_LABELS,
  FACT_CATEGORY_LABELS,
  CONFIDENCE_LABELS,
} from '../projection-labels';
import { groupBy } from './index';

export function renderCurrentState(manifest: Manifest): string {
  const lines: string[] = [];

  lines.push('# 当前状态');
  lines.push('');
  lines.push(`- **书籍ID**: ${manifest.bookId}`);
  lines.push(`- **最后完成章节**: 第 ${manifest.lastChapterWritten} 章`);
  lines.push(`- **状态版本**: v${manifest.versionToken}`);
  lines.push(`- **更新时间**: ${manifest.updatedAt}`);
  lines.push('');

  if (manifest.currentFocus) {
    lines.push('## 当前焦点');
    lines.push('');
    lines.push(manifest.currentFocus);
    lines.push('');
  }

  lines.push('## 角色');
  lines.push('');
  if (manifest.characters.length === 0) {
    lines.push('暂无角色信息');
  } else {
    for (const char of manifest.characters) {
      const roleLabel = CHARACTER_ROLE_LABELS[char.role] ?? char.role;
      lines.push(`### ${char.name} [${roleLabel}]`);
      lines.push('');
      const traits = Array.isArray(char.traits)
        ? char.traits
        : typeof char.traits === 'string'
          ? [char.traits]
          : [];
      if (traits.length > 0) {
        lines.push(`- **特征**: ${traits.join('、')}`);
      }
      if (char.arc) {
        lines.push(`- **角色弧光**: ${char.arc}`);
      }
      if (char.firstAppearance) {
        lines.push(`- **首次登场**: 第 ${char.firstAppearance} 章`);
      }
      const relationships =
        typeof char.relationships === 'object' &&
        char.relationships !== null &&
        !Array.isArray(char.relationships)
          ? char.relationships
          : {};
      if (Object.keys(relationships).length > 0) {
        lines.push(`- **关系**:`);
        for (const [targetId, desc] of Object.entries(relationships)) {
          lines.push(`  - ${targetId}: ${desc}`);
        }
      }
      lines.push('');
    }
  }

  lines.push('## 世界设定');
  lines.push('');
  if (manifest.worldRules.length === 0) {
    lines.push('暂无世界设定');
  } else {
    for (const rule of manifest.worldRules) {
      lines.push(`- [${rule.category}] ${rule.rule}`);
      if (rule.exceptions.length > 0) {
        lines.push(`  - 例外: ${rule.exceptions.join('、')}`);
      }
    }
    lines.push('');
  }

  lines.push('## 记忆事实');
  lines.push('');
  if (manifest.facts.length === 0) {
    lines.push('暂无记忆事实');
  } else {
    const grouped = groupBy(manifest.facts, (f) => f.category);
    for (const [category, facts] of Object.entries(grouped)) {
      const label = FACT_CATEGORY_LABELS[category] ?? category;
      lines.push(`### ${label}`);
      lines.push('');
      for (const fact of facts) {
        const conf = CONFIDENCE_LABELS[fact.confidence] ?? fact.confidence;
        lines.push(`- ${fact.content} *(第 ${fact.chapterNumber} 章, 可信度: ${conf})*`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
