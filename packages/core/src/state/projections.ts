import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import type { Manifest } from '../models/state';

// ─── Types ─────────────────────────────────────────────────────

export interface ProjectionFile {
  name: string;
  content: string;
}

export interface ChapterSummaryRecord {
  chapter: number;
  summary: string;
  keyEvents: string[] | null;
  stateChanges: Record<string, unknown> | null;
  created_at: string;
}

// ─── Status/Role Maps ──────────────────────────────────────────

const HOOK_STATUS_LABELS: Record<string, string> = {
  open: '进行中 (open)',
  progressing: '推进中 (progressing)',
  deferred: '延后 (deferred)',
  dormant: '休眠 (dormant)',
  resolved: '已回收 (resolved)',
  abandoned: '已废弃 (abandoned)',
};

const CHARACTER_ROLE_LABELS: Record<string, string> = {
  protagonist: '主角',
  antagonist: '反派',
  supporting: '配角',
  minor: '路人',
};

const FACT_CATEGORY_LABELS: Record<string, string> = {
  character: '角色',
  world: '世界观',
  plot: '剧情',
  timeline: '时间线',
  resource: '资源',
};

const CONFIDENCE_LABELS: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

// ─── ProjectionRenderer ──────────────────────────────────────

export class ProjectionRenderer {
  /**
   * 渲染 current_state.md 内容
   */
  static renderCurrentState(manifest: Manifest): string {
    const lines: string[] = [];

    lines.push('# 当前状态');
    lines.push('');
    lines.push(`- **书籍ID**: ${manifest.bookId}`);
    lines.push(`- **最后完成章节**: 第 ${manifest.lastChapterWritten} 章`);
    lines.push(`- **状态版本**: v${manifest.versionToken}`);
    lines.push(`- **更新时间**: ${manifest.updatedAt}`);
    lines.push('');

    // Current focus
    if (manifest.currentFocus) {
      lines.push('## 当前焦点');
      lines.push('');
      lines.push(manifest.currentFocus);
      lines.push('');
    }

    // Characters
    lines.push('## 角色');
    lines.push('');
    if (manifest.characters.length === 0) {
      lines.push('暂无角色信息');
    } else {
      for (const char of manifest.characters) {
        const roleLabel = CHARACTER_ROLE_LABELS[char.role] ?? char.role;
        lines.push(`### ${char.name} [${roleLabel}]`);
        lines.push('');
        if (char.traits.length > 0) {
          lines.push(`- **特征**: ${char.traits.join('、')}`);
        }
        if (char.arc) {
          lines.push(`- **角色弧光**: ${char.arc}`);
        }
        if (char.firstAppearance) {
          lines.push(`- **首次登场**: 第 ${char.firstAppearance} 章`);
        }
        if (Object.keys(char.relationships).length > 0) {
          lines.push(`- **关系**:`);
          for (const [targetId, desc] of Object.entries(char.relationships)) {
            lines.push(`  - ${targetId}: ${desc}`);
          }
        }
        lines.push('');
      }
    }

    // World rules
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

    // Facts
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

  /**
   * 渲染 hooks.md 内容
   */
  static renderHooks(manifest: Manifest): string {
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
            `- **预期回收**: 第 ${hook.expectedResolutionMin}-${hook.expectedResolutionMax} 章`
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

  /**
   * 渲染 chapter_summaries.md 内容
   */
  static renderChapterSummaries(summaries: ChapterSummaryRecord[]): string {
    const lines: string[] = [];

    lines.push('# 章节摘要');
    lines.push('');

    if (summaries.length === 0) {
      lines.push('暂无章节摘要');
      lines.push('');
      return lines.join('\n');
    }

    for (const s of summaries) {
      lines.push(`## 第 ${s.chapter} 章`);
      lines.push('');
      lines.push(s.summary);
      lines.push('');

      if (s.keyEvents && s.keyEvents.length > 0) {
        lines.push('**关键事件**');
        lines.push('');
        for (const event of s.keyEvents) {
          lines.push(`- ${event}`);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * 渲染 subplot_board.md 内容
   */
  static renderSubplotBoard(manifest: Manifest): string {
    const lines: string[] = [];

    lines.push('# 支线看板');
    lines.push('');

    const activeHooks = manifest.hooks.filter((hook) =>
      ['open', 'progressing', 'deferred', 'dormant'].includes(hook.status)
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
          `- **预期推进窗口**: 第 ${hook.expectedResolutionMin}-${hook.expectedResolutionMax} 章`
        );
      }
      if (hook.relatedChapters.length > 0) {
        lines.push(`- **涉及章节**: ${hook.relatedChapters.map((c) => `第 ${c} 章`).join('、')}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * 渲染 emotional_arcs.md 内容
   */
  static renderEmotionalArcs(manifest: Manifest): string {
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
        `- **相关伏笔数**: ${manifest.hooks.filter((hook) => hook.relatedCharacters.includes(character.id)).length}`
      );
      if (character.lastAppearance) {
        lines.push(`- **最近登场**: 第 ${character.lastAppearance} 章`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * 渲染 character_matrix.md 内容
   */
  static renderCharacterMatrix(manifest: Manifest): string {
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
      lines.push(`- **特征**: ${character.traits.length > 0 ? character.traits.join('、') : '待补充'}`);
      if (Object.keys(character.relationships).length > 0) {
        lines.push('- **关系矩阵**:');
        for (const [targetId, description] of Object.entries(character.relationships)) {
          lines.push(`  - ${targetId}: ${description}`);
        }
      } else {
        lines.push('- **关系矩阵**: 暂无');
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * 计算 manifest 的 SHA-256 状态哈希
   */
  static computeStateHash(manifest: Manifest): string {
    const content = JSON.stringify(manifest);
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * 将所有投影文件写入状态目录
   */
  static writeProjectionFiles(
    manifest: Manifest,
    stateDir: string,
    summaries: ChapterSummaryRecord[]
  ): ProjectionFile[] {
    fs.mkdirSync(stateDir, { recursive: true });

    const files: ProjectionFile[] = [
      { name: 'current_state.md', content: this.renderCurrentState(manifest) },
      { name: 'hooks.md', content: this.renderHooks(manifest) },
      { name: 'chapter_summaries.md', content: this.renderChapterSummaries(summaries) },
      { name: 'subplot_board.md', content: this.renderSubplotBoard(manifest) },
      { name: 'emotional_arcs.md', content: this.renderEmotionalArcs(manifest) },
      { name: 'character_matrix.md', content: this.renderCharacterMatrix(manifest) },
    ];

    // Write Markdown files
    for (const file of files) {
      fs.writeFileSync(path.join(stateDir, file.name), file.content, 'utf-8');
    }

    // Write state hash
    const hash = this.computeStateHash(manifest);
    fs.writeFileSync(path.join(stateDir, '.state-hash'), hash, 'utf-8');
    files.push({ name: '.state-hash', content: hash });

    return files;
  }

  /**
   * 检测真相文件是否被手动编辑
   * 返回 true 表示检测到手动修改
   */
  static detectManualEdit(manifest: Manifest, stateDir: string): boolean {
    const hashPath = path.join(stateDir, '.state-hash');
    if (!fs.existsSync(hashPath)) return false;

    const storedHash = fs.readFileSync(hashPath, 'utf-8').trim();
    const currentHash = this.computeStateHash(manifest);

    return storedHash !== currentHash;
  }
}

// ─── Helper ────────────────────────────────────────────────────

function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!result[key]) result[key] = [];
    result[key].push(item);
  }
  return result;
}
