import { Hono } from 'hono';
import {
  CreateDetailedOutlineInputSchema,
  UpdateDetailedOutlinePatchSchema,
  DefaultDetailedOutlineService,
  type DetailedOutline,
  type StoryBlueprint,
} from '@cybernovelist/core';
import { hasStudioBookRuntime } from '../core-bridge';
import { readWorkflowDocument, writeWorkflowDocument } from './workflow-store';
import { getRequestContext } from '../context';

const STORY_OUTLINE_FILE = 'story-outline.json';
const DETAILED_OUTLINE_FILE = 'detailed-outline.json';

const createDetailedOutlineRouteSchema = CreateDetailedOutlineInputSchema.omit({
  storyBlueprintId: true,
});

export function createDetailedOutlineRouter(): Hono {
  const router = new Hono();
  const service = new DefaultDetailedOutlineService();

  router.get('/', (c) => {
    const bookId = c.req.param('bookId');
    if (!bookId) {
      return c.json({ error: { code: 'INVALID_STATE', message: '缺少 bookId' } }, 400);
    }
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const document = readWorkflowDocument<DetailedOutline>(bookId, DETAILED_OUTLINE_FILE);
    return c.json({ data: document, exists: document !== null });
  });

  router.get('/:chapterNumber/context', (c) => {
    const bookId = c.req.param('bookId');
    const chapterNumber = Number(c.req.param('chapterNumber'));
    if (!bookId || Number.isNaN(chapterNumber)) {
      return c.json({ error: { code: 'INVALID_STATE', message: '参数无效' } }, 400);
    }
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const document = readWorkflowDocument<DetailedOutline>(bookId, DETAILED_OUTLINE_FILE);
    if (!document) {
      return c.json({ error: { code: 'STAGE_NOT_FOUND', message: '当前书籍尚未创建细纲' } }, 404);
    }

    const context = service.getChapterContext(document, chapterNumber);
    if (!context) {
      return c.json(
        { error: { code: 'CHAPTER_NOT_FOUND', message: `第 ${chapterNumber} 章细纲不存在` } },
        404,
      );
    }

    return c.json({ data: context });
  });

  router.post('/', async (c) => {
    const bookId = c.req.param('bookId');
    if (!bookId) {
      return c.json({ error: { code: 'INVALID_STATE', message: '缺少 bookId' } }, 400);
    }
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    if (readWorkflowDocument<DetailedOutline>(bookId, DETAILED_OUTLINE_FILE)) {
      return c.json(
        { error: { code: 'STAGE_ALREADY_EXISTS', message: '当前书籍已存在细纲' } },
        409,
      );
    }

    const blueprint = readWorkflowDocument<StoryBlueprint>(bookId, STORY_OUTLINE_FILE);
    if (!blueprint) {
      return c.json(
        { error: { code: 'UPSTREAM_REQUIRED', message: '请先完成故事总纲,再创建细纲' } },
        409,
      );
    }

    const body = await c.req.json().catch(() => ({}));
    const mode = body?.mode === 'generate' ? 'generate' : 'manual';

    try {
      let outline: DetailedOutline;

      if (mode === 'generate') {
        const { provider } = getRequestContext(c);
        outline = await service.generateOutline({
          blueprint,
          provider,
          totalChapters: typeof body?.totalChapters === 'number' ? body.totalChapters : undefined,
          chaptersPerVolume:
            typeof body?.chaptersPerVolume === 'number' ? body.chaptersPerVolume : undefined,
        });
      } else {
        const result = createDetailedOutlineRouteSchema.safeParse(body);
        if (!result.success) {
          return c.json(
            { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
            400,
          );
        }
        outline = service.createOutline({
          storyBlueprintId: blueprint.id,
          ...result.data,
        });
      }

      writeWorkflowDocument(bookId, DETAILED_OUTLINE_FILE, outline);
      return c.json({ data: outline }, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : '细纲创建失败';
      return c.json({ error: { code: 'GENERATION_FAILED', message } }, 500);
    }
  });

  router.patch('/', async (c) => {
    const bookId = c.req.param('bookId');
    if (!bookId) {
      return c.json({ error: { code: 'INVALID_STATE', message: '缺少 bookId' } }, 400);
    }
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const current = readWorkflowDocument<DetailedOutline>(bookId, DETAILED_OUTLINE_FILE);
    if (!current) {
      return c.json({ error: { code: 'STAGE_NOT_FOUND', message: '当前书籍尚未创建细纲' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const result = UpdateDetailedOutlinePatchSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400,
      );
    }

    try {
      const updated = service.updateOutline(current, result.data);
      writeWorkflowDocument(bookId, DETAILED_OUTLINE_FILE, updated);
      return c.json({ data: updated });
    } catch (err) {
      const message = err instanceof Error ? err.message : '细纲更新失败';
      return c.json({ error: { code: 'INVALID_STATE', message } }, 400);
    }
  });

  return router;
}
