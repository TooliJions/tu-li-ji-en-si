import type { Manifest } from '../../models/state';
import { CHARACTER_ROLE_LABELS } from '../projection-labels';

export function renderCharacterMatrix(manifest: Manifest): string {
  const lines: string[] = [];

  lines.push('# 角色矩阵');
  lines.push('');

  if (manifest.characters.length === 0) {
    lines.push('暂无角色矩阵');
    lines.push('');
    return lines.join('\n');
  }

  for (const character of manifest.characters) {
    lines.push(`## ${character.name}`);
    lines.push('');
    lines.push(`- **角色类型**: ${CHARACTER_ROLE_LABELS[character.role] ?? character.role}`);
    const traits = Array.isArray(character.traits)
      ? character.traits
      : typeof character.traits === 'string'
        ? [character.traits]
        : [];
    lines.push(`- **特征**: ${traits.length > 0 ? traits.join('、') : '待补充'}`);
    const relationships =
      typeof character.relationships === 'object' &&
      character.relationships !== null &&
      !Array.isArray(character.relationships)
        ? character.relationships
        : {};
    if (Object.keys(relationships).length > 0) {
      lines.push('- **关系矩阵**:');
      for (const [targetId, description] of Object.entries(relationships)) {
        lines.push(`  - ${targetId}: ${description}`);
      }
    } else {
      lines.push('- **关系矩阵**: 暂无');
    }
    lines.push('');
  }

  return lines.join('\n');
}
