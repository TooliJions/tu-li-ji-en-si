import type { Delta } from '../models/state';

// ─── Types ─────────────────────────────────────────────────────

export type DeltaAction = Delta['actions'][number];

export interface MarkdownDelta {
  sourceFile: string;
  actions: DeltaAction[];
}

// ─── MarkdownDeltaParser ─────────────────────────────────────────
// 从 Markdown 投影文件内容中解析 JSON Delta 变更。

export class MarkdownDeltaParser {
  /**
   * 从 Markdown 内容字符串中解析变更，生成 JSON Delta（不依赖文件系统）。
   */
  static parse(content: string, file: string): MarkdownDelta | null {
    switch (file) {
      case 'current_state.md':
        return MarkdownDeltaParser.#parseCurrentState(content, file);
      case 'hooks.md':
        return MarkdownDeltaParser.#parseHooks(content, file);
      case 'chapter_summaries.md':
        return MarkdownDeltaParser.#parseChapterSummaries(content, file);
      default:
        return null;
    }
  }

  static #parseCurrentState(content: string, file: string): MarkdownDelta {
    const actions: DeltaAction[] = [];

    // Parse focus
    const focusMatch = content.match(/## 当前焦点\s*\n\n([\s\S]*?)(?=\n##|$)/);
    if (focusMatch) {
      const focus = focusMatch[1].trim();
      if (focus) {
        actions.push({ type: 'set_focus', payload: { focus } });
      }
    }

    // Parse characters
    const charRegex = /### (.+?) \[(.+?)\]\s*\n([\s\S]*?)(?=### |## 世界设定|## 记忆事实|$)/g;
    let charMatch: RegExpExecArray | null;
    while ((charMatch = charRegex.exec(content)) !== null) {
      const name = charMatch[1].trim();
      const roleLabel = charMatch[2].trim();
      const details = charMatch[3];

      const roleMap: Record<string, string> = {
        主角: 'protagonist',
        反派: 'antagonist',
        配角: 'supporting',
        路人: 'minor',
      };

      const traits: string[] = [];
      const traitsMatch = details.match(/\*\*特征\*\*:\s*(.+)/);
      if (traitsMatch) {
        traits.push(...traitsMatch[1].split('、').map((t) => t.trim()));
      }

      let arc: string | undefined;
      const arcMatch = details.match(/\*\*角色弧光\*\*:\s*(.+)/);
      if (arcMatch) arc = arcMatch[1].trim();

      actions.push({
        type: 'add_character',
        payload: { name, role: roleMap[roleLabel] ?? roleLabel, traits, arc, relationships: {} },
      });
    }

    // Parse world rules
    const ruleRegex = /- \[(.+?)\] (.+)/g;
    let ruleMatch: RegExpExecArray | null;
    while ((ruleMatch = ruleRegex.exec(content)) !== null) {
      actions.push({
        type: 'add_world_rule',
        payload: { category: ruleMatch[1].trim(), rule: ruleMatch[2].trim(), exceptions: [] },
      });
    }

    return { sourceFile: file, actions };
  }

  static #parseHooks(content: string, file: string): MarkdownDelta {
    const actions: DeltaAction[] = [];

    const hookRegex = /### (.+)/g;
    let hookMatch: RegExpExecArray | null;
    while ((hookMatch = hookRegex.exec(content)) !== null) {
      const description = hookMatch[1].trim();
      if (description === '伏笔追踪') continue;

      const rest = content.substring(hookMatch.index);
      const lines = rest.split('\n').slice(1, 10);
      const priorityMatch = lines.find((l) => l.includes('优先级'));
      const priority = priorityMatch
        ? priorityMatch.includes('critical')
          ? 'critical'
          : priorityMatch.includes('major')
            ? 'major'
            : 'minor'
        : 'minor';

      const chapterMatch = lines.find((l) => l.includes('埋设章节'));
      const plantedCh = chapterMatch
        ? parseInt(chapterMatch.match(/第 (\d+) 章/)?.[1] ?? '1', 10)
        : 1;

      actions.push({
        type: 'add_hook',
        payload: {
          description,
          type: 'narrative',
          status: 'open',
          priority,
          plantedCh,
          relatedCharacters: [],
          relatedChapters: [],
        },
      });
    }

    return { sourceFile: file, actions };
  }

  static #parseChapterSummaries(_content: string, file: string): MarkdownDelta {
    // Chapter summaries are read-only from SQLite
    return { sourceFile: file, actions: [] };
  }
}
