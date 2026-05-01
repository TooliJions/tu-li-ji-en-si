import { Hono } from 'hono';
import {
  CreateStoryBlueprintInputSchema,
  DefaultOutlineService,
  type PlanningBrief,
  type StoryBlueprint,
} from '@cybernovelist/core';
import { hasStudioBookRuntime } from '../core-bridge';
import { readWorkflowDocument, writeWorkflowDocument } from './workflow-store';

const PLANNING_BRIEF_FILE = 'planning-brief.json';
const STORY_OUTLINE_FILE = 'story-outline.json';

const createStoryOutlineRouteSchema = CreateStoryBlueprintInputSchema.omit({
  planningBriefId: true,
});
const updateStoryOutlineRouteSchema = createStoryOutlineRouteSchema.partial();

export function createStoryOutlineRouter(): Hono {
  const router = new Hono();
  const service = new DefaultOutlineService();

  router.get('/', (c) => {
    const bookId = c.req.param('bookId');
    if (!bookId) {
      return c.json({ error: { code: 'INVALID_STATE', message: '缺少 bookId' } }, 400);
    }
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const document = readWorkflowDocument<StoryBlueprint>(bookId, STORY_OUTLINE_FILE);
    return c.json({ data: document, exists: document !== null });
  });

  router.post('/', async (c) => {
    const bookId = c.req.param('bookId');
    if (!bookId) {
      return c.json({ error: { code: 'INVALID_STATE', message: '缺少 bookId' } }, 400);
    }
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    if (readWorkflowDocument<StoryBlueprint>(bookId, STORY_OUTLINE_FILE)) {
      return c.json(
        { error: { code: 'STAGE_ALREADY_EXISTS', message: '当前书籍已存在故事总纲' } },
        409,
      );
    }

    const brief = readWorkflowDocument<PlanningBrief>(bookId, PLANNING_BRIEF_FILE);
    if (!brief) {
      return c.json(
        { error: { code: 'UPSTREAM_REQUIRED', message: '请先完成规划简报，再创建故事总纲' } },
        409,
      );
    }

    const body = await c.req.json().catch(() => ({}));
    const result = createStoryOutlineRouteSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400,
      );
    }

    const blueprint = service.createBlueprint({
      planningBriefId: brief.id,
      ...result.data,
    });
    writeWorkflowDocument(bookId, STORY_OUTLINE_FILE, blueprint);
    return c.json({ data: blueprint }, 201);
  });

  router.patch('/', async (c) => {
    const bookId = c.req.param('bookId');
    if (!bookId) {
      return c.json({ error: { code: 'INVALID_STATE', message: '缺少 bookId' } }, 400);
    }
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const current = readWorkflowDocument<StoryBlueprint>(bookId, STORY_OUTLINE_FILE);
    if (!current) {
      return c.json(
        { error: { code: 'STAGE_NOT_FOUND', message: '当前书籍尚未创建故事总纲' } },
        404,
      );
    }

    const body = await c.req.json().catch(() => ({}));
    const result = updateStoryOutlineRouteSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400,
      );
    }

    const updated = service.updateBlueprint(current, result.data);
    writeWorkflowDocument(bookId, STORY_OUTLINE_FILE, updated);
    return c.json({ data: updated });
  });

  return router;
}
