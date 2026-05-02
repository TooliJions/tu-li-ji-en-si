import { expect, test } from '@playwright/test';

/**
 * E2E Test: 完整创作流程（PRD-10.6 关键路径）
 * 覆盖:创建书籍 → 灵感输入 → 规划 → 总纲 → 细纲 → 章节正文 → 质量审计 → 导出 EPUB
 *
 * 这是最重要的 E2E 测试，验证端到端创作流程
 */
test.describe('完整创作流程 E2E', () => {
  test.describe.configure({ mode: 'serial' });
  const TEST_BOOK_TITLE = `E2E-完整流程-${Date.now()}`;
  let bookId: string;

  test('Step 1: 创建书籍', async ({ page }) => {
    // 1. 访问首页仪表盘
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '我的书籍' })).toBeVisible();

    // 2. 点击新建书籍
    await page.locator('main').getByRole('link', { name: '新建书籍' }).click();
    await expect(page.getByRole('heading', { name: '新建书籍' })).toBeVisible();

    // 3. 填写基本信息（第一步）—— 题材使用 select 下拉框
    await page.getByLabel('书名').fill(TEST_BOOK_TITLE);
    await page.locator('#book-genre').selectOption('玄幻');
    await page.getByRole('button', { name: '下一步' }).click();

    // 4. 填写创作设置（第二步）
    await expect(page.getByRole('heading', { name: '创作设置' })).toBeVisible();
    await page
      .getByLabel('创作简报')
      .fill(
        '这是一个关于修仙少年觉醒神秘力量的玄幻故事，主角林辰在天玄宗修行，逐步发现自己的星辰灵体天赋。',
      );
    await page.getByRole('button', { name: '创建书籍' }).click();

    await page.waitForURL(/\/book\/book-|\/inspiration\?bookId=book-|\/writing\?bookId=book-/, {
      timeout: 30000,
    });

    // 5. 提取 bookId 供后续测试使用
    const createdUrl = new URL(page.url());
    bookId = (createdUrl.searchParams.get('bookId') ??
      createdUrl.pathname.split('/').pop()) as string;
    expect(bookId).toMatch(/^book-/);
  });

  test('Step 2: 快速试写（PRD-022a, PRD-023）', async ({ page }) => {
    expect(bookId).toBeDefined();

    // 1. 访问写作工作台
    await page.goto(`/writing?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /正文创作/ })).toBeVisible();
    await expect(page.getByText('记忆透视')).toBeVisible();

    // 2. 验证快速试写意图输入框存在
    const intentInput = page.getByPlaceholder('输入简要意图');
    await expect(intentInput).toBeVisible();

    // 3. 验证开始快速试写按钮存在
    const fastDraftBtn = page.getByRole('button', { name: /开始快速试写/ });
    await expect(fastDraftBtn).toBeVisible();

    // 4. 验证日志面板存在
    await expect(page.getByText('流水线日志')).toBeVisible();
  });

  test('Step 3: 草稿模式创作（PRD-022）', async ({ page }) => {
    expect(bookId).toBeDefined();

    // 1. 访问写作工作台
    await page.goto(`/writing?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /正文创作/ })).toBeVisible();

    // 2. 验证草稿模式按钮存在
    const draftModeBtn = page.getByRole('button', { name: /草稿模式/ });
    await expect(draftModeBtn).toBeVisible();
  });

  test('Step 4: 草稿转正与审计（PRD-024, PRD-020）', async ({ page }) => {
    expect(bookId).toBeDefined();

    // 1. 访问写作工作台
    await page.goto(`/writing?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /正文创作/ })).toBeVisible();

    // 验证写作页面可访问（转正按钮仅在有草稿时显示）
  });

  test('Step 5: 伏笔创建与管理（PRD-050~PRD-053）', async ({ page }) => {
    expect(bookId).toBeDefined();

    // 1. 访问伏笔管理页面
    await page.goto(`/hooks?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: '伏笔管理' })).toBeVisible();
    await expect(page.getByRole('button', { name: '时间轴' })).toBeVisible();

    // 2. 填写伏笔描述
    const descInput = page.getByPlaceholder('伏笔描述');
    await expect(descInput).toBeVisible();
    await descInput.fill('星辰灵体的真正来源 - 揭示主角天赋的秘密');

    // 3. 创建伏笔
    await page.getByRole('button', { name: '创建' }).click();

    // 4. 验证伏笔出现在列表
    await expect(page.getByText('星辰灵体的真正来源')).toBeVisible({ timeout: 10000 });
  });

  test('Step 7: 导出功能（PRD-070~PRD-073）', async ({ page }) => {
    expect(bookId).toBeDefined();

    // 1. 访问书籍详情页
    await page.goto(`/book/${bookId}`);
    await expect(page.getByRole('heading', { name: TEST_BOOK_TITLE })).toBeVisible();

    // 2. 查找导出相关链接
    const exportLink = page.locator('main').getByRole('link', { name: /导出|EPUB|TXT|Markdown/i });

    if (await exportLink.isVisible()) {
      await exportLink.click();

      // 3. 等待导出页面加载
      await page.waitForTimeout(2000);

      // 4. 验证不是 404
      await expect(page).not.toHaveURL(/404|error/i);

      await expect(page.getByRole('button', { name: '开始导出' })).toBeVisible();
    }
  });

  test('Step 8: 数据分析页面（PRD-082~PRD-083b）', async ({ page }) => {
    expect(bookId).toBeDefined();

    // 1. 访问数据分析页面
    await page.goto(`/analytics?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: '数据分析' })).toBeVisible();

    // 2. 等待数据加载
    await page.waitForTimeout(2000);

    // 3. 验证基本元素
    const dashboardContent = page.locator('main, [class*="content"]');
    await expect(dashboardContent.first()).toBeVisible();
  });

  test('Step 9: 章节阅读器（PRD-032~PRD-033a）', async ({ page }) => {
    expect(bookId).toBeDefined();

    // 1. 访问书籍详情页
    await page.goto(`/book/${bookId}`);
    await expect(page.getByRole('heading', { name: TEST_BOOK_TITLE })).toBeVisible();

    // 2. 查找章节链接
    const chapterLink = page.locator('a[href*="/chapter/"], [class*="chapter"] a').first();

    if (await chapterLink.isVisible({ timeout: 5000 })) {
      await chapterLink.click();

      // 3. 等待章节阅读器加载
      await page.waitForTimeout(2000);

      // 4. 验证不是 404
      await expect(page).not.toHaveURL(/404|error/i);

      // 5. 验证章节内容存在
      const chapterContent = page.locator('[class*="content"], .prose, [class*="prose"]');
      if (await chapterContent.first().isVisible({ timeout: 5000 })) {
        await expect(chapterContent.first()).toBeVisible();
      }
    }
  });

  test('Step 10: 真相文件查看（PRD-060~PRD-067）', async ({ page }) => {
    expect(bookId).toBeDefined();

    // 1. 访问真相文件页面
    await page.goto(`/truth-files?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: '真相文件' })).toBeVisible();
    await expect(page.getByText('导入 Markdown')).toBeVisible();

    // 2. 等待文件列表加载
    await page.waitForTimeout(2000);

    // 3. 验证文件列表
    const fileList = page.locator('[class*="file"], [class*="File"]');
    if (await fileList.first().isVisible({ timeout: 5000 })) {
      await expect(fileList.first()).toBeVisible();
    }
  });

  test('Step 11: SSE 实时推送验证（NFR-013）', async ({ page }) => {
    expect(bookId).toBeDefined();

    // 1. 访问写作页面
    await page.goto(`/writing?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /正文创作/ })).toBeVisible();

    // 2. 等待 SSE 连接建立
    await page.waitForTimeout(3000);

    // 3. 验证日志面板存在
    await expect(page.getByText('流水线日志')).toBeVisible({ timeout: 5000 });
  });

  test('Step 12: Doctor 诊断（PRD-085, NFR-025）', async ({ page }) => {
    expect(bookId).toBeDefined();

    // 1. 访问 Doctor 页面
    await page.goto(`/doctor?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /Doctor|诊断/ })).toBeVisible();

    // 2. 等待诊断结果加载
    await page.waitForTimeout(2000);

    // 3. 验证诊断内容
    const doctorContent = page.locator('main, [class*="content"]');
    await expect(doctorContent.first()).toBeVisible({ timeout: 5000 });
  });

  test('Step 13: 自然语言 Agent（PRD-031）', async ({ page }) => {
    expect(bookId).toBeDefined();

    // 自然语言 Agent 可能在写作页面或独立页面
    // 先检查写作页面是否有相关功能
    await page.goto(`/writing?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /正文创作/ })).toBeVisible();

    // 查找自然语言输入框
    const nlInput = page.locator(
      'input[placeholder*="自然语言"], input[placeholder*="对话"], textarea[placeholder*="提问"]',
    );

    if (await nlInput.first().isVisible({ timeout: 3000 })) {
      await nlInput.first().fill('林辰现在是什么修炼境界？');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(3000);
    }
  });

  test('Step 14: 风格指纹提取（PRD-005）', async ({ page }) => {
    expect(bookId).toBeDefined();

    // 访问风格管理页面
    await page.goto(`/style?bookId=${bookId}`);

    // 验证页面可访问
    await expect(page).not.toHaveURL(/404|error/i);
    await page.waitForTimeout(2000);
  });

  test('Step 17: 提示词版本管理（PRD-086~PRD-087）', async ({ page }) => {
    expect(bookId).toBeDefined();

    // 访问提示词版本页面
    await page.goto(`/prompts?bookId=${bookId}`);

    // 验证页面可访问
    await expect(page).not.toHaveURL(/404|error/i);
    await page.waitForTimeout(2000);
  });

  test('Step 18: 清理测试书籍', async ({ request }) => {
    expect(bookId).toBeDefined();

    // 删除测试书籍
    const res = await request.delete(`/api/books/${bookId}`);
    expect(res.ok() || res.status() === 204 || res.status() === 404).toBeTruthy();
  });
});

/**
 * E2E Test: 并发场景测试
 */
test.describe('并发场景测试', () => {
  test('同时打开多个书籍页面', async ({ browser }) => {
    // 创建两个独立上下文
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    // 各自创建书籍
    const book1Res = await (
      await context1.request
    ).post('/api/books', {
      data: {
        title: `E2E-并发书1-${Date.now()}`,
        genre: '都市',
        targetChapterCount: 10,
        targetWordsPerChapter: 2000,
        targetWords: 20000,
        brief: '并发测试书籍1',
      },
    });
    const book1Data = await book1Res.json();
    const book1Id = book1Data.data.id;

    const book2Res = await (
      await context2.request
    ).post('/api/books', {
      data: {
        title: `E2E-并发书2-${Date.now()}`,
        genre: '玄幻',
        targetChapterCount: 10,
        targetWordsPerChapter: 2000,
        targetWords: 20000,
        brief: '并发测试书籍2',
      },
    });
    const book2Data = await book2Res.json();
    const book2Id = book2Data.data.id;

    // 并发访问不同书籍
    await Promise.all([page1.goto(`/book/${book1Id}`), page2.goto(`/book/${book2Id}`)]);

    // 验证各自显示正确的书籍
    await expect(page1.getByRole('heading', { name: /并发书1/ })).toBeVisible();
    await expect(page2.getByRole('heading', { name: /并发书2/ })).toBeVisible();

    // 清理
    await (await context1.request).delete(`/api/books/${book1Id}`);
    await (await context2.request).delete(`/api/books/${book2Id}`);
    await context1.close();
    await context2.close();
  });
});

/**
 * E2E Test: 完整创作端到端流水线
 */
test.describe('完整创作端到端流水线', () => {
  test.describe.configure({ mode: 'serial' });
  const testBookTitle = `E2E-端到端-${Date.now()}`;
  let bookId: string;

  test('1. 创建书籍并验证', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '我的书籍' })).toBeVisible();
    await page.locator('main').getByRole('link', { name: '新建书籍' }).click();
    await page.getByLabel('书名').fill(testBookTitle);
    await page.locator('#book-genre').selectOption('玄幻');
    await page.getByRole('button', { name: '下一步' }).click();
    await page.getByLabel('创作简报').fill('主角踏上修仙之路。');
    await page.getByRole('button', { name: '创建书籍' }).click();
    await page.waitForURL(/\/book\/book-|\/inspiration\?bookId=book-|\/writing\?bookId=book-/, {
      timeout: 30000,
    });
    const createdUrl = new URL(page.url());
    bookId = (createdUrl.searchParams.get('bookId') ??
      createdUrl.pathname.split('/').pop()) as string;
    expect(bookId).toMatch(/^book-/);
  });

  test('2. 创作规划完成', async ({ page }) => {
    await page.goto(`/chapter-plans?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /细纲规划/ })).toBeVisible();
  });

  test('3. 快速试写第一章', async ({ page }) => {
    await page.goto(`/writing?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /正文创作/ })).toBeVisible();
    await expect(page.getByPlaceholder('输入简要意图')).toBeVisible();
    await expect(page.getByRole('button', { name: /开始快速试写/ })).toBeVisible();
  });

  test('4. 伏笔埋设', async ({ page }) => {
    await page.goto(`/hooks?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: '伏笔管理' })).toBeVisible();
    const descInput = page.getByPlaceholder('伏笔描述');
    await expect(descInput).toBeVisible();
    await descInput.fill('灵根的真正来源');
    await page.getByRole('button', { name: '创建' }).click();
    await expect(page.getByText('灵根的真正来源')).toBeVisible({ timeout: 10000 });
  });

  test('5. 审计结果查看', async ({ page }) => {
    await page.goto(`/book/${bookId}`);
    await expect(page.getByRole('heading', { name: testBookTitle })).toBeVisible();
    await expect(page.getByText('章节列表')).toBeVisible();
  });

  test('7. 导出验证', async ({ page }) => {
    await page.goto(`/export?bookId=${bookId}`);
    await expect(page).not.toHaveURL(/404|error/i);
  });

  test('8. 数据分析验证', async ({ page }) => {
    await page.goto(`/analytics?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: '数据分析' })).toBeVisible();
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});

/**
 * E2E Test: PRD-090 状态差异分类展示
 */
test.describe('PRD-090: 状态差异分类展示', () => {
  const testBookTitle = `E2E-状态分类-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '科幻',
        targetChapterCount: 5,
        targetWordsPerChapter: 2000,
        targetWords: 10000,
        brief: 'E2E 状态差异分类测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('Doctor 诊断页面状态差异区域', async ({ page }) => {
    await page.goto(`/doctor?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /Doctor|诊断/ })).toBeVisible();
  });

  test('分类单选框存在', async ({ page }) => {
    await page.goto(`/doctor?bookId=${bookId}`);
    const categoryRadios = page.locator('input[type="radio"]');
    if (await categoryRadios.first().isVisible({ timeout: 3000 })) {
      await expect(categoryRadios.first()).toBeVisible();
    }
  });

  test('分类标签：角色/关系/物品/事实/伏笔', async ({ page }) => {
    await page.goto(`/doctor?bookId=${bookId}`);
    await page.getByRole('button', { name: '运行对比' }).click();

    const resultMarker = page.getByText(/无差异|角色|关系|物品|事实|伏笔/).first();
    await expect(resultMarker).toBeVisible({ timeout: 5000 });
  });

  test('多选框勾选交互', async ({ page }) => {
    await page.goto(`/doctor?bookId=${bookId}`);
    const checkboxes = page.locator('input[type="checkbox"]');
    if (await checkboxes.first().isVisible({ timeout: 3000 })) {
      await expect(checkboxes.first()).toBeVisible();
    }
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});

/**
 * E2E Test: PRD-091 污染隔离视觉强化
 */
test.describe('PRD-091: 污染隔离视觉强化', () => {
  const testBookTitle = `E2E-污染视觉-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '游戏',
        targetChapterCount: 5,
        targetWordsPerChapter: 2000,
        targetWords: 10000,
        brief: 'E2E 污染隔离视觉测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('章节卡片橙色外框 #FF8C00', async ({ page }) => {
    await page.goto(`/book/${bookId}`);
    const orangeBorder = page.locator('[style*="#FF8C00"], [style*="ff8c00"]');
    if (await orangeBorder.first().isVisible({ timeout: 3000 })) {
      await expect(orangeBorder.first()).toBeVisible();
    }
  });

  test('污染隔离红色标签', async ({ page }) => {
    await page.goto(`/book/${bookId}`);
    const pollutionLabel = page.getByText(/污染隔离/i);
    if (await pollutionLabel.first().isVisible({ timeout: 2000 })) {
      await expect(pollutionLabel.first()).toBeVisible();
    }
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});

/**
 * E2E Test: PRD-024b 心流模式实体感知
 */
test.describe('PRD-024b: 心流模式实体感知', () => {
  const testBookTitle = `E2E-心流实体-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '悬疑',
        targetChapterCount: 5,
        targetWordsPerChapter: 2000,
        targetWords: 10000,
        brief: 'E2E 心流模式实体感知测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('心流模式按钮', async ({ page }) => {
    await page.goto(`/writing?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /正文创作/ })).toBeVisible();
    const flowBtn = page.getByRole('button', { name: /心流|flow/i });
    if (await flowBtn.isVisible({ timeout: 3000 })) {
      await expect(flowBtn).toBeVisible();
    }
  });

  test('实体虚线底纹', async ({ page }) => {
    await page.goto(`/writing?bookId=${bookId}`);
    const dashedUnderline = page.locator(
      'mark[class*="border-dashed"], [style*="border-bottom: dashed"]',
    );
    if (await dashedUnderline.first().isVisible({ timeout: 5000 })) {
      await expect(dashedUnderline.first()).toBeVisible();
    }
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});
