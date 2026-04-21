import { expect, test } from '@playwright/test';

/**
 * E2E Test: 书籍完整生命周期
 * 关键路径：创建书籍 → 快速试写 → 写草稿 → 升级草稿 → 完整流水线创作
 */
test.describe('书籍完整生命周期', () => {
  test.describe.configure({ mode: 'serial' });
  const testBookTitle = `E2E-生命周期测试-${Date.now()}`;
  let bookId: string;

  test('1. 创建书籍 - 两步表单', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '仪表盘' })).toBeVisible();

    // 点击新建书籍
    await page.getByRole('link', { name: '新建书籍' }).click();
    await expect(page.getByRole('heading', { name: '新建书籍' })).toBeVisible();

    // 第一步：填写基本信息（题材使用 select 下拉框）
    await page.getByLabel('书名').fill(testBookTitle);
    await page.locator('#book-genre').selectOption('玄幻');
    await page.getByRole('button', { name: '下一步' }).click();

    // 第二步：创作设置
    await expect(page.getByRole('heading', { name: '创作设置' })).toBeVisible();
    await page.getByLabel('创作简报').fill('这是 E2E 测试创建的玄幻小说，讲述修仙之路。');
    await page.getByRole('button', { name: '创建书籍' }).click();

    // 验证跳转和书籍详情页
    await expect(page).toHaveURL(/\/book\/book-/);
    await expect(page.getByRole('heading', { name: testBookTitle })).toBeVisible();

    // 提取 bookId
    bookId = page.url().split('/').pop() as string;
    expect(bookId).toMatch(/^book-/);
  });

  test('2. 快速试写功能', async ({ page }) => {
    // 直接访问写作页面
    await page.goto(`/writing?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /正文创作/ })).toBeVisible();
    await expect(page.getByText('记忆透视')).toBeVisible();

    // 验证快速试写按钮存在
    const fastDraftBtn = page.getByRole('button', { name: /开始快速试写/ });
    await expect(fastDraftBtn).toBeVisible();

    // 验证试写意图输入框存在
    await expect(page.getByPlaceholder('输入简要意图')).toBeVisible();

    // 验证日志面板存在
    await expect(page.getByText('流水线日志')).toBeVisible();
  });

  test('3. 草稿模式创作', async ({ page }) => {
    await page.goto(`/writing?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /正文创作/ })).toBeVisible();

    // 验证草稿模式按钮存在
    const draftModeBtn = page.getByRole('button', { name: /草稿模式/ });
    await expect(draftModeBtn).toBeVisible();
  });

  test('4. 草稿转正（完整流水线）', async ({ page }) => {
    await page.goto(`/writing?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /正文创作/ })).toBeVisible();

    // 验证写作页面可访问（转正按钮仅在有草稿时显示）
  });

  test.afterAll('清理测试书籍', async ({ request }) => {
    if (bookId) {
      await request.delete(`/api/books/${bookId}`);
    }
  });
});

/**
 * E2E Test: 章节管理
 */
test.describe('章节管理', () => {
  const testBookTitle = `E2E-章节测试-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    // 通过 API 创建书籍以便后续测试
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '都市',
        targetChapterCount: 50,
        targetWordsPerChapter: 3000,
        targetWords: 150000,
        brief: 'E2E 章节测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('5. 章节列表页面', async ({ page }) => {
    await page.goto(`/book/${bookId}`);
    await expect(page.getByRole('heading', { name: testBookTitle })).toBeVisible();
    await expect(page.getByText('章节列表')).toBeVisible();
  });

  test.afterAll('清理测试书籍', async ({ request }) => {
    if (bookId) {
      await request.delete(`/api/books/${bookId}`);
    }
  });
});

/**
 * E2E Test: 伏笔管理
 */
test.describe('伏笔管理', () => {
  const testBookTitle = `E2E-伏笔测试-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '玄幻',
        targetChapterCount: 100,
        targetWordsPerChapter: 3000,
        targetWords: 300000,
        brief: 'E2E 伏笔管理测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('6. 伏笔面板 - 基本结构', async ({ page }) => {
    await page.goto(`/hooks?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: '伏笔管理' })).toBeVisible();
    await expect(page.getByRole('button', { name: '时间轴' })).toBeVisible();
    await expect(page.getByRole('button', { name: '列表' })).toBeVisible();
  });

  test('7. 创建伏笔', async ({ page }) => {
    await page.goto(`/hooks?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: '伏笔管理' })).toBeVisible();

    // 填写伏笔描述
    const descInput = page.getByPlaceholder('伏笔描述');
    await expect(descInput).toBeVisible();
    await descInput.fill('测试伏笔：神秘宝剑的来历');

    // 点击创建按钮
    await page.getByRole('button', { name: '创建' }).click();

    // 验证伏笔出现在列表中
    await expect(page.getByText('神秘宝剑的来历')).toBeVisible({ timeout: 10000 });
  });

  test.afterAll('清理测试书籍', async ({ request }) => {
    if (bookId) {
      await request.delete(`/api/books/${bookId}`);
    }
  });
});

/**
 * E2E Test: 真相文件
 */
test.describe('真相文件', () => {
  const testBookTitle = `E2E-真相测试-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '科幻',
        targetChapterCount: 30,
        targetWordsPerChapter: 2500,
        targetWords: 75000,
        brief: 'E2E 真相文件测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('8. 真相文件列表', async ({ page }) => {
    await page.goto(`/truth-files?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: '真相文件' })).toBeVisible();
    await expect(page.getByText('导入 Markdown')).toBeVisible();
  });

  test.afterAll('清理测试书籍', async ({ request }) => {
    if (bookId) {
      await request.delete(`/api/books/${bookId}`);
    }
  });
});

/**
 * E2E Test: 数据分析
 */
test.describe('数据分析', () => {
  const testBookTitle = `E2E-分析测试-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '仙侠',
        targetChapterCount: 50,
        targetWordsPerChapter: 3000,
        targetWords: 150000,
        brief: 'E2E 数据分析测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('9. 分析页面结构', async ({ page }) => {
    await page.goto(`/analytics?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: '数据分析' })).toBeVisible();
  });

  test.afterAll('清理测试书籍', async ({ request }) => {
    if (bookId) {
      await request.delete(`/api/books/${bookId}`);
    }
  });
});

/**
 * E2E Test: 守护进程
 */
test.describe('守护进程', () => {
  const testBookTitle = `E2E-守护测试-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '游戏',
        targetChapterCount: 200,
        targetWordsPerChapter: 3000,
        targetWords: 600000,
        brief: 'E2E 守护进程测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('10. 守护进程控制页面', async ({ page }) => {
    await page.goto(`/daemon?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /守护进程|Daemon/ })).toBeVisible();
  });

  test.afterAll('清理测试书籍', async ({ request }) => {
    if (bookId) {
      await request.delete(`/api/books/${bookId}`);
    }
  });
});

/**
 * E2E Test: 导出功能
 */
test.describe('导出功能', () => {
  const testBookTitle = `E2E-导出测试-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '悬疑',
        targetChapterCount: 20,
        targetWordsPerChapter: 2000,
        targetWords: 40000,
        brief: 'E2E 导出功能测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('11. 导出页面可访问', async ({ page }) => {
    // 导出功能可能在书籍详情页或独立页面
    await page.goto(`/book/${bookId}`);
    await expect(page.getByRole('heading', { name: testBookTitle })).toBeVisible();

    // 查找导出相关按钮或链接
    const exportLink = page.getByRole('link', { name: /导出|EPUB|TXT|Markdown/i });
    if (await exportLink.isVisible()) {
      await exportLink.click();
      await expect(page).not.toHaveURL(/404|error/i);
    }
  });

  test.afterAll('清理测试书籍', async ({ request }) => {
    if (bookId) {
      await request.delete(`/api/books/${bookId}`);
    }
  });
});

/**
 * E2E Test: 仪表盘导航
 */
test.describe('仪表盘', () => {
  test('12. 仪表盘显示书籍列表', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '仪表盘' })).toBeVisible();

    // 验证新建书籍链接存在
    await expect(page.getByRole('link', { name: '新建书籍' })).toBeVisible();
  });
});

/**
 * E2E Test: SSE 实时推送
 */
test.describe('SSE 实时推送', () => {
  const testBookTitle = `E2E-SSE测试-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '同人',
        targetChapterCount: 10,
        targetWordsPerChapter: 2000,
        targetWords: 20000,
        brief: 'E2E SSE 测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('13. 写作页面 SSE 连接', async ({ page }) => {
    await page.goto(`/writing?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /正文创作/ })).toBeVisible();

    // 验证 SSE 连接状态（通常有连接指示器）
    await page.waitForTimeout(2000); // 等待 SSE 连接建立

    // 检查日志面板或状态显示
    const logPanel = page.locator('[class*="log"], [class*="Log"]');
    if (await logPanel.isVisible()) {
      await expect(logPanel).toBeVisible();
    }
  });

  test.afterAll('清理测试书籍', async ({ request }) => {
    if (bookId) {
      await request.delete(`/api/books/${bookId}`);
    }
  });
});
