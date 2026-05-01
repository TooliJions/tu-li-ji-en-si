import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { createInspirationRouter } from './inspiration';
import { createPlanningBriefRouter } from './planning-brief';
import { createStoryOutlineRouter } from './story-outline';
import { initializeStudioBookRuntime, resetStudioCoreBridgeForTests } from '../core-bridge';

function createTestApp() {
  const app = new Hono();
  app.route('/api/books/:bookId/inspiration', createInspirationRouter());
  app.route('/api/books/:bookId/planning-brief', createPlanningBriefRouter());
  app.route('/api/books/:bookId/story-outline', createStoryOutlineRouter());
  return app;
}

describe('Story Outline Route', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    resetStudioCoreBridgeForTests();
    initializeStudioBookRuntime({
      id: 'book-001',
      title: '测试小说',
      genre: 'xuanhuan',
      targetWords: 30000,
      targetChapterCount: 10,
      targetWordsPerChapter: 3000,
      currentWords: 0,
      chapterCount: 0,
      status: 'active',
      language: 'zh',
      platform: 'qidian',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fanficMode: null,
      promptVersion: 'v2',
      modelConfig: {
        useGlobalDefaults: true,
        writer: 'DashScope',
        auditor: 'OpenAI',
        planner: 'DashScope',
      },
    });
    app = createTestApp();
  });

  afterEach(() => {
    resetStudioCoreBridgeForTests();
  });

  it('requires planning brief before creating story outline', async () => {
    const res = await app.request('/api/books/book-001/story-outline', {
      method: 'POST',
      body: JSON.stringify({
        premise: '少年在宗门考核中暴露上古血脉，从外门一路逆袭。',
        worldRules: ['血脉越强反噬越重'],
        protagonistArc: {
          characterName: '林辰',
          startState: '隐忍自保',
          growthPath: '从隐藏锋芒到主动夺势',
          endState: '敢于改写宗门秩序',
        },
        supportingArcs: [],
        majorConflicts: ['宗门内部排挤'],
        phaseMilestones: [],
        endingDirection: '主角建立新秩序',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(409);
    const data = (await res.json()) as { error: { code: string } };
    expect(data.error.code).toBe('UPSTREAM_REQUIRED');
  });

  it('creates and reads story outline after planning brief is ready', async () => {
    await app.request('/api/books/book-001/inspiration', {
      method: 'POST',
      body: JSON.stringify({
        sourceText: '宗门天才在外门考核暴露秘密血脉',
        genre: '玄幻',
        theme: '逆袭',
        conflict: '身份暴露',
        tone: '热血',
        constraints: ['升级明确'],
        sourceType: 'manual',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    await app.request('/api/books/book-001/planning-brief', {
      method: 'POST',
      body: JSON.stringify({
        audience: '男频玄幻读者',
        genreStrategy: '高开高走',
        styleTarget: '爽点密集',
        lengthTarget: '300 万字',
        tabooRules: ['不降智'],
        marketGoals: ['起点连载'],
        creativeConstraints: ['成长线清晰'],
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const createRes = await app.request('/api/books/book-001/story-outline', {
      method: 'POST',
      body: JSON.stringify({
        premise: '少年在宗门考核中暴露上古血脉，从外门一路逆袭。',
        worldRules: ['血脉越强反噬越重'],
        protagonistArc: {
          characterName: '林辰',
          startState: '隐忍自保',
          growthPath: '从隐藏锋芒到主动夺势',
          endState: '敢于改写宗门秩序',
        },
        supportingArcs: [],
        majorConflicts: ['宗门内部排挤'],
        phaseMilestones: [],
        endingDirection: '主角建立新秩序',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(createRes.status).toBe(201);

    const getRes = await app.request('/api/books/book-001/story-outline');
    expect(getRes.status).toBe(200);
    const data = (await getRes.json()) as { data: { premise: string; endingDirection: string } };
    expect(data.data.premise).toContain('少年在宗门考核中暴露上古血脉');
    expect(data.data.endingDirection).toBe('主角建立新秩序');
  });

  it('updates story outline', async () => {
    await app.request('/api/books/book-001/inspiration', {
      method: 'POST',
      body: JSON.stringify({
        sourceText: '宗门天才在外门考核暴露秘密血脉',
        genre: '玄幻',
        theme: '逆袭',
        conflict: '身份暴露',
        tone: '热血',
        constraints: ['升级明确'],
        sourceType: 'manual',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    await app.request('/api/books/book-001/planning-brief', {
      method: 'POST',
      body: JSON.stringify({
        audience: '男频玄幻读者',
        genreStrategy: '高开高走',
        styleTarget: '爽点密集',
        lengthTarget: '300 万字',
        tabooRules: ['不降智'],
        marketGoals: ['起点连载'],
        creativeConstraints: ['成长线清晰'],
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    await app.request('/api/books/book-001/story-outline', {
      method: 'POST',
      body: JSON.stringify({
        premise: '少年在宗门考核中暴露上古血脉，从外门一路逆袭。',
        worldRules: ['血脉越强反噬越重'],
        protagonistArc: {
          characterName: '林辰',
          startState: '隐忍自保',
          growthPath: '从隐藏锋芒到主动夺势',
          endState: '敢于改写宗门秩序',
        },
        supportingArcs: [],
        majorConflicts: ['宗门内部排挤'],
        phaseMilestones: [],
        endingDirection: '主角建立新秩序',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const patchRes = await app.request('/api/books/book-001/story-outline', {
      method: 'PATCH',
      body: JSON.stringify({
        endingDirection: '主角改写宗门秩序并建立新体系',
        majorConflicts: ['宗门内部排挤', '血脉失控'],
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(patchRes.status).toBe(200);
    const data = (await patchRes.json()) as {
      data: { endingDirection: string; majorConflicts: string[] };
    };
    expect(data.data.endingDirection).toBe('主角改写宗门秩序并建立新体系');
    expect(data.data.majorConflicts).toEqual(['宗门内部排挤', '血脉失控']);
  });
});
