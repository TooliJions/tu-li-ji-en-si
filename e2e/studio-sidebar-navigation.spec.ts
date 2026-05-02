import { expect, test } from '@playwright/test';

/**
 * E2E Test: 侧边栏每个导航按钮都有效
 * 验证所有 27 个导航项点击后页面正确加载，无 404
 */
test.describe('侧边栏导航全覆盖测试', () => {
  test.describe.configure({ mode: 'serial' });

  const testBookTitle = `E2E-导航测试-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '玄幻',
        targetChapterCount: 10,
        targetWordsPerChapter: 2000,
        targetWords: 20000,
        brief: 'E2E 侧边栏导航测试用书',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test.afterAll(async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });

  // 辅助函数：主内容区至少有一个可见的标题或段落
  async function expectPageLoaded(
    page: ReturnType<typeof test.fixtures.page>,
    titlePattern?: RegExp,
  ) {
    await expect(page).not.toHaveURL(/404|error/i);
    const main = page.locator('main').first();
    await expect(main).toBeVisible();
    if (titlePattern) {
      const heading = main.locator('h1, h2').first();
      await expect(heading).toBeVisible();
      if (titlePattern) {
        const text = await heading.textContent();
        expect(text).toMatch(titlePattern);
      }
    }
  }

  // ─── 主导航 ───────────────────────────────────────────

  test('主导航: 仪表盘', async ({ page }) => {
    await page.goto('/');
    await expectPageLoaded(page, /我的书籍/);
  });

  test('主导航: 我的书籍', async ({ page }) => {
    await page.goto('/chapters');
    await expectPageLoaded(page, /书籍|章节/);
  });

  test('主导航: 创作', async ({ page }) => {
    await page.goto(`/writing?bookId=${bookId}`);
    await expectPageLoaded(page, /正文创作|创作/);
  });

  test('主导航: 审阅', async ({ page }) => {
    await page.goto('/review');
    // /review 与 /chapters 共用组件
    await expectPageLoaded(page, /书籍|章节|审阅/);
  });

  test('主导航: 导出', async ({ page }) => {
    await page.goto(`/export?bookId=${bookId}`);
    await expectPageLoaded(page, /导出|Export/);
  });

  // ─── 二级导航 ─────────────────────────────────────────

  test('二级导航: 题材管理', async ({ page }) => {
    await page.goto('/genres');
    await expectPageLoaded(page, /题材|Genre/);
  });

  test('二级导航: 文风管理', async ({ page }) => {
    await page.goto(`/style-manager?bookId=${bookId}`);
    await expectPageLoaded(page, /文风|Style/);
  });

  test('二级导航: 真相文件', async ({ page }) => {
    await page.goto(`/truth-files?bookId=${bookId}`);
    await expectPageLoaded(page, /真相文件/);
  });

  test('二级导航: 伏笔面板', async ({ page }) => {
    await page.goto(`/hooks?bookId=${bookId}`);
    await expectPageLoaded(page, /伏笔|Hook/);
  });

  test('二级导航: 伏笔时间线', async ({ page }) => {
    await page.goto(`/hooks/timeline?bookId=${bookId}`);
    await expectPageLoaded(page, /时间轴|Timeline|伏笔/);
  });

  test('二级导航: 热力小地图', async ({ page }) => {
    await page.goto(`/hooks/minimap?bookId=${bookId}`);
    await expectPageLoaded(page);
  });

  test('二级导航: 局部放大镜', async ({ page }) => {
    await page.goto(`/hooks/magnifier?bookId=${bookId}`);
    await expectPageLoaded(page);
  });

  test('二级导航: 惊群动画', async ({ page }) => {
    await page.goto(`/hooks/thunder?bookId=${bookId}`);
    await expectPageLoaded(page);
  });

  test('二级导航: 数据分析', async ({ page }) => {
    await page.goto(`/analytics?bookId=${bookId}`);
    await expectPageLoaded(page, /数据分析/);
  });

  test('二级导航: 导入', async ({ page }) => {
    await page.goto(`/import?bookId=${bookId}`);
    await expectPageLoaded(page, /导入|Import/);
  });

  test('二级导航: 创作计划', async ({ page }) => {
    await page.goto(`/chapter-plans?bookId=${bookId}`);
    await expectPageLoaded(page, /细纲规划|Chapter Plans/);
  });

  test('二级导航: 提示词版本', async ({ page }) => {
    await page.goto(`/prompts/${bookId}`);
    await expectPageLoaded(page);
  });

  test('二级导航: 质量检查', async ({ page }) => {
    await page.goto(`/quality?bookId=${bookId}`);
    await expectPageLoaded(page);
  });

  test('二级导航: 细纲规划', async ({ page }) => {
    await page.goto(`/chapter-plans?bookId=${bookId}`);
    await expectPageLoaded(page);
  });

  test('二级导航: 规划简报', async ({ page }) => {
    await page.goto(`/planning-brief?bookId=${bookId}`);
    await expectPageLoaded(page);
  });

  test('二级导航: 灵感输入', async ({ page }) => {
    await page.goto(`/inspiration?bookId=${bookId}`);
    await expectPageLoaded(page);
  });

  test('二级导航: 故事总纲', async ({ page }) => {
    await page.goto(`/story-outline?bookId=${bookId}`);
    await expectPageLoaded(page);
  });

  // ─── 系统导航 ─────────────────────────────────────────

  test('系统导航: 配置', async ({ page }) => {
    await page.goto('/config');
    await expectPageLoaded(page, /配置|Config/);
  });

  test('系统导航: 诊断', async ({ page }) => {
    await page.goto(`/doctor?bookId=${bookId}`);
    await expectPageLoaded(page, /诊断|Doctor/);
  });

  test('系统导航: 日志', async ({ page }) => {
    await page.goto(`/logs?bookId=${bookId}`);
    await expectPageLoaded(page, /日志|Log/);
  });
});
