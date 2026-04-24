import { Hono } from 'hono';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { IntentDirector, RuntimeStateStore, StateManager } from '@cybernovelist/core';
import {
  hasStudioBookRuntime,
  readStudioBookRuntime,
  getStudioRuntimeRootDir,
} from '../core-bridge';
import { getRequestContext } from '../context';

const commandSchema = z.object({ message: z.string().min(1) });
const askSchema = z.object({ question: z.string().min(1) });

const HISTORY_FILE = 'natural-agent-history.json';

interface HistoryEntry {
  id: string;
  type: 'command' | 'ask';
  input: string;
  output: string;
  timestamp: string;
}

function getHistoryPath(bookId: string): string {
  return path.join(getStudioRuntimeRootDir(), bookId, 'story', 'state', HISTORY_FILE);
}

function loadHistory(bookId: string): HistoryEntry[] {
  const histPath = getHistoryPath(bookId);
  if (!fs.existsSync(histPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(histPath, 'utf-8')) as HistoryEntry[];
  } catch {
    return [];
  }
}

function saveHistory(bookId: string, entries: HistoryEntry[]) {
  const histPath = getHistoryPath(bookId);
  fs.writeFileSync(histPath, JSON.stringify(entries, null, 2), 'utf-8');
}

function appendHistory(bookId: string, entry: HistoryEntry, maxEntries = 50) {
  const entries = loadHistory(bookId);
  entries.unshift(entry);
  if (entries.length > maxEntries) {
    entries.length = maxEntries;
  }
  saveHistory(bookId, entries);
}

function readChapterContent(bookId: string, chapterNumber?: number): string {
  const chapterDir = path.join(getStudioRuntimeRootDir(), bookId, 'story', 'chapters');
  if (!fs.existsSync(chapterDir)) return '';

  const targetChapter =
    chapterNumber ??
    (() => {
      try {
        const manager = new StateManager(getStudioRuntimeRootDir());
        const store = new RuntimeStateStore(manager);
        const manifest = store.loadManifest(bookId);
        return manifest.lastChapterWritten ?? 1;
      } catch {
        return 1;
      }
    })();

  const padded = String(targetChapter).padStart(4, '0');
  const filePath = path.join(chapterDir, `chapter-${padded}.md`);
  if (!fs.existsSync(filePath)) return '';
  const raw = fs.readFileSync(filePath, 'utf-8');
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  return match ? raw.slice(match[0].length).trim() : raw.trim();
}

function buildContextSummary(bookId: string): string {
  try {
    const manager = new StateManager(getStudioRuntimeRootDir());
    const store = new RuntimeStateStore(manager);
    const manifest = store.loadManifest(bookId);

    const parts: string[] = [];

    if (manifest.characters.length > 0) {
      parts.push('## 角色档案');
      for (const ch of manifest.characters) {
        const traits = ch.traits.join('、');
        const relations = Object.entries(ch.relationships)
          .map(([id, rel]) => `${id}: ${rel}`)
          .join('；');
        parts.push(
          `- ${ch.name}：${ch.role || '未知'} | 特质：${traits}${relations ? ` | 关系：${relations}` : ''}`
        );
      }
    }

    if (manifest.facts.length > 0) {
      parts.push('## 已知事实');
      for (const fact of manifest.facts.slice(-10)) {
        parts.push(`- [${fact.confidence}] ${fact.content}`);
      }
    }

    if (manifest.hooks.length > 0) {
      const activeHooks = manifest.hooks.filter(
        (h) => h.status === 'open' || h.status === 'progressing'
      );
      if (activeHooks.length > 0) {
        parts.push('## 活跃伏笔');
        for (const hook of activeHooks) {
          parts.push(`- [${hook.priority}] ${hook.description}`);
        }
      }
    }

    return parts.join('\n') || '暂无设定数据';
  } catch {
    return '暂无设定数据';
  }
}

function buildCommandActions(
  message: string,
  chapterContent: string,
  contextSummary: string
): string {
  const lower = message.toLowerCase();
  const actions: string[] = [];

  if (/润色|精炼|polish/.test(lower)) {
    actions.push('text_polish: 对当前章节或指定段落进行文风润色');
  }
  if (/重写|改写|rewrite/.test(lower)) {
    actions.push('text_rewrite: 按新意图重写指定段落');
  }
  if (/续写|继续|continue/.test(lower)) {
    actions.push('text_continue: 从当前位置继续写作');
  }
  if (/总结|摘要|summary/.test(lower)) {
    actions.push('summarize: 生成当前章节摘要');
  }
  if (/伏笔|hook/.test(lower)) {
    actions.push('hook_management: 分析伏笔状态');
  }
  if (/角色|character/.test(lower)) {
    actions.push('character_query: 查询角色信息');
  }

  if (actions.length === 0) {
    actions.push('general_write: 按用户指令执行通用写作操作');
  }

  return actions.join('；');
}

export function createNaturalAgentRouter(): Hono {
  const router = new Hono();

  // POST /api/books/:bookId/natural-agent/command
  router.post('/command', async (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const result = commandSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }

    const book = readStudioBookRuntime(bookId);
    const chapterContent = readChapterContent(bookId);
    const contextSummary = buildContextSummary(bookId);
    const actions = buildCommandActions(result.data.message, chapterContent, contextSummary);

    // Use IntentDirector to parse the command into structured guidance
    const { provider } = getRequestContext(c);
    const director = new IntentDirector(provider);
    const intentResult = await director.execute({
      bookId,
      promptContext: {
        input: {
          userIntent: result.data.message,
          chapterNumber: book?.chapterCount ? book.chapterCount + 1 : 1,
          genre: book?.genre ?? 'urban',
        },
      },
    });

    const output = intentResult.success
      ? JSON.stringify({
          narrativeGoal: (intentResult.data as any)?.narrativeGoal ?? result.data.message,
          actions,
          contextSummary,
        })
      : `指令解析失败：${intentResult.error}`;

    const entry: HistoryEntry = {
      id: `cmd-${Date.now()}`,
      type: 'command',
      input: result.data.message,
      output,
      timestamp: new Date().toISOString(),
    };
    appendHistory(bookId, entry);

    return c.json({
      data: {
        actions: actions.split('；').map((a) => {
          const [type, description] = a.split(': ');
          return { type, description: description ?? a };
        }),
        rawMessage: result.data.message,
        bookId,
        intent: intentResult.success ? intentResult.data : null,
        contextSummary,
      },
    });
  });

  // POST /api/books/:bookId/natural-agent/ask
  router.post('/ask', async (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const result = askSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }

    const contextSummary = buildContextSummary(bookId);

    // Construct a prompt that answers the question based on book context
    const prompt = `你是一位小说创作助手。请基于以下设定数据，回答用户的问题。

## 设定上下文

${contextSummary}

## 用户问题

${result.data.question}

请基于设定数据给出准确回答。如果设定中没有相关信息，请明确说明。`;

    const { provider } = getRequestContext(c);
    let answer: string;
    try {
      const response = await provider.generate({ prompt });
      answer = response.text;
    } catch (err) {
      answer = `查询失败：${err instanceof Error ? err.message : '未知错误'}`;
    }

    const entry: HistoryEntry = {
      id: `ask-${Date.now()}`,
      type: 'ask',
      input: result.data.question,
      output: answer,
      timestamp: new Date().toISOString(),
    };
    appendHistory(bookId, entry);

    return c.json({
      data: {
        answer,
        rawQuestion: result.data.question,
        bookId,
        contextSummary,
      },
    });
  });

  // GET /api/books/:bookId/natural-agent/history
  router.get('/history', (c) => {
    const bookId = c.req.param('bookId')!;
    const limit = parseInt(c.req.query('limit') || '20', 10);
    const entries = loadHistory(bookId).slice(0, limit);

    return c.json({
      data: {
        messages: entries,
        total: entries.length,
        limit,
      },
    });
  });

  return router;
}
