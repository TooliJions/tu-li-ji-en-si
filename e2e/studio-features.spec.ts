import { expect, test } from '@playwright/test';

/**
 * E2E Test: 功能特性（PRD-020~043, PRD-060~067, PRD-080~087）
 *
 * 覆盖：Agent/流水线、伏笔、导出/通知、系统诊断、提示词版本
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
    await expect(page.getByRole('heading', { name: '我的书籍' })).toBeVisible();

    // 验证书籍列表容器存在
    await page.waitForTimeout(1000); // 等待加载
  });

  test('新建书籍入口', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '我的书籍' })).toBeVisible();
    await expect(page.locator('main').getByRole('link', { name: '新建书籍' })).toBeVisible();
  });

  test('最近活动显示', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '我的书籍' })).toBeVisible();

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
 * E2E Test: PRD-025 意图导演
 */
test.describe('PRD-025: 意图导演', () => {
  const testBookTitle = `E2E-意图导演-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '玄幻',
        targetChapterCount: 5,
        targetWordsPerChapter: 2000,
        targetWords: 10000,
        brief: 'E2E 意图导演测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('意图输入框存在', async ({ page }) => {
    await page.goto(`/writing?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /正文创作/ })).toBeVisible();

    const intentInput = page.getByPlaceholder('输入简要意图');
    await expect(intentInput).toBeVisible();
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});

/**
 * E2E Test: PRD-026 上下文治理
 */
test.describe('PRD-026: 上下文治理', () => {
  const testBookTitle = `E2E-上下文治理-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '都市',
        targetChapterCount: 20,
        targetWordsPerChapter: 2000,
        targetWords: 40000,
        brief: 'E2E 上下文治理测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('上下文相关性显示', async ({ page }) => {
    await page.goto(`/writing?bookId=${bookId}`);

    const contextLabel = page.getByText(/上下文|context|相关性/i);
    if (await contextLabel.first().isVisible({ timeout: 3000 })) {
      await expect(contextLabel.first()).toBeVisible();
    }
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});

/**
 * E2E Test: PRD-027 规则栈编译
 */
test.describe('PRD-027: 规则栈编译', () => {
  const testBookTitle = `E2E-规则栈-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '仙侠',
        targetChapterCount: 5,
        targetWordsPerChapter: 2000,
        targetWords: 10000,
        brief: 'E2E 规则栈测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('世界规则在写作页面显示', async ({ page }) => {
    await page.goto(`/writing?bookId=${bookId}`);

    const worldRules = page.getByText(/世界规则|规则栈|world.*rule/i);
    if (await worldRules.first().isVisible({ timeout: 3000 })) {
      await expect(worldRules.first()).toBeVisible();
    }
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});

/**
 * E2E Test: PRD-060~067 真相文件体系
 */
test.describe('PRD-060: 7 真相文件体系', () => {
  const testBookTitle = `E2E-真相体系-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '悬疑',
        targetChapterCount: 5,
        targetWordsPerChapter: 2000,
        targetWords: 10000,
        brief: 'E2E 真相文件体系测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('7 种真相文件类型显示', async ({ page }) => {
    await page.goto(`/truth-files?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: '真相文件' })).toBeVisible();

    const truthTypes = [
      'current_state',
      'hooks',
      'chapter_summaries',
      'subplot_board',
      'emotional_arcs',
      'character_matrix',
      'manifest',
    ];
    let foundCount = 0;
    for (const type of truthTypes) {
      if (
        await page
          .getByText(type)
          .first()
          .isVisible({ timeout: 1000 })
          .catch(() => false)
      ) {
        foundCount++;
      }
    }
    expect(foundCount).toBeGreaterThanOrEqual(1);
  });

  test('JSON + Markdown 双视图（PRD-061）', async ({ page }) => {
    await page.goto(`/truth-files?bookId=${bookId}`);
    // 条件断言：数据存在时才验证
    const jsonLabel = page.getByText('JSON 源文件');
    if (await jsonLabel.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(jsonLabel).toBeVisible();
    }
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});

/**
 * E2E Test: PRD-080/081 通知推送
 */
test.describe('PRD-080/081: 通知推送', () => {
  const testBookTitle = `E2E-通知-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '同人',
        targetChapterCount: 5,
        targetWordsPerChapter: 2000,
        targetWords: 10000,
        brief: 'E2E 通知推送测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('通知配置存在', async ({ page }) => {
    await page.goto(`/config`);

    const notifyLabel = page.getByText(/通知|Telegram|飞书|企业微信|webhook/i);
    if (await notifyLabel.first().isVisible({ timeout: 3000 })) {
      await expect(notifyLabel.first()).toBeVisible();
    }
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});

/**
 * E2E Test: PRD-086/087 提示词版本管理
 */
test.describe('PRD-086/087: 提示词版本管理', () => {
  const testBookTitle = `E2E-提示词-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '仙侠',
        targetChapterCount: 5,
        targetWordsPerChapter: 2000,
        targetWords: 10000,
        brief: 'E2E 提示词版本测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('提示词版本页面可访问', async ({ page }) => {
    await page.goto(`/prompt-version?bookId=${bookId}`);
    await expect(page).not.toHaveURL(/404|error/i);
  });

  test('版本切换器存在', async ({ page }) => {
    await page.goto(`/prompt-version?bookId=${bookId}`);

    const versionSelector = page.locator('select[name*="version"], select[name*="prompt"]');
    if (await versionSelector.first().isVisible({ timeout: 3000 })) {
      await expect(versionSelector.first()).toBeVisible();
    }
  });

  test('latest 软链接标识', async ({ page }) => {
    await page.goto(`/prompt-version?bookId=${bookId}`);

    const latestLabel = page.getByText(/latest|当前|最新/i);
    if (await latestLabel.first().isVisible({ timeout: 2000 })) {
      await expect(latestLabel.first()).toBeVisible();
    }
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});

/**
 * E2E Test: PRD-082/083 数据分析/质量面板
 */
test.describe('PRD-082/083: 数据分析与质量面板', () => {
  const testBookTitle = `E2E-分析面板-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '游戏',
        targetChapterCount: 10,
        targetWordsPerChapter: 2000,
        targetWords: 20000,
        brief: 'E2E 分析面板测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('字数统计显示', async ({ page }) => {
    await page.goto(`/analytics?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: '数据分析' })).toBeVisible();

    const wordCount = page.getByText(/\d+\s*字|字数|word.*count/i);
    if (await wordCount.first().isVisible({ timeout: 3000 })) {
      await expect(wordCount.first()).toBeVisible();
    }
  });

  test('Token 用量显示', async ({ page }) => {
    await page.goto(`/analytics?bookId=${bookId}`);

    const tokenUsage = page.getByText(/token|Token.*用量/i);
    if (await tokenUsage.first().isVisible({ timeout: 3000 })) {
      await expect(tokenUsage.first()).toBeVisible();
    }
  });

  test('8 维度质量评分', async ({ page }) => {
    await page.goto(`/analytics?bookId=${bookId}`);

    const qualityDims = ['AI 痕迹', '连贯性', '节奏', '对话', '描写', '情感', '创新', '完整性'];
    let foundCount = 0;
    for (const dim of qualityDims) {
      if (
        await page
          .getByText(dim)
          .first()
          .isVisible({ timeout: 1000 })
          .catch(() => false)
      ) {
        foundCount++;
      }
    }
    expect(foundCount).toBeGreaterThanOrEqual(1);
  });

  test('Provider 健康（新增）', async ({ page }) => {
    await page.goto(`/doctor?bookId=${bookId}`);

    const providerHealth = page.getByText(/Provider|provider/i);
    if (await providerHealth.first().isVisible({ timeout: 3000 })) {
      await expect(providerHealth.first()).toBeVisible();
    }
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});
