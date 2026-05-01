import type { Manifest } from '../../models/state';
import { CHARACTER_ROLE_LABELS } from '../projection-labels';

export function renderEmotionalArcs(manifest: Manifest): string {
  const lines: string[] = [];

  lines.push('# 情感弧线');
  lines.push('');

  if (manifest.characters.length === 0) {
    lines.push('暂无情感弧线');
    lines.push('');
    return lines.join('\n');
  }

  for (const character of manifest.characters) {
    lines.push(`## ${character.name}`);
    lines.push('');
    lines.push(`- **角色定位**: ${CHARACTER_ROLE_LABELS[character.role] ?? character.role}`);
    lines.push(`- **当前弧光**: ${character.arc ?? '待建立'}`);
    lines.push(
      `- **相关伏笔数**: ${manifest.hooks.filter((hook) => hook.relatedCharacters.includes(character.id)).length}`,
    );
    if (character.lastAppearance) {
      lines.push(`- **最近登场**: 第 ${character.lastAppearance} 章`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
