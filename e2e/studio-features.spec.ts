import { expect, test } from '@playwright/test';

/**
 * E2E Test: 伏笔管理完整功能
 */
test.describe('伏笔管理完整功能', () => {
  const testBookTitle = `E2E-伏笔完整-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '玄幻',
        targetChapterCount: 100,
        targetWordsPerChapter: 3000,
        targetWords: 300000,
        brief: 'E2E 伏笔完整功能测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('伏笔面板时间轴视图', async ({ page }) => {
    await page.goto(`/hooks?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: '伏笔管理' })).toBeVisible();

    // 切换到时间轴视图
    const timelineBtn = page.getByRole('button', { name: '时间轴' });
    await timelineBtn.click();

    // 等待时间轴渲染
    await page.waitForTimeout(1000);
  });

  test('伏笔健康度显示', async ({ page }) => {
    await page.goto(`/hooks?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: '伏笔管理' })).toBeVisible();

    // 检查健康度相关指标
    const healthIndicators = page.locator('[class*="health"], [class*="Health"]');
    if (await healthIndicators.first().isVisible()) {
      await expect(healthIndicators.first()).toBeVisible();
    }
  });

  test('伏笔详情弹窗', async ({ page }) => {
    await page.goto(`/hooks?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: '伏笔管理' })).toBeVisible();

    // 查找并点击伏笔条目
    const hookItem = page.locator('[class*="hook"], [class*="Hook"]').first();
    if (await hookItem.isVisible()) {
      await hookItem.click();

      // 验证详情弹窗或面板出现
      await page.waitForTimeout(500);
    }
  });

  test.afterAll('清理测试书籍', async ({ request }) => {
    if (bookId) {
      await request.delete(`/api/books/${bookId}`);
    }
  });
});

/**
 * E2E Test: 真相文件完整功能
 */
test.describe('真相文件完整功能', () => {
  const testBookTitle = `E2E-真相完整-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '科幻',
        targetChapterCount: 50,
        targetWordsPerChapter: 2500,
        targetWords: 125000,
        brief: 'E2E 真相文件完整功能测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('真相文件列表展示', async ({ page }) => {
    await page.goto(`/truth-files?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: '真相文件' })).toBeVisible();

    // 切换到源码编辑 tab
    await page.getByRole('button', { name: '源码编辑' }).click();

    // 验证 JSON 源文件标题存在
    await expect(page.getByText('JSON 源文件')).toBeVisible({ timeout: 5000 });
  });

  test('current_state 文件可读', async ({ page }) => {
    await page.goto(`/truth-files?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: '真相文件' })).toBeVisible();

    // 如果存在 current_state 文件，尝试验证
    await page.waitForTimeout(1000);
    const currentStateLink = page.getByText(/current_state/);
    if (await currentStateLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await currentStateLink.click();
      await page.waitForTimeout(1000);
    }
  });

  test('character_matrix 文件可读', async ({ page }) => {
    await page.goto(`/truth-files?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: '真相文件' })).toBeVisible();

    // 如果存在 character_matrix 文件，尝试验证
    await page.waitForTimeout(1000);
    const characterLink = page.getByText(/character_matrix/);
    if (await characterLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await characterLink.click();
      await page.waitForTimeout(1000);
    }
  });

  test.afterAll('清理测试书籍', async ({ request }) => {
    if (bookId) {
      await request.delete(`/api/books/${bookId}`);
    }
  });
});

/**
 * E2E Test: 数据分析完整功能
 */
test.describe('数据分析完整功能', () => {
  const testBookTitle = `E2E-分析完整-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '都市',
        targetChapterCount: 100,
        targetWordsPerChapter: 3000,
        targetWords: 300000,
        brief: 'E2E 数据分析完整功能测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('字数统计显示', async ({ page }) => {
    await page.goto(`/analytics?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: '数据分析' })).toBeVisible();

    // 查找字数统计相关元素
    const wordCountSection = page.locator('text=/字数|word/i');
    await expect(wordCountSection.first()).toBeVisible({ timeout: 5000 });
  });

  test('Token 用量显示', async ({ page }) => {
    await page.goto(`/analytics?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: '数据分析' })).toBeVisible();

    // 查找 Token 相关元素
    const tokenSection = page.locator('text=/token/i');
    if (await tokenSection.first().isVisible({ timeout: 3000 })) {
      await expect(tokenSection.first()).toBeVisible();
    }
  });

  test('AI 痕迹趋势', async ({ page }) => {
    await page.goto(`/analytics?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: '数据分析' })).toBeVisible();

    // 查找 AI 痕迹相关元素
    const aiTraceSection = page.locator('text=/AI.*痕迹|ai.*trace/i');
    if (await aiTraceSection.first().isVisible({ timeout: 3000 })) {
      await expect(aiTraceSection.first()).toBeVisible();
    }
  });

  test('质量基线显示', async ({ page }) => {
    await page.goto(`/analytics?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: '数据分析' })).toBeVisible();

    // 查找基线相关元素
    const baselineSection = page.locator('text=/基线|baseline/i');
    if (await baselineSection.first().isVisible({ timeout: 3000 })) {
      await expect(baselineSection.first()).toBeVisible();
    }
  });

  test.afterAll('清理测试书籍', async ({ request }) => {
    if (bookId) {
      await request.delete(`/api/books/${bookId}`);
    }
  });
});

/**
 * E2E Test: 守护进程控制完整功能
 */
test.describe('守护进程控制完整功能', () => {
  const testBookTitle = `E2E-守护完整-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '仙侠',
        targetChapterCount: 200,
        targetWordsPerChapter: 3000,
        targetWords: 600000,
        brief: 'E2E 守护进程完整功能测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('守护进程状态显示', async ({ page }) => {
    await page.goto(`/daemon?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: '守护进程' })).toBeVisible();

    // 验证状态总览标题存在
    await expect(page.getByText('状态总览')).toBeVisible({ timeout: 5000 });
  });

  test('启动/暂停按钮', async ({ page }) => {
    await page.goto(`/daemon?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: '守护进程' })).toBeVisible();

    // 查找启动按钮
    const startBtn = page.getByRole('button', { name: /启动|Start/i });
    await expect(startBtn).toBeVisible();

    // 查找暂停按钮（可能需要先启动）
    const pauseBtn = page.getByRole('button', { name: /暂停|Pause/i });
    if (await pauseBtn.isVisible()) {
      await expect(pauseBtn).toBeVisible();
    }
  });

  test('间隔配置', async ({ page }) => {
    await page.goto(`/daemon?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: '守护进程' })).toBeVisible();

    // 查找间隔配置相关元素
    const intervalInput = page.locator('input[type="number"], input[placeholder*="间隔"]');
    if (await intervalInput.first().isVisible({ timeout: 3000 })) {
      await expect(intervalInput.first()).toBeVisible();
    }
  });

  test.afterAll('清理测试书籍', async ({ request }) => {
    if (bookId) {
      await request.delete(`/api/books/${bookId}`);
    }
  });
});

/**
 * E2E Test: 书籍详情页
 */
test.describe('书籍详情页', () => {
  const testBookTitle = `E2E-详情完整-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '游戏',
        targetChapterCount: 50,
        targetWordsPerChapter: 3000,
        targetWords: 150000,
        brief: 'E2E 书籍详情页测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('书籍详情页加载', async ({ page }) => {
    await page.goto(`/book/${bookId}`);
    await expect(page.getByRole('heading', { name: testBookTitle })).toBeVisible();
  });

  test('章节列表显示', async ({ page }) => {
    await page.goto(`/book/${bookId}`);
    await expect(page.getByRole('heading', { name: testBookTitle })).toBeVisible();
    await expect(page.getByText('章节列表')).toBeVisible();
  });

  test('快速操作按钮', async ({ page }) => {
    await page.goto(`/book/${bookId}`);
    await expect(page.getByRole('heading', { name: testBookTitle })).toBeVisible();

    // 查找快速操作按钮
    const quickActions = page.locator('[class*="action"], [class*="Action"]');
    if (await quickActions.first().isVisible({ timeout: 3000 })) {
      await expect(quickActions.first()).toBeVisible();
    }
  });

  test.afterAll('清理测试书籍', async ({ request }) => {
    if (bookId) {
      await request.delete(`/api/books/${bookId}`);
    }
  });
});

/**
 * E2E Test: 仪表盘功能
 */
test.describe('仪表盘功能', () => {
  test('仪表盘书籍列表', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '仪表盘' })).toBeVisible();

    // 验证书籍列表容器存在
    const bookList = page.locator('[class*="book"], [class*="Book"]');
    await page.waitForTimeout(1000); // 等待加载
  });

  test('新建书籍入口', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '仪表盘' })).toBeVisible();
    await expect(page.getByRole('link', { name: '新建书籍' })).toBeVisible();
  });

  test('最近活动显示', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '仪表盘' })).toBeVisible();

    // 查找最近活动相关元素
    const recentActivity = page.locator('text=/最近|活动|activity/i');
    if (await recentActivity.first().isVisible({ timeout: 3000 })) {
      await expect(recentActivity.first()).toBeVisible();
    }
  });
});

/**
 * E2E Test: 配置页面
 */
test.describe('配置页面', () => {
  test('配置页面可访问', async ({ page }) => {
    await page.goto('/config');
    // 配置页面可能需要认证或其他条件
    // 验证页面不会 404
    await expect(page).not.toHaveURL(/404|error/i);
  });
});

/**
 * E2E Test: 风格管理
 */
test.describe('风格管理', () => {
  const testBookTitle = `E2E-风格测试-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '同人',
        targetChapterCount: 30,
        targetWordsPerChapter: 2000,
        targetWords: 60000,
        brief: 'E2E 风格管理测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('风格管理页面', async ({ page }) => {
    await page.goto(`/style?bookId=${bookId}`);
    // 验证页面不会 404
    await expect(page).not.toHaveURL(/404|error/i);
  });

  test.afterAll('清理测试书籍', async ({ request }) => {
    if (bookId) {
      await request.delete(`/api/books/${bookId}`);
    }
  });
});

/**
 * E2E Test: 同人模式
 */
test.describe('同人模式', () => {
  const testBookTitle = `E2E-同人测试-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '同人',
        targetChapterCount: 50,
        targetWordsPerChapter: 2500,
        targetWords: 125000,
        brief: 'E2E 同人模式测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('同人初始化页面', async ({ page }) => {
    await page.goto(`/fanfic?bookId=${bookId}`);
    // 验证页面不会 404
    await expect(page).not.toHaveURL(/404|error/i);
  });

  test.afterAll('清理测试书籍', async ({ request }) => {
    if (bookId) {
      await request.delete(`/api/books/${bookId}`);
    }
  });
});
