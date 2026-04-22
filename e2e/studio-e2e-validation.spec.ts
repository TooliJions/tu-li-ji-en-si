import { expect, test } from '@playwright/test';

/**
 * E2E Test: 操作驱动 + API 验证 + 数据断言
 *
 * 升级目标：从"UI 骨架检查"升级为"真实流程验证"
 * - 步骤1：操作驱动 — 从空书籍开始，通过 API 完整走一遍流程
 * - 步骤2：API 验证 — 调 API 验证后端逻辑，不只检查 UI 可见性
 * - 步骤3：数据断言 — 验证实际输出值，不只看元素是否存在
 *
 * 覆盖 PRD：PRD-001, PRD-020, PRD-022, PRD-035, PRD-036, PRD-050, PRD-060, PRD-070, PRD-082
 */

// ─── 步骤1：操作驱动 — 从空书籍到完整产出 ──────────────────────────

test.describe('步骤1: 操作驱动 — 完整创作链路', () => {
  let bookId: string;

  test.afterEach(async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });

  test('创建书籍 → write-draft → 审计 → 验证输出完整链路', async ({ request }) => {
    // 1.1 通过 API 创建书籍
    const createRes = await request.post('/api/books', {
      data: {
        title: `E2E-API-${Date.now()}`,
        genre: '玄幻',
        targetChapterCount: 5,
        targetWordsPerChapter: 2000,
        brief: '操作驱动测试书籍',
      },
    });
    expect(createRes.status()).toBe(201);
    const createData = await createRes.json();
    bookId = createData.data.id;
    expect(bookId).toMatch(/^book-/);

    // 1.2 验证空书籍无章节（PRD-001）
    const chaptersRes = await request.get(`/api/books/${bookId}/chapters`);
    expect(chaptersRes.status()).toBe(200);
    const chaptersData = await chaptersRes.json();
    expect(chaptersData.data).toEqual([]);
    expect(chaptersData.total).toBe(0);

    // 1.3 通过 write-draft 创建章节（调用 LLM 写入）
    const draftRes = await request.post(`/api/books/${bookId}/pipeline/write-draft`, {
      data: { chapterNumber: 1 },
    });
    expect(draftRes.status()).toBe(200);
    const draftData = await draftRes.json();
    expect(draftData.data.number).toBe(1);
    expect(draftData.data.status).toBe('draft');
    expect(draftData.data.content).toBeDefined();
    expect(draftData.data.content.length).toBeGreaterThan(0);
    expect(draftData.data.wordCount).toBeGreaterThan(0);

    // 1.4 验证章节已写入且可读取
    const getChapterRes = await request.get(`/api/books/${bookId}/chapters/1`);
    expect(getChapterRes.status()).toBe(200);
    const chapterData = await getChapterRes.json();
    expect(chapterData.data.number).toBe(1);
    expect(chapterData.data.content.length).toBeGreaterThan(0);
    expect(chapterData.data.wordCount).toBeGreaterThan(0);

    // 1.5 运行审计
    const auditRes = await request.post(`/api/books/${bookId}/chapters/1/audit`);
    expect(auditRes.status()).toBe(200);
    const auditData = await auditRes.json();

    // 1.6 验证审计报告结构完整
    expect(auditData.data.chapterNumber).toBe(1);
    expect(['passed', 'needs_revision']).toContain(auditData.data.overallStatus);
    expect(auditData.data.tiers).toBeDefined();
    expect(auditData.data.tiers.blocker).toBeDefined();
    expect(auditData.data.tiers.warning).toBeDefined();
    expect(auditData.data.tiers.suggestion).toBeDefined();

    // 1.7 验证雷达评分 8 维度（PRD-083）
    const radar = auditData.data.radarScores;
    expect(radar.length).toBe(8);
    const dimensionLabels = radar.map((r: { label: string }) => r.label);
    expect(dimensionLabels).toContain('AI 痕迹');
    expect(dimensionLabels).toContain('连贯性');
    expect(dimensionLabels).toContain('完整性');

    // 1.8 验证雷达分值在有效范围 [0, 1]
    for (const score of radar) {
      expect(score.score).toBeGreaterThanOrEqual(0);
      expect(score.score).toBeLessThanOrEqual(1);
    }

    // 1.9 验证章节列表现在有 1 章
    const chaptersAfter = await request.get(`/api/books/${bookId}/chapters`);
    const chaptersAfterData = await chaptersAfter.json();
    expect(chaptersAfterData.total).toBe(1);
  });

  test('草稿模式 → 内容更新 → 状态保持验证', async ({ request }) => {
    // 创建书籍
    const createRes = await request.post('/api/books', {
      data: {
        title: `E2E-Draft-${Date.now()}`,
        genre: '都市',
        targetChapterCount: 3,
        targetWordsPerChapter: 2000,
      },
    });
    bookId = (await createRes.json()).data.id;

    // 写入草稿章节
    const draftRes = await request.post(`/api/books/${bookId}/pipeline/write-draft`, {
      data: { chapterNumber: 1 },
    });
    expect(draftRes.status()).toBe(200);
    const draftData = await draftRes.json();
    expect(draftData.data.status).toBe('draft');
    expect(draftData.data.content.length).toBeGreaterThan(0);

    // PATCH 更新内容（状态保持为 draft — 防止意外转正）
    await request.patch(`/api/books/${bookId}/chapters/1`, {
      data: { content: draftData.data.content + '\n\n新增段落。' },
    });

    // 验证内容已更新但状态保持 draft
    const updatedRes = await request.get(`/api/books/${bookId}/chapters/1`);
    const updatedData = await updatedRes.json();
    expect(updatedData.data.status).toBe('draft');
    expect(updatedData.data.content).toContain('新增段落');
    expect(updatedData.data.wordCount).toBeGreaterThan(0);

    // 运行审计
    const auditRes = await request.post(`/api/books/${bookId}/chapters/1/audit`);
    const auditData = await auditRes.json();
    expect(auditData.data.chapterNumber).toBe(1);
    expect(auditData.data.tiers.blocker.total).toBeGreaterThan(0);
  });

  test('多章节创建 → 合并 → 验证内容', async ({ request }) => {
    // 创建书籍
    const createRes = await request.post('/api/books', {
      data: {
        title: `E2E-Merge-${Date.now()}`,
        genre: '仙侠',
        targetChapterCount: 5,
      },
    });
    bookId = (await createRes.json()).data.id;

    // 通过 write-draft 创建两章
    await request.post(`/api/books/${bookId}/pipeline/write-draft`, { data: { chapterNumber: 1 } });
    await request.post(`/api/books/${bookId}/pipeline/write-draft`, { data: { chapterNumber: 2 } });

    // 验证两章存在
    const chaptersRes = await request.get(`/api/books/${bookId}/chapters`);
    const chaptersData = await chaptersRes.json();
    expect(chaptersData.total).toBe(2);

    // 获取原始内容
    const ch1Res = await request.get(`/api/books/${bookId}/chapters/1`);
    const ch1Data = await ch1Res.json();
    const ch1Content = ch1Data.data.content;

    const ch2Res = await request.get(`/api/books/${bookId}/chapters/2`);
    const ch2Data = await ch2Res.json();
    const ch2Content = ch2Data.data.content;

    // 合并章节
    const mergeRes = await request.post(`/api/books/${bookId}/chapters/merge`, {
      data: { fromChapter: 1, toChapter: 2 },
    });
    expect(mergeRes.status()).toBe(200);
    const mergeData = await mergeRes.json();

    // 验证合并后内容包含两章文本
    expect(mergeData.data.content).toContain(ch1Content.substring(0, 20));
    expect(mergeData.data.content).toContain(ch2Content.substring(0, 20));

    // 验证章节数变为 1
    const afterMerge = await request.get(`/api/books/${bookId}/chapters`);
    const afterData = await afterMerge.json();
    expect(afterData.total).toBe(1);
  });

  test('章节拆分 → 验证拆分后内容', async ({ request }) => {
    // 创建书籍
    const createRes = await request.post('/api/books', {
      data: {
        title: `E2E-Split-${Date.now()}`,
        genre: '悬疑',
        targetChapterCount: 5,
      },
    });
    bookId = (await createRes.json()).data.id;

    // 通过 write-draft 创建一章
    await request.post(`/api/books/${bookId}/pipeline/write-draft`, { data: { chapterNumber: 1 } });

    const ch1Res = await request.get(`/api/books/${bookId}/chapters/1`);
    const ch1Data = await ch1Res.json();
    const contentLen = ch1Data.data.content.length;

    // 在中间位置拆分（确保内容足够长）
    if (contentLen > 200) {
      const splitRes = await request.post(`/api/books/${bookId}/chapters/1/split`, {
        data: { splitAtPosition: Math.floor(contentLen / 2) },
      });
      expect(splitRes.status()).toBe(200);

      // 验证拆分出两章
      const chaptersRes = await request.get(`/api/books/${bookId}/chapters`);
      const chaptersData = await chaptersRes.json();
      expect(chaptersData.total).toBe(2);
    }
  });
});

// ─── 步骤2：API 验证 — 后端逻辑验证 ─────────────────────────────

test.describe('步骤2: API 验证 — 后端逻辑', () => {
  let bookId: string;

  test.afterEach(async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });

  test('伏笔创建 → 健康度 → 时间轴完整链路（PRD-050~059）', async ({ request }) => {
    // 创建书籍
    const createRes = await request.post('/api/books', {
      data: { title: `E2E-Hook-${Date.now()}`, genre: '玄幻', targetChapterCount: 10 },
    });
    bookId = (await createRes.json()).data.id;

    // 创建伏笔
    const hookRes = await request.post(`/api/books/${bookId}/hooks`, {
      data: {
        description: '主角身世之谜',
        chapter: 1,
        priority: 'critical',
        expectedResolutionWindow: { min: 5, max: 10 },
      },
    });
    expect(hookRes.status()).toBe(201);
    const hookData = await hookRes.json();
    expect(hookData.data.id).toMatch(/^hook-/);
    expect(hookData.data.description).toBe('主角身世之谜');
    expect(hookData.data.status).toBe('open');
    expect(hookData.data.priority).toBe('critical');

    // 创建第二个伏笔
    const hook2Res = await request.post(`/api/books/${bookId}/hooks`, {
      data: { description: '配角背叛伏笔', chapter: 2, priority: 'major' },
    });
    expect(hook2Res.status()).toBe(201);

    // 验证伏笔列表
    const listRes = await request.get(`/api/books/${bookId}/hooks`);
    const listData = await listRes.json();
    expect(listData.total).toBe(2);
    expect(listData.data.map((h: { id: string }) => h.id)).toContain(hookData.data.id);

    // 验证健康度
    const healthRes = await request.get(`/api/books/${bookId}/hooks/health`);
    expect(healthRes.status()).toBe(200);
    const healthData = await healthRes.json();
    expect(healthData.data.total).toBe(2);
    expect(healthData.data.active).toBeGreaterThanOrEqual(1);

    // 验证时间轴（含密度热力图）
    const timelineRes = await request.get(`/api/books/${bookId}/hooks/timeline`);
    const timelineData = await timelineRes.json();
    expect(timelineData.data.densityHeatmap.length).toBeGreaterThan(0);
    expect(timelineData.data.hooks.length).toBe(2);
  });

  test('伏笔生命周期流转（open → progressing → deferred → resolved）', async ({ request }) => {
    // 创建书籍 + 伏笔
    const createRes = await request.post('/api/books', {
      data: { title: `E2E-Lifecycle-${Date.now()}`, genre: '都市', targetChapterCount: 10 },
    });
    bookId = (await createRes.json()).data.id;

    const hookRes = await request.post(`/api/books/${bookId}/hooks`, {
      data: { description: '生命线测试', chapter: 1, priority: 'minor' },
    });
    const hookId = (await hookRes.json()).data.id;

    // progressing
    const progressRes = await request.patch(`/api/books/${bookId}/hooks/${hookId}`, {
      data: { status: 'progressing' },
    });
    expect((await progressRes.json()).data.status).toBe('progressing');

    // deferred
    const deferRes = await request.patch(`/api/books/${bookId}/hooks/${hookId}`, {
      data: { status: 'deferred' },
    });
    expect((await deferRes.json()).data.status).toBe('deferred');

    // resolved
    const resolveRes = await request.patch(`/api/books/${bookId}/hooks/${hookId}`, {
      data: { status: 'resolved' },
    });
    expect((await resolveRes.json()).data.status).toBe('resolved');

    // 验证健康度显示 resolved
    const healthRes = await request.get(`/api/books/${bookId}/hooks/health`);
    const healthData = await healthRes.json();
    expect(healthData.data.resolved).toBe(1);
  });

  test('真相文件 CRUD + 投影同步（PRD-060~067）', async ({ request }) => {
    // 创建书籍
    const createRes = await request.post('/api/books', {
      data: { title: `E2E-State-${Date.now()}`, genre: '科幻', targetChapterCount: 5 },
    });
    bookId = (await createRes.json()).data.id;

    // 列出真相文件
    const listRes = await request.get(`/api/books/${bookId}/state`);
    expect(listRes.status()).toBe(200);
    const listData = await listRes.json();
    expect(listData.data.files.length).toBe(7); // 7 种真相文件

    const fileNames = listData.data.files.map((f: { name: string }) => f.name);
    expect(fileNames).toContain('current_state');
    expect(fileNames).toContain('character_matrix');
    expect(fileNames).toContain('hooks');
    expect(fileNames).toContain('manifest');

    // 读取 current_state
    const stateRes = await request.get(`/api/books/${bookId}/state/current_state`);
    expect(stateRes.status()).toBe(200);
    const stateData = await stateRes.json();
    expect(stateData.data.name).toBe('current_state');
    expect(stateData.data.content).toBeDefined();

    // 更新 current_state
    const updateRes = await request.put(`/api/books/${bookId}/state/current_state`, {
      data: { content: '# 新的当前状态\n这是一段测试内容。' },
    });
    expect(updateRes.status()).toBe(200);
    const updateData = await updateRes.json();
    expect(updateData.data.content).toBeDefined();

    // 验证投影同步状态
    const projectionRes = await request.get(`/api/books/${bookId}/state/projection-status`);
    expect(projectionRes.status()).toBe(200);
    const projectionData = await projectionRes.json();
    expect(projectionData.data).toHaveProperty('synced');
  });

  test('分析 API 完整验证（PRD-082~087）', async ({ request }) => {
    // 创建书籍 + 章节
    const createRes = await request.post('/api/books', {
      data: { title: `E2E-Analytics-${Date.now()}`, genre: '悬疑', targetChapterCount: 5 },
    });
    bookId = (await createRes.json()).data.id;

    await request.post(`/api/books/${bookId}/pipeline/write-draft`, { data: { chapterNumber: 1 } });
    await request.post(`/api/books/${bookId}/chapters/1/audit`);

    // 字数统计
    const wordCountRes = await request.get(`/api/books/${bookId}/analytics/word-count`);
    const wordCountData = await wordCountRes.json();
    expect(wordCountData.data.totalWords).toBeGreaterThan(0);
    expect(wordCountData.data.chapters.length).toBe(1);
    expect(wordCountData.data.averagePerChapter).toBeGreaterThan(0);

    // 审计通过率
    const auditRateRes = await request.get(`/api/books/${bookId}/analytics/audit-rate`);
    const auditRateData = await auditRateRes.json();
    expect(auditRateData.data.totalAudits).toBe(1);
    expect(auditRateData.data.perChapter.length).toBe(1);

    // AI 痕迹趋势
    const aiTraceRes = await request.get(`/api/books/${bookId}/analytics/ai-trace`);
    const aiTraceData = await aiTraceRes.json();
    expect(aiTraceData.data).toHaveProperty('trend');
    expect(aiTraceData.data).toHaveProperty('average');
    expect(aiTraceData.data).toHaveProperty('latest');

    // 质量基线
    const baselineRes = await request.get(`/api/books/${bookId}/analytics/quality-baseline`);
    const baselineData = await baselineRes.json();
    expect(baselineData.data).toHaveProperty('baseline');
    expect(baselineData.data.baseline.metrics).toHaveProperty('aiTraceScore');
    expect(baselineData.data.baseline.metrics).toHaveProperty('sentenceDiversity');
    expect(baselineData.data.baseline.metrics).toHaveProperty('avgParagraphLength');

    // 基线漂移
    const driftRes = await request.get(`/api/books/${bookId}/analytics/baseline-alert`);
    const driftData = await driftRes.json();
    expect(driftData.data).toHaveProperty('triggered');
    expect(driftData.data).toHaveProperty('severity');
    expect(driftData.data).toHaveProperty('suggestedAction');
  });

  test('导出 API 验证（PRD-070~073）', async ({ request }) => {
    // 创建书籍 + 两章内容
    const createRes = await request.post('/api/books', {
      data: { title: `E2E-Export-${Date.now()}`, genre: '仙侠', targetChapterCount: 5 },
    });
    bookId = (await createRes.json()).data.id;

    await request.post(`/api/books/${bookId}/pipeline/write-draft`, { data: { chapterNumber: 1 } });
    await request.post(`/api/books/${bookId}/pipeline/write-draft`, { data: { chapterNumber: 2 } });

    // TXT 导出
    const txtRes = await request.post(`/api/books/${bookId}/export/txt`, { data: {} });
    expect(txtRes.status()).toBe(200);
    const txtContent = await txtRes.text();
    expect(txtContent).toContain('E2E-Export');

    // Markdown 导出
    const mdRes = await request.post(`/api/books/${bookId}/export/markdown`, { data: {} });
    expect(mdRes.status()).toBe(200);
    const mdContent = await mdRes.text();
    expect(mdContent).toContain('# ');
    expect(mdContent).toContain('## 第');

    // EPUB 导出
    const epubRes = await request.post(`/api/books/${bookId}/export/epub`, { data: {} });
    expect(epubRes.status()).toBe(200);
    expect(epubRes.headers()['content-type']).toContain('epub');

    // 章节范围导出
    const rangeRes = await request.post(`/api/books/${bookId}/export/txt`, {
      data: { chapterRange: { from: 1, to: 1 } },
    });
    expect(rangeRes.status()).toBe(200);
  });

  test('系统诊断 API（PRD-090）', async ({ request }) => {
    // 创建书籍
    const createRes = await request.post('/api/books', {
      data: { title: `E2E-Doctor-${Date.now()}`, genre: '都市', targetChapterCount: 3 },
    });
    bookId = (await createRes.json()).data.id;

    // 健康检查
    const doctorRes = await request.get('/api/system/doctor');
    const doctorStatus = doctorRes.status();
    expect([200, 501]).toContain(doctorStatus);

    if (doctorRes.status() === 200) {
      const doctorData = await doctorRes.json();
      expect(doctorData.data).toHaveProperty('issues');
      expect(doctorData.data).toHaveProperty('reorgSentinels');
    }
  });
});

// ─── 步骤3：数据断言 — 输出值验证 ──────────────────────────────

test.describe('步骤3: 数据断言 — 输出值验证', () => {
  let bookId: string;

  test.afterEach(async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });

  test('AI 痕迹检测输出值验证（PRD-035）', async ({ request }) => {
    // 创建书籍
    const createRes = await request.post('/api/books', {
      data: { title: `E2E-AI-Trace-${Date.now()}`, genre: '玄幻', targetChapterCount: 3 },
    });
    bookId = (await createRes.json()).data.id;

    // 写入正常内容（不含 AI 关键词）
    const normalContent =
      `---\ntitle: 正常内容\nstatus: published\n---\n` +
      '他走进房间，看到桌上放着一封信。窗外下着雨。';

    await request.post(`/api/books/${bookId}/pipeline/write-draft`, { data: { chapterNumber: 1 } });

    // 用正常内容替换
    const chRes = await request.get(`/api/books/${bookId}/chapters/1`);
    const chData = await chRes.json();
    const existingContent = chData.data.content;

    await request.patch(`/api/books/${bookId}/chapters/1`, {
      data: { content: existingContent + '\n\n' + normalContent },
    });

    // 审计
    const auditRes = await request.post(`/api/books/${bookId}/chapters/1/audit`);
    const auditData = await auditRes.json();

    // 验证 AI 痕迹评分在有效范围
    const aiTraceScore = auditData.data.radarScores.find(
      (r: { label: string }) => r.label === 'AI 痕迹'
    );
    expect(aiTraceScore).toBeDefined();
    expect(aiTraceScore.score).toBeGreaterThanOrEqual(0);
    expect(aiTraceScore.score).toBeLessThanOrEqual(1);
  });

  test('字数治理断言（PRD-038）', async ({ request }) => {
    // 创建书籍，目标 2000 字/章
    const createRes = await request.post('/api/books', {
      data: {
        title: `E2E-WordCount-${Date.now()}`,
        genre: '都市',
        targetChapterCount: 3,
        targetWordsPerChapter: 2000,
      },
    });
    bookId = (await createRes.json()).data.id;

    // 创建章节
    await request.post(`/api/books/${bookId}/pipeline/write-draft`, { data: { chapterNumber: 1 } });

    // 验证字数
    const chapterRes = await request.get(`/api/books/${bookId}/chapters/1`);
    const chapterData = await chapterRes.json();
    expect(chapterData.data).toBeDefined();
    expect(chapterData.data.wordCount).toBeGreaterThan(0);

    // 审计应包含完整性评分
    const auditRes = await request.post(`/api/books/${bookId}/chapters/1/audit`);
    const auditData = await auditRes.json();

    const completenessScore = auditData.data.radarScores.find(
      (r: { label: string }) => r.label === '完整性'
    );
    expect(completenessScore).toBeDefined();
    expect(completenessScore.score).toBeGreaterThanOrEqual(0);
    expect(completenessScore.score).toBeLessThanOrEqual(1);
  });

  test('情感弧线分析断言（PRD-015）', async ({ request }) => {
    // 创建书籍
    const createRes = await request.post('/api/books', {
      data: { title: `E2E-Emotion-${Date.now()}`, genre: '都市', targetChapterCount: 5 },
    });
    bookId = (await createRes.json()).data.id;

    // 分析情感弧线（即使无角色也应返回正确结构）
    const emotionRes = await request.get(`/api/books/${bookId}/analytics/emotional-arcs`);
    expect(emotionRes.status()).toBe(200);
    const emotionData = await emotionRes.json();

    expect(emotionData.data).toHaveProperty('characters');
    expect(emotionData.data).toHaveProperty('alerts');
  });

  test('章节快照与回滚断言（PRD-063）', async ({ request }) => {
    // 创建书籍 + 章节
    const createRes = await request.post('/api/books', {
      data: { title: `E2E-Snapshot-${Date.now()}`, genre: '科幻', targetChapterCount: 3 },
    });
    bookId = (await createRes.json()).data.id;

    // 创建章节
    await request.post(`/api/books/${bookId}/pipeline/write-draft`, { data: { chapterNumber: 1 } });

    // 验证 v1 存在
    const v1Res = await request.get(`/api/books/${bookId}/chapters/1`);
    const v1Data = await v1Res.json();
    expect(v1Data.data).toBeDefined();
    expect(v1Data.data.content.length).toBeGreaterThan(0);

    // 更新内容（触发快照）
    const updateRes = await request.patch(`/api/books/${bookId}/chapters/1`, {
      data: { content: v1Data.data.content + '\n\n新增内容。' },
    });
    expect(updateRes.status()).toBe(200);

    // 验证 v2 已更新
    const v2Res = await request.get(`/api/books/${bookId}/chapters/1`);
    const v2Data = await v2Res.json();
    expect(v2Data.data.content).toContain('新增内容');

    // 验证快照列表有快照
    const snapshotsRes = await request.get(`/api/books/${bookId}/chapters/1/snapshots`);
    const snapshotsData = await snapshotsRes.json();
    expect(snapshotsData.data.length).toBeGreaterThanOrEqual(1);
  });

  test('污染隔离 — warningCode 在 PATCH 中保持不变（PRD-091）', async ({ request }) => {
    // 创建书籍
    const createRes = await request.post('/api/books', {
      data: { title: `E2E-Pollution-${Date.now()}`, genre: '仙侠', targetChapterCount: 3 },
    });
    bookId = (await createRes.json()).data.id;

    // 创建章节
    await request.post(`/api/books/${bookId}/pipeline/write-draft`, { data: { chapterNumber: 1 } });

    // 验证初始无警告
    const chRes = await request.get(`/api/books/${bookId}/chapters/1`);
    const chData = await chRes.json();
    expect(chData.data.isPolluted).toBe(false);
    expect(chData.data.warningCode).toBeNull();

    // PATCH 更新内容（warningCode 保持原值 — API 设计）
    await request.patch(`/api/books/${bookId}/chapters/1`, {
      data: { content: chData.data.content + '\n\n新段落。' },
    });

    // 验证污染状态未变
    const afterRes = await request.get(`/api/books/${bookId}/chapters/1`);
    const afterData = await afterRes.json();
    expect(afterData.data.isPolluted).toBe(false);

    // 验证合并场景中的污染传播
    await request.post(`/api/books/${bookId}/pipeline/write-draft`, { data: { chapterNumber: 2 } });
    // 合并时两个无警告章节 → 结果也无警告
    const mergeRes = await request.post(`/api/books/${bookId}/chapters/merge`, {
      data: { fromChapter: 1, toChapter: 2 },
    });
    const mergeData = await mergeRes.json();
    expect(mergeData.data.warningCode).toBeFalsy();
  });

  test('灵感洗牌输出断言（PRD-083b）', async ({ request }) => {
    // 创建书籍 + 章节
    const createRes = await request.post('/api/books', {
      data: { title: `E2E-Shuffle-${Date.now()}`, genre: '都市', targetChapterCount: 3 },
    });
    bookId = (await createRes.json()).data.id;

    await request.post(`/api/books/${bookId}/pipeline/write-draft`, { data: { chapterNumber: 1 } });

    // 触发灵感洗牌
    const shuffleRes = await request.post(`/api/books/${bookId}/analytics/inspiration-shuffle`);
    expect(shuffleRes.status()).toBe(200);
    const shuffleData = await shuffleRes.json();

    // 验证返回结构
    expect(shuffleData.data).toHaveProperty('alternatives');
    expect(shuffleData.data).toHaveProperty('generationTime');
    expect(shuffleData.data).toHaveProperty('available');

    // 验证替代风格定义
    if (shuffleData.data.alternatives.length > 0) {
      const styles = shuffleData.data.alternatives.map((a: { style: string }) => a.style);
      expect(styles).toContain('fast_paced');
      expect(styles).toContain('emotional');
      expect(styles).toContain('contemplative');
    }
  });
});
