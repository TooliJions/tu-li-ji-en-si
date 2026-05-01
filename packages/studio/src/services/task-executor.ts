// ─── 任务执行器 ──────────────────────────────────────────────────
// 将 pipeline 路由中的 fire-and-forget IIFE 业务逻辑抽取为可复用的异步函数。

import { PipelineRunner } from '@cybernovelist/core';
import { getStudioRuntimeRootDir } from '../runtime/runtime-config';
import { readStudioBookRuntime } from '../runtime/book-repository';
import { buildLLMProvider } from '../llm/provider-factory';
import { normalizeGenreForAgents } from '../utils';
import { eventHub } from '../api/sse';
import {
  pipelineStore,
  markCurrentStage,
  finalizePipeline,
  mergeIntentWithBookContext,
  buildBookContextFromManifest,
} from './pipeline';
import type { TaskRecord } from '@cybernovelist/core';

/**
 * 执行单个任务。由 TaskWorker 调用。
 */
export async function executeTask(task: TaskRecord): Promise<void> {
  const book = readStudioBookRuntime(task.bookId);
  const rootDir = getStudioRuntimeRootDir();
  const provider = book ? buildLLMProvider(book) : buildLLMProvider();
  const runner = new PipelineRunner({ rootDir, provider });

  const payload = JSON.parse(task.payload) as Record<string, unknown>;

  if (task.type === 'write-next') {
    await executeWriteNext(task, runner, book, payload);
  } else if (task.type === 'upgrade-draft') {
    await executeUpgradeDraft(task, runner, payload);
  } else {
    throw new Error(`未知任务类型: ${task.type}`);
  }
}

// ─── write-next ──────────────────────────────────────────────────

async function executeWriteNext(
  task: TaskRecord,
  runner: PipelineRunner,
  book: ReturnType<typeof readStudioBookRuntime>,
  payload: Record<string, unknown>,
): Promise<void> {
  const chapterNumber = Number(payload.chapterNumber);
  const userIntent = mergeIntentWithBookContext(
    task.bookId,
    payload.userIntent as string | undefined,
    `推进第 ${chapterNumber} 章主线`,
  );
  const skipAudit = Boolean(payload.skipAudit);

  markCurrentStage(task.pipelineId, 'composing');

  const chapterResult = skipAudit
    ? await runner.writeDraft({
        bookId: task.bookId,
        chapterNumber,
        title: `第 ${chapterNumber} 章`,
        genre: normalizeGenreForAgents(book?.genre),
        sceneDescription: userIntent,
        bookContext: buildBookContextFromManifest(task.bookId),
      })
    : await runner.composeChapter({
        bookId: task.bookId,
        chapterNumber,
        title: `第 ${chapterNumber} 章`,
        genre: normalizeGenreForAgents(book?.genre),
        userIntent,
      });

  finalizePipeline(task.pipelineId, {
    success: chapterResult.success,
    chapterNumber: chapterResult.chapterNumber,
    status: chapterResult.status,
    persisted: chapterResult.persisted,
    error: chapterResult.error,
  });

  eventHub.sendEvent(task.bookId, 'pipeline_progress', pipelineStore.get(task.pipelineId)!);
  if (chapterResult.success) {
    eventHub.sendEvent(task.bookId, 'chapter_complete', {
      pipelineId: task.pipelineId,
      chapterNumber: chapterResult.chapterNumber,
      status: chapterResult.status,
    });
  }
}

// ─── upgrade-draft ───────────────────────────────────────────────

async function executeUpgradeDraft(
  task: TaskRecord,
  runner: PipelineRunner,
  payload: Record<string, unknown>,
): Promise<void> {
  const chapterNumber = Number(payload.chapterNumber);

  markCurrentStage(task.pipelineId, 'revising');

  const chapterResult = await runner.upgradeDraft({
    bookId: task.bookId,
    chapterNumber,
    userIntent: mergeIntentWithBookContext(
      task.bookId,
      payload.userIntent as string | undefined,
      '',
    ),
  });

  finalizePipeline(task.pipelineId, {
    success: chapterResult.success,
    chapterNumber: chapterResult.chapterNumber,
    status: chapterResult.status,
    persisted: chapterResult.persisted,
    error: chapterResult.error,
  });

  eventHub.sendEvent(task.bookId, 'pipeline_progress', pipelineStore.get(task.pipelineId)!);
  if (chapterResult.success) {
    eventHub.sendEvent(task.bookId, 'chapter_complete', {
      pipelineId: task.pipelineId,
      chapterNumber: chapterResult.chapterNumber,
      status: chapterResult.status,
    });
  }
}
