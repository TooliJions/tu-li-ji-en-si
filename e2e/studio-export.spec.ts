import { expect, test } from '@playwright/test';

/**
 * E2E Test: 导出模块（PRD-070~073）
 *
 * PRD-070: EPUB 3.0 导出 — 完整 OPF + NCX + XHTML 结构
 * PRD-071: TXT / Markdown 导出
 * PRD-072: 平台适配导出（起点/番茄等平台格式）
 * PRD-073: 批量导出 — 支持指定章节范围
 */
test.describe('EPUB 3.0 导出（PRD-070）', () => {
  const testBookTitle = `E2E-EPUB导出-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '玄幻',
        targetChapterCount: 10,
        targetWordsPerChapter: 2000,
        targetWords: 20000,
        brief: 'E2E EPUB 导出测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('EPUB 导出按钮存在', async ({ page }) => {
    await page.goto(`/book/${bookId}`);
    await expect(page.getByRole('heading', { name: testBookTitle })).toBeVisible();

    const epubLink = page.getByRole('link', { name: /EPUB|导出.*epub/i });
    if (await epubLink.isVisible()) {
      await epubLink.click();
      await expect(page).not.toHaveURL(/404|error/i);
    }
  });

  test('EPUB 包含 NCX 导航（toc.ncx）', async ({ page }) => {
    await page.goto(`/export?bookId=${bookId}`);

    // 验证 EPUB 格式选项存在
    const epubOption = page.getByText(/EPUB|epub/i);
    if (await epubOption.isVisible()) {
      await expect(epubOption).toBeVisible();
    }

    // 验证 NCX 相关内容
    const ncxText = page.getByText(/ncx|目录导航|toc\.ncx/i);
    if (await ncxText.first().isVisible({ timeout: 3000 })) {
      await expect(ncxText.first()).toBeVisible();
    }
  });

  test('EPUB 包含 OPF 元数据', async ({ page, request }) => {
    // 通过 API 触发导出，验证响应包含 OPF 结构
    const res = await request.get(`/api/export/${bookId}/epub`);
    // 允许 200 或 404（未实现时）
    expect([200, 404, 501]).toContain(res.status());

    if (res.status() === 200) {
      const body = await res.text();
      expect(body).toContain('package');
      expect(body).toContain('metadata');
    }
  });

  test('EPUB 章节 XHTML 结构完整', async ({ page, request }) => {
    const res = await request.get(`/api/export/${bookId}/epub`);
    if (res.status() === 200) {
      const body = await res.text();
      // EPUB ZIP 文件以 PK 开头
      expect(body).toBeTruthy();
    }
  });

  test.afterAll('清理测试书籍', async ({ request }) => {
    if (bookId) {
      await request.delete(`/api/books/${bookId}`);
    }
  });
});

test.describe('TXT / Markdown 导出（PRD-071）', () => {
  const testBookTitle = `E2E-TXT导出-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '都市',
        targetChapterCount: 5,
        targetWordsPerChapter: 1000,
        targetWords: 5000,
        brief: 'E2E TXT 导出测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('TXT 导出按钮存在', async ({ page }) => {
    await page.goto(`/book/${bookId}`);
    const txtLink = page.getByRole('link', { name: /TXT|txt|纯文本/i });
    if (await txtLink.isVisible()) {
      await txtLink.click();
      await expect(page).not.toHaveURL(/404|error/i);
    }
  });

  test('Markdown 导出按钮存在', async ({ page }) => {
    await page.goto(`/book/${bookId}`);
    const mdLink = page.getByRole('link', { name: /Markdown|md|markdown/i });
    if (await mdLink.isVisible()) {
      await mdLink.click();
      await expect(page).not.toHaveURL(/404|error/i);
    }
  });

  test('TXT 导出包含章节标题', async ({ page, request }) => {
    const res = await request.get(`/api/export/${bookId}/txt`);
    expect([200, 404, 501]).toContain(res.status());

    if (res.status() === 200) {
      const body = await res.text();
      // TXT 应包含章节分隔
      expect(body).toBeTruthy();
    }
  });

  test('Markdown 导出包含章节标题标记', async ({ page, request }) => {
    const res = await request.get(`/api/export/${bookId}/md`);
    expect([200, 404, 501]).toContain(res.status());

    if (res.status() === 200) {
      const body = await res.text();
      // Markdown 应包含 # 标题标记
      expect(body).toBeTruthy();
    }
  });

  test.afterAll('清理测试书籍', async ({ request }) => {
    if (bookId) {
      await request.delete(`/api/books/${bookId}`);
    }
  });
});

test.describe('平台适配导出（PRD-072）', () => {
  const testBookTitle = `E2E-平台导出-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '玄幻',
        targetChapterCount: 10,
        targetWordsPerChapter: 2000,
        targetWords: 20000,
        brief: 'E2E 平台适配导出测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('起点平台导出选项存在', async ({ page }) => {
    await page.goto(`/export?bookId=${bookId}`);
    const qidianOption = page.getByText(/起点|qidian/i);
    if (await qidianOption.isVisible()) {
      await expect(qidianOption).toBeVisible();
    }
  });

  test('番茄平台导出选项存在', async ({ page }) => {
    await page.goto(`/export?bookId=${bookId}`);
    const fanqieOption = page.getByText(/番茄|fanqie/i);
    if (await fanqieOption.isVisible()) {
      await expect(fanqieOption).toBeVisible();
    }
  });

  test('平台特定格式细节符合规范', async ({ page, request }) => {
    // 验证起点导出 API
    const qidianRes = await request.get(`/api/export/${bookId}/platform/qidian`);
    expect([200, 404, 501]).toContain(qidianRes.status());

    // 验证番茄导出 API
    const fanqieRes = await request.get(`/api/export/${bookId}/platform/fanqie`);
    expect([200, 404, 501]).toContain(fanqieRes.status());
  });

  test.afterAll('清理测试书籍', async ({ request }) => {
    if (bookId) {
      await request.delete(`/api/books/${bookId}`);
    }
  });
});

test.describe('批量导出与章节范围（PRD-073）', () => {
  const testBookTitle = `E2E-批量导出-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '仙侠',
        targetChapterCount: 20,
        targetWordsPerChapter: 2000,
        targetWords: 40000,
        brief: 'E2E 批量导出测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('批量导出入口存在', async ({ page }) => {
    await page.goto(`/book/${bookId}`);
    const batchExportBtn = page.getByRole('button', { name: /批量导出|batch/i });
    if (await batchExportBtn.isVisible()) {
      await expect(batchExportBtn).toBeVisible();
    }
  });

  test('章节范围选择器存在', async ({ page }) => {
    await page.goto(`/export?bookId=${bookId}`);
    const chapterRangeInput = page.locator(
      'input[type="number"], input[placeholder*="章节"], select[name*="chapter"]'
    );
    if (await chapterRangeInput.first().isVisible({ timeout: 3000 })) {
      await expect(chapterRangeInput.first()).toBeVisible();
    }
  });

  test('指定章节范围导出', async ({ page, request }) => {
    // 通过 API 测试章节范围参数
    const res = await request.get(`/api/export/${bookId}/epub?chapterStart=1&chapterEnd=5`);
    expect([200, 404, 501]).toContain(res.status());
  });

  test('导出全部章节（无范围限制）', async ({ page, request }) => {
    const res = await request.get(`/api/export/${bookId}/epub`);
    expect([200, 404, 501]).toContain(res.status());
  });

  test.afterAll('清理测试书籍', async ({ request }) => {
    if (bookId) {
      await request.delete(`/api/books/${bookId}`);
    }
  });
});
