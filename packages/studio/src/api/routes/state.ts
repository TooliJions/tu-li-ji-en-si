import { Hono } from 'hono';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import {
  ProjectionRenderer,
  RuntimeStateStore,
  StateImporter,
  StateManager,
  SyncValidator,
  type ImportFileTarget,
  type Manifest,
} from '@cybernovelist/core';
import { getStudioRuntimeRootDir, hasStudioBookRuntime } from '../core-bridge';

const TRUTH_FILE_MAP = {
  chapter_summaries: {
    fileName: 'chapter_summaries.md',
    kind: 'markdown',
    importTarget: 'chapter_summaries.md',
  },
  character_matrix: { fileName: 'character_matrix.md', kind: 'markdown' },
  current_state: { fileName: 'current_state.md', kind: 'markdown', importTarget: 'current_state.md' },
  emotional_arcs: { fileName: 'emotional_arcs.md', kind: 'markdown' },
  hooks: { fileName: 'hooks.md', kind: 'markdown', importTarget: 'hooks.md' },
  manifest: { fileName: 'manifest.json', kind: 'json' },
  subplot_board: { fileName: 'subplot_board.md', kind: 'markdown' },
} as const;

const KNOWN_FILES = Object.keys(TRUTH_FILE_MAP) as Array<keyof typeof TRUTH_FILE_MAP>;

const importMarkdownSchema = z.object({
  fileName: z.string().min(1),
  markdownContent: z.string().min(1),
});

const rollbackSchema = z.object({
  targetChapter: z.number().int().positive(),
});

const updateTruthFileSchema = z.object({
  content: z.string(),
  versionToken: z.number().int().positive().optional(),
});

function getStateContext() {
  const manager = new StateManager(getStudioRuntimeRootDir());
  const store = new RuntimeStateStore(manager);
  return { manager, store };
}

function getStateDir(bookId: string): string {
  return path.join(getStudioRuntimeRootDir(), bookId, 'story', 'state');
}

function getTruthFilePath(bookId: string, fileName: keyof typeof TRUTH_FILE_MAP): string {
  return path.join(getStateDir(bookId), TRUTH_FILE_MAP[fileName].fileName);
}

function ensureBookExists(bookId: string) {
  return hasStudioBookRuntime(bookId);
}

function readManifest(bookId: string): Manifest {
  const { store } = getStateContext();
  return store.loadManifest(bookId);
}

function renderProjectionFile(manifest: Manifest, fileName: keyof typeof TRUTH_FILE_MAP): string {
  switch (fileName) {
    case 'chapter_summaries':
      return ProjectionRenderer.renderChapterSummaries([]);
    case 'character_matrix':
      return ProjectionRenderer.renderCharacterMatrix(manifest);
    case 'current_state':
      return ProjectionRenderer.renderCurrentState(manifest);
    case 'emotional_arcs':
      return ProjectionRenderer.renderEmotionalArcs(manifest);
    case 'hooks':
      return ProjectionRenderer.renderHooks(manifest);
    case 'subplot_board':
      return ProjectionRenderer.renderSubplotBoard(manifest);
    case 'manifest':
      return JSON.stringify(manifest, null, 2);
  }
}

function ensureTruthFilesExist(bookId: string): void {
  const manifest = readManifest(bookId);
  const stateDir = getStateDir(bookId);
  fs.mkdirSync(stateDir, { recursive: true });

  for (const fileName of KNOWN_FILES) {
    const filePath = getTruthFilePath(bookId, fileName);
    if (fs.existsSync(filePath)) {
      continue;
    }
    fs.writeFileSync(filePath, renderProjectionFile(manifest, fileName), 'utf-8');
  }

  const hashPath = path.join(stateDir, '.state-hash');
  if (!fs.existsSync(hashPath)) {
    fs.writeFileSync(hashPath, ProjectionRenderer.computeStateHash(manifest), 'utf-8');
  }
}

function buildTruthFileResponse(bookId: string, fileName: keyof typeof TRUTH_FILE_MAP) {
  ensureTruthFilesExist(bookId);
  const manifest = readManifest(bookId);
  const filePath = getTruthFilePath(bookId, fileName);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const content = TRUTH_FILE_MAP[fileName].kind === 'json' ? JSON.parse(raw) : { markdown: raw };
  return {
    name: fileName,
    content,
    versionToken: manifest.versionToken,
  };
}

function writeTruthFile(bookId: string, fileName: keyof typeof TRUTH_FILE_MAP, rawContent: string) {
  const filePath = getTruthFilePath(bookId, fileName);

  if (TRUTH_FILE_MAP[fileName].kind === 'json') {
    const parsed = JSON.parse(rawContent) as Manifest;
    fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), 'utf-8');
    return parsed;
  }

  let nextContent = rawContent;
  try {
    const parsed = JSON.parse(rawContent) as { markdown?: string };
    if (typeof parsed.markdown === 'string') {
      nextContent = parsed.markdown;
    }
  } catch {
    // Accept plain markdown body.
  }

  fs.writeFileSync(filePath, nextContent, 'utf-8');
  return { markdown: nextContent };
}

function getProjectionStatus(bookId: string) {
  ensureTruthFilesExist(bookId);
  const { manager, store } = getStateContext();
  const validator = new SyncValidator(manager, store);
  const report = validator.checkSync(bookId);
  const diff = validator.generateDiff(bookId);
  const manifest = store.loadManifest(bookId);
  const markdownFiles = KNOWN_FILES.filter((name) => TRUTH_FILE_MAP[name].kind === 'markdown').map((name) =>
    getTruthFilePath(bookId, name)
  );
  const markdownMtime = markdownFiles
    .filter((filePath) => fs.existsSync(filePath))
    .map((filePath) => fs.statSync(filePath).mtime.toISOString())
    .sort()
    .at(-1);

  return {
    synced: report.isInSync && diff.inSync,
    jsonHash: ProjectionRenderer.computeStateHash(manifest),
    markdownMtime: markdownMtime ?? '',
    discrepancies: [
      ...report.issues.map((issue) => issue.description),
      ...diff.files.map((file) => `${file.file} 与预期投影不一致`),
    ],
  };
}

function toImportTarget(fileName: keyof typeof TRUTH_FILE_MAP): ImportFileTarget | null {
  const file = TRUTH_FILE_MAP[fileName];
  const target = 'importTarget' in file ? file.importTarget : undefined;
  return target ?? null;
}

function summarizeImportDiff(actions: Array<{ type: string; payload: Record<string, unknown> }>): string[] {
  return actions.map((action) => {
    switch (action.type) {
      case 'set_focus':
        return `更新当前焦点: ${String(action.payload.focus ?? '')}`;
      case 'add_hook':
        return `新增伏笔: ${String(action.payload.description ?? '')}`;
      case 'add_character':
        return `新增角色: ${String(action.payload.name ?? '')}`;
      case 'add_world_rule':
        return `新增设定: ${String(action.payload.rule ?? '')}`;
      default:
        return `应用变更: ${action.type}`;
    }
  });
}

export function createStateRouter(): Hono {
  const router = new Hono();

  router.get('/', (c) => {
    const bookId = c.req.param('bookId')!;
    if (!ensureBookExists(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    ensureTruthFilesExist(bookId);
    const manifest = readManifest(bookId);
    const files = KNOWN_FILES.map((name) => {
      const filePath = getTruthFilePath(bookId, name);
      const stat = fs.statSync(filePath);
      return {
        name,
        updatedAt: stat.mtime.toISOString(),
        size: stat.size,
      };
    }).sort((left, right) => left.name.localeCompare(right.name));

    return c.json({ data: { versionToken: manifest.versionToken, files } });
  });

  router.get('/projection-status', (c) => {
    const bookId = c.req.param('bookId')!;
    if (!ensureBookExists(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    return c.json({ data: getProjectionStatus(bookId) });
  });

  router.post('/import-markdown', async (c) => {
    const bookId = c.req.param('bookId')!;
    if (!ensureBookExists(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const result = importMarkdownSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }

    const fileName = result.data.fileName as keyof typeof TRUTH_FILE_MAP;
    if (!KNOWN_FILES.includes(fileName)) {
      return c.json({ error: { code: 'FILE_NOT_FOUND', message: '真相文件不存在' } }, 404);
    }

    const importTarget = toImportTarget(fileName);
    if (!importTarget) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: '当前文件暂不支持 Markdown 导入' } },
        400
      );
    }

    const { manager, store } = getStateContext();
    const importer = new StateImporter(manager, store);
    const preview = importer.previewImport(bookId, result.data.markdownContent, importTarget);
    if (!preview.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: preview.errors?.[0] ?? preview.summary } },
        400
      );
    }

    const applied = importer.applyImport(bookId, result.data.markdownContent, importTarget);
    if (!applied.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: applied.errors?.[0] ?? applied.summary } },
        400
      );
    }

    return c.json({
      data: {
        parsed: {
          versionToken: applied.newVersionToken ?? readManifest(bookId).versionToken,
          diff: summarizeImportDiff(applied.actions),
        },
        preview: applied.summary,
      },
    });
  });

  router.post('/rollback', async (c) => {
    const bookId = c.req.param('bookId')!;
    if (!ensureBookExists(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const result = rollbackSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }
    return c.json({ data: { rollback: true, targetChapter: result.data.targetChapter } });
  });

  router.get('/:fileName', (c) => {
    const bookId = c.req.param('bookId')!;
    if (!ensureBookExists(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const fileName = c.req.param('fileName') as keyof typeof TRUTH_FILE_MAP;
    if (!KNOWN_FILES.includes(fileName)) {
      return c.json({ error: { code: 'FILE_NOT_FOUND', message: '真相文件不存在' } }, 404);
    }

    return c.json({ data: buildTruthFileResponse(bookId, fileName) });
  });

  router.put('/:fileName', async (c) => {
    const bookId = c.req.param('bookId')!;
    if (!ensureBookExists(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const fileName = c.req.param('fileName') as keyof typeof TRUTH_FILE_MAP;
    if (!KNOWN_FILES.includes(fileName)) {
      return c.json({ error: { code: 'FILE_NOT_FOUND', message: '真相文件不存在' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const result = updateTruthFileSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }

    const content = writeTruthFile(bookId, fileName, result.data.content);
    const manifest = readManifest(bookId);
    return c.json({ data: { name: fileName, content, versionToken: manifest.versionToken } });
  });

  return router;
}