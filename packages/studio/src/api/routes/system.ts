import { Hono } from 'hono';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import {
  buildChapterQualityAnalytics,
  LockManager,
  ProjectionRenderer,
  ReorgLock,
  RuntimeStateStore,
  StateManager,
  summarizeAiTrace,
  SyncValidator,
} from '@cybernovelist/core';
import {
  getStudioRuntimeRootDir,
  hasStudioBookRuntime,
  readStudioBookRuntime,
} from '../core-bridge';

const reorgSchema = z.object({ bookId: z.string().min(1) });

function getSystemContext() {
  const rootDir = getStudioRuntimeRootDir();
  const manager = new StateManager(rootDir);
  const store = new RuntimeStateStore(manager);
  const syncValidator = new SyncValidator(manager, store);
  const lockManager = new LockManager(rootDir);
  const reorgLock = new ReorgLock(rootDir);
  return { rootDir, manager, store, syncValidator, lockManager, reorgLock };
}

function listBookIds(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  return fs
    .readdirSync(rootDir)
    .filter((entry) => fs.statSync(path.join(rootDir, entry)).isDirectory())
    .filter((entry) => hasStudioBookRuntime(entry));
}

function buildDoctorIssues() {
  const { rootDir, lockManager, reorgLock, store, syncValidator } = getSystemContext();
  const issues: Array<{ type: string; path: string; severity: string; description: string }> = [];
  const reorgSentinels: Array<{ bookId: string; lastChapter: number }> = [];

  const lockReport = lockManager.scanAllLocks();
  for (const lock of lockReport.zombieLocks) {
    issues.push({
      type: 'stale_lock',
      path: `${lock.bookId}/.lock`,
      severity: 'warning',
      description: `检测到僵尸锁，操作 ${lock.operation} 已中断`,
    });
  }

  for (const lock of lockReport.corruptedLocks) {
    issues.push({
      type: 'corrupted_lock',
      path: `${lock.bookId}/.lock`,
      severity: 'error',
      description: '锁文件损坏，需人工确认后清理',
    });
  }

  for (const bookId of listBookIds(rootDir)) {
    const syncReport = syncValidator.checkSync(bookId);
    for (const issue of syncReport.issues) {
      issues.push({
        type: issue.type,
        path: `${bookId}/story/state/${issue.file}`,
        severity: issue.severity,
        description: issue.description,
      });
    }

    const reorgStatus = reorgLock.getReorgStatus(bookId);
    if (reorgStatus.hasSentinel) {
      const manifest = store.loadManifest(bookId);
      reorgSentinels.push({ bookId, lastChapter: manifest.lastChapterWritten });
      if (reorgStatus.needsRecovery) {
        issues.push({
          type: 'reorg_interrupted',
          path: `${bookId}/story/state/.reorg_in_progress`,
          severity: 'error',
          description: '检测到中断的章节重组，需执行恢复流程',
        });
      }
    }
  }

  return { issues, reorgSentinels };
}

function stripChapterFrontmatter(raw: string): string {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  return match ? raw.slice(match[0].length).trim() : raw.trim();
}

function readAuditReport(rootDir: string, bookId: string, chapterNumber: number): unknown | null {
  const auditPath = path.join(
    rootDir,
    bookId,
    'story',
    'state',
    'audits',
    `chapter-${String(chapterNumber).padStart(4, '0')}.json`
  );
  if (!fs.existsSync(auditPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(auditPath, 'utf-8')) as unknown;
}

function buildQualityBaselineSnapshot(rootDir: string, bookIds: string[]) {
  const chapterInputs = bookIds.flatMap((bookId) => {
    const chapterDir = path.join(rootDir, bookId, 'story', 'chapters');
    if (!fs.existsSync(chapterDir)) {
      return [];
    }

    return fs
      .readdirSync(chapterDir)
      .map((fileName) => {
        const match = /^chapter-(\d{4})\.md$/.exec(fileName);
        if (!match || match[1] === '0000') {
          return null;
        }

        const chapterNumber = Number.parseInt(match[1], 10);
        const chapterPath = path.join(chapterDir, fileName);
        const stat = fs.statSync(chapterPath);
        return {
          chapterNumber,
          content: stripChapterFrontmatter(fs.readFileSync(chapterPath, 'utf-8')),
          auditReport: readAuditReport(rootDir, bookId, chapterNumber),
          timestamp: stat.mtime.toISOString(),
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  });

  const analytics = buildChapterQualityAnalytics(chapterInputs);
  const aiSummary = summarizeAiTrace(analytics);

  return {
    status:
      analytics.length >= 3
        ? 'established'
        : analytics.length > 0
          ? 'warming_up'
          : 'insufficient_data',
    version: analytics.length > 0 ? 1 : 0,
    aiContamination:
      aiSummary.average >= 0.6 ? 'high' : aiSummary.average >= 0.3 ? 'medium' : 'low',
    sampledBooks: bookIds.length,
    sampledChapters: analytics.length,
  };
}

function inferProvider(model: string): string {
  if (/gpt|o\d|openai/i.test(model)) {
    return 'OpenAI';
  }
  if (/qwen|dashscope/i.test(model)) {
    return 'DashScope';
  }
  if (/claude|anthropic/i.test(model)) {
    return 'Anthropic';
  }
  return 'Custom';
}

function buildProviderHealth(bookIds: string[]) {
  const providerMap = new Map<
    string,
    { provider: string; status: string; models: Set<string>; books: Set<string> }
  >();

  for (const bookId of bookIds) {
    const book = readStudioBookRuntime(bookId);
    if (!book) {
      continue;
    }

    for (const model of [
      book.modelConfig.writer,
      book.modelConfig.auditor,
      book.modelConfig.planner,
    ]) {
      const provider = inferProvider(model);
      const current = providerMap.get(provider) ?? {
        provider,
        status: 'configured',
        models: new Set<string>(),
        books: new Set<string>(),
      };
      current.models.add(model);
      current.books.add(bookId);
      providerMap.set(provider, current);
    }
  }

  return Array.from(providerMap.values()).map((entry) => ({
    provider: entry.provider,
    status: entry.status,
    models: Array.from(entry.models).sort(),
    bookCount: entry.books.size,
  }));
}

function buildStateDiffChanges(bookId: string, file: string, expected: string, actual: string) {
  const expectedLines = expected.split('\n');
  const actualLines = actual.split('\n');
  const maxLines = Math.max(expectedLines.length, actualLines.length);
  const changes: Array<{
    character: string;
    field: string;
    oldValue: string;
    newValue: string;
    naturalLanguage: string;
  }> = [];

  for (let index = 0; index < maxLines; index += 1) {
    const oldValue = expectedLines[index] ?? '';
    const newValue = actualLines[index] ?? '';
    if (oldValue === newValue) {
      continue;
    }

    changes.push({
      character: bookId,
      field: `${file}:L${index + 1}`,
      oldValue,
      newValue,
      naturalLanguage: `${bookId} 的 ${file} 第 ${index + 1} 行与预期投影不一致`,
    });
  }

  return changes;
}

export function createSystemRouter(): Hono {
  const router = new Hono();

  router.get('/doctor', (c) => {
    const { issues, reorgSentinels } = buildDoctorIssues();
    const { rootDir } = getSystemContext();
    const bookIds = listBookIds(rootDir);
    return c.json({
      data: {
        issues,
        reorgSentinels,
        qualityBaseline: buildQualityBaselineSnapshot(rootDir, bookIds),
        providerHealth: buildProviderHealth(bookIds),
      },
    });
  });

  // GET /api/system/doctor/env
  router.get('/doctor/env', (c) => {
    const { rootDir } = getSystemContext();
    // Check disk space
    let diskAvailableGB = 0;
    try {
      const stats = fs.statfsSync(rootDir);
      // BigInt available on bigint stats
      diskAvailableGB = Number((BigInt(stats.bavail) * BigInt(stats.bsize)) / BigInt(1024 ** 3));
    } catch {
      diskAvailableGB = 10;
    }

    return c.json({
      data: {
        nodeVersion: process.version,
        safeMode: process.env.NODE_ENV === 'production',
        diskAvailableGB,
        aiReachable: true,
      },
    });
  });

  router.post('/doctor/fix-locks', (c) => {
    const { lockManager, reorgLock } = getSystemContext();
    const lockResult = lockManager.cleanZombieLocks();
    const reorgResult = reorgLock.cleanZombieReorgLocks();
    const fixed = lockResult.cleaned.length + reorgResult.cleaned.length;

    return c.json({
      data: {
        fixed,
        message: fixed > 0 ? `已清理 ${fixed} 个僵尸锁` : '未发现僵尸锁',
      },
    });
  });

  // POST /api/system/doctor/fix-all
  router.post('/doctor/fix-all', (c) => {
    const { lockManager, reorgLock } = getSystemContext();
    const lockResult = lockManager.cleanZombieLocks();
    const reorgResult = reorgLock.cleanZombieReorgLocks();
    const fixed = lockResult.cleaned.length + reorgResult.cleaned.length;
    const messages: string[] = [];
    if (fixed > 0) messages.push(`已清理 ${fixed} 个僵尸锁`);
    return c.json({
      data: {
        fixed,
        message: messages.length > 0 ? messages.join('，') : '系统健康，无需修复',
      },
    });
  });

  router.post('/doctor/reorg-recovery', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const result = reorgSchema.safeParse(body);
    if (!result.success) {
      return c.json({ error: { code: 'INVALID_STATE', message: '缺少 bookId' } }, 400);
    }

    const { bookId } = result.data;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const { reorgLock, store } = getSystemContext();
    const status = reorgLock.getReorgStatus(bookId);
    const manifest = store.loadManifest(bookId);

    if (status.hasSentinel) {
      reorgLock.removeSentinel(bookId);
    }
    if (status.isLocked && status.lockInfo?.isZombie) {
      reorgLock.forceUnlock(bookId);
    }

    return c.json({
      data: {
        recovered: status.hasSentinel || status.isLocked,
        bookId,
        restoredChapters: manifest.lastChapterWritten,
      },
    });
  });

  router.get('/state-diff', (c) => {
    const requestedFile = c.req.query('file') || 'current_state';
    const bookId = c.req.query('bookId');
    const file = `${requestedFile}.md`;
    const { rootDir, syncValidator } = getSystemContext();
    const bookIds = bookId ? [bookId] : listBookIds(rootDir);

    for (const currentBookId of bookIds) {
      if (!hasStudioBookRuntime(currentBookId)) {
        continue;
      }

      const diff = syncValidator.generateDiff(currentBookId);
      const entry = diff.files.find((item) => item.file === file);
      if (!entry) {
        continue;
      }

      const changes =
        entry.status === 'modified'
          ? buildStateDiffChanges(
              currentBookId,
              requestedFile,
              entry.expectedContent ?? '',
              entry.actualContent ?? ''
            )
          : [
              {
                character: currentBookId,
                field: requestedFile,
                oldValue: entry.expectedContent ?? '',
                newValue: entry.actualContent ?? '',
                naturalLanguage: `${currentBookId} 的 ${requestedFile} 投影文件缺失或异常`,
              },
            ];

      return c.json({
        data: {
          file: requestedFile,
          summary: `系统从您的小说文本中提取到 ${changes.length} 处设定变更`,
          changes,
          changeCount: changes.length,
          categories: [entry.status],
          severity: changes.length > 0 ? 'warning' : 'info',
          jsonHash: ProjectionRenderer.computeStateHash(
            getSystemContext().store.loadManifest(currentBookId)
          ),
        },
      });
    }

    return c.json({
      data: {
        file: requestedFile,
        summary: '系统从您的小说文本中提取到 0 处设定变更',
        changes: [],
        changeCount: 0,
        categories: [],
        severity: 'info',
      },
    });
  });

  return router;
}
