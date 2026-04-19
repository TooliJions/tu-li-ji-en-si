import type { AgentResult, AgentContext } from '../agents/base';
import type { Manifest, Hook, Fact, Character, WorldRule } from '../models/state';

// ─── Config ──────────────────────────────────────────────────────

const ACTIVE_HOOK_STATUSES = new Set(['open', 'progressing', 'deferred', 'dormant']);

export interface ContextRule {
  id: string;
  type: 'character' | 'hook' | 'fact' | 'world-rule';
  condition: string;
  priority: number;
  enabled: boolean;
  action?: 'include' | 'exclude';
}

export interface ContextGovernorInput {
  bookId: string;
  chapterNumber: number;
  manifest: Manifest;
  focusCharacters?: string[];
  relevanceWindow?: number;
  rules?: ContextRule[];
}

export interface ContextGovernorOutput {
  filteredCharacters: Character[];
  filteredHooks: Hook[];
  filteredFacts: Fact[];
  filteredWorldRules: WorldRule[];
  excludedIds: {
    characters: string[];
    hooks: string[];
    facts: string[];
    worldRules: string[];
  };
}

// ─── ContextGovernor ────────────────────────────────────────────

export class ContextGovernor {
  /**
   * 执行上下文治理：过滤、排序、排除不相关条目。
   */
  async execute(input: ContextGovernorInput): Promise<AgentResult> {
    if (!input.manifest) {
      return { success: false, error: 'manifest 不能为空' };
    }
    if (input.chapterNumber < 1) {
      return { success: false, error: '章节号必须从 1 开始' };
    }

    const relevanceWindow = input.relevanceWindow ?? 0;
    const excludedIds = {
      characters: [] as string[],
      hooks: [] as string[],
      facts: [] as string[],
      worldRules: [] as string[],
    };

    // 1. 过滤伏笔：排除 abandoned/resolved
    const filteredHooks = input.manifest.hooks.filter((h) => ACTIVE_HOOK_STATUSES.has(h.status));
    for (const h of input.manifest.hooks) {
      if (!filteredHooks.includes(h)) excludedIds.hooks.push(h.id);
    }

    // 2. 过滤角色：按相关性窗口
    let filteredCharacters = input.manifest.characters;
    if (relevanceWindow > 0) {
      filteredCharacters = input.manifest.characters.filter((c) => {
        if (!c.lastAppearance) return true;
        return input.chapterNumber - c.lastAppearance <= relevanceWindow;
      });
      for (const c of input.manifest.characters) {
        if (!filteredCharacters.includes(c)) excludedIds.characters.push(c.id);
      }
    }

    // 3. 聚焦角色优先排序：focusCharacters 排在前面
    if (input.focusCharacters && input.focusCharacters.length > 0) {
      filteredCharacters.sort((a, b) => {
        const aFocused = input.focusCharacters!.includes(a.name) ? 0 : 1;
        const bFocused = input.focusCharacters!.includes(b.name) ? 0 : 1;
        return aFocused - bFocused;
      });
    }

    // 4. 事实：全部保留（低数据量）
    const filteredFacts = [...input.manifest.facts];

    // 5. 世界规则：全部保留
    const filteredWorldRules = [...input.manifest.worldRules];

    // 6. 应用自定义规则
    if (input.rules && input.rules.length > 0) {
      for (const rule of input.rules) {
        if (!rule.enabled) continue;
        this.#applyRule(
          rule,
          filteredCharacters,
          filteredHooks,
          filteredFacts,
          filteredWorldRules,
          excludedIds
        );
      }
    }

    const data: ContextGovernorOutput = {
      filteredCharacters,
      filteredHooks,
      filteredFacts,
      filteredWorldRules,
      excludedIds,
    };

    return { success: true, data };
  }

  /**
   * 生成 context.json 字符串。
   */
  generateContextJson(
    output: ContextGovernorOutput,
    meta?: { bookId?: string; chapterNumber?: number }
  ): string {
    return JSON.stringify(
      {
        bookId: meta?.bookId,
        chapterNumber: meta?.chapterNumber,
        characters: output.filteredCharacters.map((c) => ({
          id: c.id,
          name: c.name,
          role: c.role,
        })),
        hooks: output.filteredHooks.map((h) => ({
          id: h.id,
          description: h.description,
          status: h.status,
          priority: h.priority,
        })),
        facts: output.filteredFacts.map((f) => ({
          id: f.id,
          content: f.content,
          category: f.category,
          confidence: f.confidence,
        })),
        worldRules: output.filteredWorldRules.map((w) => ({
          id: w.id,
          category: w.category,
          rule: w.rule,
        })),
      },
      null,
      2
    );
  }

  // ── Private helpers ───────────────────────────────────────────

  #applyRule(
    rule: ContextRule,
    characters: Character[],
    hooks: Hook[],
    facts: Fact[],
    worldRules: WorldRule[],
    excludedIds: ContextGovernorOutput['excludedIds']
  ): void {
    const action = rule.action ?? 'exclude';

    switch (rule.type) {
      case 'fact': {
        const keepFacts = facts.filter((f) => {
          const matches = this.#evalCondition(rule.condition, f);
          return action === 'exclude' ? !matches : matches;
        });
        for (const f of facts) {
          if (!keepFacts.includes(f)) excludedIds.facts.push(f.id);
        }
        facts.splice(0, facts.length, ...keepFacts);
        break;
      }
      case 'hook': {
        const keepHooks = hooks.filter((h) => {
          const matches = this.#evalCondition(rule.condition, h);
          return action === 'exclude' ? !matches : matches;
        });
        for (const h of hooks) {
          if (!keepHooks.includes(h)) excludedIds.hooks.push(h.id);
        }
        hooks.splice(0, hooks.length, ...keepHooks);
        break;
      }
      case 'character': {
        const keepChars = characters.filter((c) => {
          const matches = this.#evalCondition(rule.condition, c);
          return action === 'exclude' ? !matches : matches;
        });
        for (const c of characters) {
          if (!keepChars.includes(c)) excludedIds.characters.push(c.id);
        }
        characters.splice(0, characters.length, ...keepChars);
        break;
      }
      case 'world-rule': {
        const keepRules = worldRules.filter((w) => {
          const matches = this.#evalCondition(rule.condition, w);
          return action === 'exclude' ? !matches : matches;
        });
        for (const w of worldRules) {
          if (!keepRules.includes(w)) excludedIds.worldRules.push(w.id);
        }
        worldRules.splice(0, worldRules.length, ...keepRules);
        break;
      }
    }
  }

  #evalCondition(condition: string, item: Record<string, unknown>): boolean {
    try {
      // 简单条件求值：支持 ===、includes 等基础操作
      const fn = new Function('item', `return (${condition});`);
      return !!fn(item);
    } catch {
      return false;
    }
  }
}
