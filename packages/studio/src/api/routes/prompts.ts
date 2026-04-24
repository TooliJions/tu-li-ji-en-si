import { Hono } from 'hono';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { PromptRegistry, type PromptTemplate } from '@cybernovelist/core';

const setVersionSchema = z.object({ version: z.enum(['v1', 'v2', 'latest']) });
const diffSchema = z.object({
  from: z.enum(['v1', 'v2', 'latest']),
  to: z.enum(['v1', 'v2', 'latest']),
});

function resolvePromptsDir(): string {
  const cwd = process.cwd();
  let dir = cwd;
  const fsRoot = path.parse(dir).root;
  while (dir !== fsRoot) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { name?: string };
        if (pkg.name === '@cybernovelist/studio') {
          return path.join(dir, '..', 'core', 'src', 'prompts');
        }
      } catch {
        // ignore malformed package.json
      }
    }
    dir = path.dirname(dir);
  }
  return path.join(cwd, '..', 'core', 'src', 'prompts');
}

function getOrCreateRegistry(): PromptRegistry {
  const baseDir = process.env.PROMPTS_BASE_DIR ?? resolvePromptsDir();
  return new PromptRegistry({ baseDir });
}

function listPromptTemplates(
  registry: PromptRegistry
): Array<{ name: string; versions: string[] }> {
  const versions = registry.listVersions();
  const nameVersions = new Map<string, string[]>();

  for (const version of versions) {
    const versionDir = path.join(resolvePromptsDir(), version);
    if (!fs.existsSync(versionDir)) continue;
    for (const file of fs.readdirSync(versionDir)) {
      if (file.endsWith('.md')) {
        const name = file.replace('.md', '');
        const entry = nameVersions.get(name) ?? [];
        entry.push(version);
        nameVersions.set(name, entry);
      }
    }
  }

  return Array.from(nameVersions.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, vers]) => ({ name, versions: vers }));
}

function readPromptFile(registry: PromptRegistry, name: string, version?: string): PromptTemplate {
  return registry.loadPrompt(name, version);
}

function computeDiff(from: PromptTemplate, to: PromptTemplate): string {
  const fromLines = from.template.split('\n');
  const toLines = to.template.split('\n');
  const maxLines = Math.max(fromLines.length, toLines.length);
  const diff: string[] = [];

  for (let i = 0; i < maxLines; i++) {
    const fromLine = fromLines[i] ?? '';
    const toLine = toLines[i] ?? '';
    if (fromLine !== toLine) {
      if (fromLine) diff.push(`- ${fromLine}`);
      if (toLine) diff.push(`+ ${toLine}`);
    }
  }

  return diff.join('\n') || '无差异';
}

export function createPromptsRouter(): Hono {
  const router = new Hono();

  // GET /api/books/:bookId/prompts
  router.get('/', (c) => {
    const registry = getOrCreateRegistry();
    const templates = listPromptTemplates(registry);
    const manifest = registry.loadManifest();

    // Add explicit version entries for known versions (v1, v2)
    const knownVersions = [
      { version: 'v1', label: 'V1 — 初始版本（三幕式结构）', date: '2025-01-01', agentCount: 21 },
      {
        version: 'v2',
        label: 'V2 — 优化版本（增强审计与逻辑一致性）',
        date: '2025-06-01',
        agentCount: 22,
      },
      { version: 'latest', label: 'Latest — 跟随最新版本', date: '当前', agentCount: 22 },
    ];

    return c.json({
      data: {
        versions: knownVersions,
        current: manifest.latest,
        latest: manifest.latest,
        templates,
      },
    });
  });

  // POST /api/books/:bookId/prompts/set
  router.post('/set', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const result = setVersionSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }

    const registry = getOrCreateRegistry();
    const concrete = registry.resolveVersion(result.data.version);
    return c.json({ data: { version: concrete, switched: true } });
  });

  // GET /api/books/:bookId/prompts/diff
  router.get('/diff', (c) => {
    const from = c.req.query('from');
    const to = c.req.query('to');
    if (!from || !to) {
      return c.json({ error: { code: 'INVALID_STATE', message: '缺少 from 或 to 参数' } }, 400);
    }

    const result = diffSchema.safeParse({ from, to });
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }

    const registry = getOrCreateRegistry();
    const templates = listPromptTemplates(registry);
    const diffs: Array<{ name: string; fromVersion: string; toVersion: string; diff: string }> = [];

    for (const tpl of templates) {
      try {
        const fromTpl = readPromptFile(registry, tpl.name, result.data.from);
        const toTpl = readPromptFile(registry, tpl.name, result.data.to);
        diffs.push({
          name: tpl.name,
          fromVersion: result.data.from,
          toVersion: result.data.to,
          diff: computeDiff(fromTpl, toTpl),
        });
      } catch {
        // skip prompts not available in both versions
      }
    }

    // Merge all diffs into a single string for frontend compatibility
    const mergedDiff =
      diffs.map((d) => `## ${d.name}\n\n${d.diff}`).join('\n\n---\n\n') || '无差异';

    return c.json({
      data: { from: result.data.from, to: result.data.to, diffs, diff: mergedDiff },
    });
  });

  // GET /api/books/:bookId/prompts/:name
  router.get('/:name', (c) => {
    const name = decodeURIComponent(c.req.param('name'));
    const version = c.req.query('version') || 'latest';
    const registry = getOrCreateRegistry();

    try {
      const template = readPromptFile(registry, name, version);
      return c.json({ data: template });
    } catch {
      return c.json({ error: { code: 'PROMPT_NOT_FOUND', message: '提示词不存在' } }, 404);
    }
  });

  return router;
}
