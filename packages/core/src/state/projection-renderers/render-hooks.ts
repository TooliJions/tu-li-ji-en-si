import type { Manifest } from '../../models/state';
import { HOOK_STATUS_LABELS } from '../projection-labels';
import { groupBy } from './index';

export function renderHooks(manifest: Manifest): string {
  const lines: string[] = [];

  lines.push('# 伏笔追踪');
  lines.push('');

  if (manifest.hooks.length === 0) {
    lines.push('暂无伏笔');
    lines.push('');
    return lines.join('\n');
  }

  const grouped = groupBy(manifest.hooks, (h) => h.status);
  const statusOrder = ['open', 'progressing', 'deferred', 'dormant', 'resolved', 'abandoned'];

  for (const status of statusOrder) {
    const hooks = grouped[status];
    if (!hooks || hooks.length === 0) continue;

    const label = HOOK_STATUS_LABELS[status] ?? status;
    lines.push(`## ${label}`);
    lines.push('');

    for (const hook of hooks) {
      lines.push(`### ${hook.description}`);
      lines.push('');
      lines.push(`- **优先级**: ${hook.priority}`);
      lines.push(`- **埋设章节**: 第 ${hook.plantedChapter} 章`);
      if (hook.expectedResolutionMin && hook.expectedResolutionMax) {
        lines.push(
          `- **预期回收**: 第 ${hook.expectedResolutionMin}-${hook.expectedResolutionMax} 章`,
        );
      }
      if (hook.wakeAtChapter) {
        lines.push(`- **唤醒章节**: 第 ${hook.wakeAtChapter} 章`);
      }
      if (hook.relatedCharacters.length > 0) {
        lines.push(`- **相关角色**: ${hook.relatedCharacters.join('、')}`);
      }
      if (hook.relatedChapters.length > 0) {
        lines.push(`- **相关章节**: ${hook.relatedChapters.map((c) => `第 ${c} 章`).join('、')}`);
      }
      if (hook.payoffDescription) {
        lines.push(`- **回收描述**: ${hook.payoffDescription}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
