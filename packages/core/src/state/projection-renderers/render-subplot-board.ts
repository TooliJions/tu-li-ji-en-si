import type { Manifest } from '../../models/state';
import { HOOK_STATUS_LABELS } from '../projection-labels';

export function renderSubplotBoard(manifest: Manifest): string {
  const lines: string[] = [];

  lines.push('# 支线看板');
  lines.push('');

  const activeHooks = manifest.hooks.filter((hook) =>
    ['open', 'progressing', 'deferred', 'dormant'].includes(hook.status),
  );

  if (activeHooks.length === 0) {
    lines.push('暂无支线');
    lines.push('');
    return lines.join('\n');
  }

  for (const hook of activeHooks) {
    lines.push(`## ${hook.description}`);
    lines.push('');
    lines.push(`- **状态**: ${HOOK_STATUS_LABELS[hook.status] ?? hook.status}`);
    lines.push(`- **优先级**: ${hook.priority}`);
    lines.push(`- **埋设章节**: 第 ${hook.plantedChapter} 章`);
    if (hook.expectedResolutionMin && hook.expectedResolutionMax) {
      lines.push(
        `- **预期推进窗口**: 第 ${hook.expectedResolutionMin}-${hook.expectedResolutionMax} 章`,
      );
    }
    if (hook.relatedChapters.length > 0) {
      lines.push(`- **涉及章节**: ${hook.relatedChapters.map((c) => `第 ${c} 章`).join('、')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
