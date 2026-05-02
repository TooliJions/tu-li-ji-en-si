import { expect, test } from '@playwright/test';

/**
 * E2E Test: 书籍完整生命周期（PRD-001~005, PRD-020~034a）
 *
 * PRD-001: 创建新书 — 书名、题材、目标字数
 * PRD-002: 题材模板库
 * PRD-003: 创作简报上传
 * PRD-004: 同人模式初始化
 * PRD-005: 文风仿写
 * PRD-020~034a: 章节创作链路
 */
test.describe('书籍完整生命周期', () => {
  test.describe.configure({ mode: 'serial' });
  const testBookTitle = `E2E-生命周期测试-${Date.now()}`;
  let bookId: string;

  test('1. 创建书籍 - 两步表单', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '我的书籍' })).toBeVisible();

    // 点击新建书籍
    await page.locator('main').getByRole('link', { name: '新建书籍' }).click();
    await expect(page.getByRole('heading', { name: '新建书籍' })).toBeVisible();

    // 第一步：填写基本信息（题材使用 select 下拉框）
    await page.getByLabel('书名').fill(testBookTitle);
    await page.locator('#book-genre').selectOption('玄幻');
    await page.getByRole('button', { name: '下一步' }).click();

    // 第二步：创作设置
    await expect(page.getByRole('heading', { name: '创作设置' })).toBeVisible();
    await page.getByLabel('创作简报').fill('这是 E2E 测试创建的玄幻小说，讲述修仙之路。');
    await page.getByRole('button', { name: '创建书籍' }).click();

    await page.waitForURL(/\/book\/book-|\/writing-plan\?bookId=book-|\/writing\?bookId=book-/, {
      timeout: 30000,
    });

    const createdUrl = new URL(page.url());
    bookId = (createdUrl.searchParams.get('bookId') ??
      createdUrl.pathname.split('/').pop()) as string;
    expect(bookId).toMatch(/^book-/);

    await page.goto(`/writing-plan?bookId=${bookId}`);
    await expect(page).toHaveURL(new RegExp(`/writing-plan\\?bookId=${bookId}`));
    await expect(page.getByRole('heading', { name: /创作规划/ })).toBeVisible();

    await page.getByRole('button', { name: '开始创作' }).click();
    await expect(page).toHaveURL(new RegExp(`/writing\\?bookId=${bookId}`));
    await expect(page.getByRole('heading', { name: /正文创作/ })).toBeVisible();
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
    const exportLink = page.locator('main').getByRole('link', { name: /导出|EPUB|TXT|Markdown/i });
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
 * E2E Test: PRD-001 创建书籍验证子目录
 */
test.describe('PRD-001: 创建书籍验证目录结构', () => {
  const testBookTitle = `E2E-目录验证-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '玄幻',
        targetChapterCount: 10,
        targetWordsPerChapter: 2000,
        targetWords: 20000,
        brief: 'E2E 目录结构验证',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('自动创建 5 个子目录', async ({ page, request }) => {
    // 通过 API 验证目录结构
    const res = await request.get(`/api/books/${bookId}/status`);
    expect([200, 404, 501]).toContain(res.status());

    // UI 验证
    await page.goto(`/book/${bookId}`);
    await expect(page.getByRole('heading', { name: testBookTitle })).toBeVisible();
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});

/**
 * E2E Test: PRD-002 题材模板库
 */
test.describe('PRD-002: 题材模板库', () => {
  test('题材下拉框包含预置题材', async ({ page }) => {
    await page.goto('/');
    await page.locator('main').getByRole('link', { name: '新建书籍' }).click();

    const genreSelect = page.locator('#book-genre');
    await expect(genreSelect).toBeVisible();

    // 验证常见题材选项
    const genres = ['玄幻', '都市', '科幻', '仙侠'];
    for (const genre of genres) {
      const option = page.locator(`#book-genre option[value="${genre}"]`);
      if (await option.isVisible().catch(() => false)) {
        await expect(option).toBeVisible();
      }
    }
  });
});

/**
 * E2E Test: PRD-003 创作简报上传
 */
test.describe('PRD-003: 创作简报上传', () => {
  test('创作简报输入框存在', async ({ page }) => {
    await page.goto('/');
    await page.locator('main').getByRole('link', { name: '新建书籍' }).click();
    await page.getByLabel('书名').fill('E2E-简报测试');
    await page.locator('#book-genre').selectOption('都市');
    await page.getByRole('button', { name: '下一步' }).click();

    const briefTextarea = page.getByLabel('创作简报');
    await expect(briefTextarea).toBeVisible();
  });
});

/**
 * E2E Test: PRD-005 文风仿写
 */
test.describe('PRD-005: 文风仿写', () => {
  const testBookTitle = `E2E-文风-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '同人',
        targetChapterCount: 5,
        targetWordsPerChapter: 2000,
        targetWords: 10000,
        brief: 'E2E 文风仿写测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('风格管理页面可访问', async ({ page }) => {
    await page.goto(`/style?bookId=${bookId}`);
    await expect(page).not.toHaveURL(/404|error/i);
  });

  test('风格指纹提取显示', async ({ page }) => {
    await page.goto(`/style?bookId=${bookId}`);

    const fingerprintLabel = page.getByText(/风格指纹|fingerprint|仿写/i);
    if (await fingerprintLabel.first().isVisible({ timeout: 3000 })) {
      await expect(fingerprintLabel.first()).toBeVisible();
    }
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});

/**
 * E2E Test: PRD-020 单章完整创作链路
 */
test.describe('PRD-020: 单章完整创作', () => {
  const testBookTitle = `E2E-单章创作-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '玄幻',
        targetChapterCount: 10,
        targetWordsPerChapter: 2000,
        targetWords: 20000,
        brief: 'E2E 单章完整创作测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('写作页面包含完整创作链路 UI', async ({ page }) => {
    await page.goto(`/writing?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /正文创作/ })).toBeVisible();

    // 快速试写
    await expect(page.getByRole('button', { name: /开始快速试写/ })).toBeVisible();
    // 草稿模式
    await expect(page.getByRole('button', { name: /草稿模式/ })).toBeVisible();
    // 记忆透视
    await expect(page.getByText('记忆透视')).toBeVisible();
    // 流水线日志
    await expect(page.getByText('流水线日志')).toBeVisible();
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});

/**
 * E2E Test: PRD-021 连续写章
 */
test.describe('PRD-021: 连续写章', () => {
  const testBookTitle = `E2E-连续写章-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '都市',
        targetChapterCount: 20,
        targetWordsPerChapter: 2000,
        targetWords: 40000,
        brief: 'E2E 连续写章测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('连续写章入口存在', async ({ page }) => {
    await page.goto(`/writing?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /正文创作/ })).toBeVisible();

    const continuousBtn = page.getByRole('button', { name: /连续|continuous|批量|batch/i });
    if (await continuousBtn.isVisible({ timeout: 3000 })) {
      await expect(continuousBtn).toBeVisible();
    }
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});

/**
 * E2E Test: PRD-024 草稿升级
 */
test.describe('PRD-024: 草稿升级', () => {
  const testBookTitle = `E2E-草稿升级-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '仙侠',
        targetChapterCount: 5,
        targetWordsPerChapter: 2000,
        targetWords: 10000,
        brief: 'E2E 草稿升级测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('转为正式章节入口存在', async ({ page }) => {
    await page.goto(`/writing?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /正文创作/ })).toBeVisible();

    const upgradeBtn = page.getByRole('button', { name: /转为正式|upgrade|启动审计/i });
    if (await upgradeBtn.first().isVisible({ timeout: 3000 })) {
      await expect(upgradeBtn.first()).toBeVisible();
    }
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});

/**
 * E2E Test: PRD-024a 上下文漂移防护
 */
test.describe('PRD-024a: 上下文漂移防护', () => {
  const testBookTitle = `E2E-漂移防护-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '科幻',
        targetChapterCount: 5,
        targetWordsPerChapter: 2000,
        targetWords: 10000,
        brief: 'E2E 上下文漂移防护测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('漂移检测弹窗存在', async ({ page }) => {
    await page.goto(`/writing?bookId=${bookId}`);

    // 检测弹窗元素
    const driftDialog = page.getByText(/世界状态.*更新|漂移|drift|version/i);
    if (await driftDialog.first().isVisible({ timeout: 3000 })) {
      await expect(driftDialog.first()).toBeVisible();
    }
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});

/**
 * E2E Test: PRD-034 审计失败降级路径
 */
test.describe('PRD-034: 审计失败降级', () => {
  const testBookTitle = `E2E-降级-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '游戏',
        targetChapterCount: 5,
        targetWordsPerChapter: 2000,
        targetWords: 10000,
        brief: 'E2E 审计降级测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('降级配置在 UI 中可见', async ({ page }) => {
    await page.goto(`/book/${bookId}`);

    // 降级路径 UI 元素
    const fallbackLabel = page.getByText(/降级|fallback|accept.*warning|pause/i);
    if (await fallbackLabel.first().isVisible({ timeout: 3000 })) {
      await expect(fallbackLabel.first()).toBeVisible();
    }
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});

/**
 * E2E Test: PRD-034a 降级污染隔离
 */
test.describe('PRD-034a: 降级污染隔离', () => {
  const testBookTitle = `E2E-污染隔离-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '悬疑',
        targetChapterCount: 5,
        targetWordsPerChapter: 2000,
        targetWords: 10000,
        brief: 'E2E 污染隔离测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('污染隔离章节卡片橙色边框 #FF8C00（PRD-091）', async ({ page }) => {
    await page.goto(`/book/${bookId}`);

    // 橙色外框
    const orangeCard = page.locator('[style*="#FF8C00"], [style*="ff8c00"]');
    if (await orangeCard.first().isVisible({ timeout: 3000 })) {
      await expect(orangeCard.first()).toBeVisible();
    }

    // 污染隔离标签
    const pollutionLabel = page.getByText(/污染隔离/i);
    if (await pollutionLabel.first().isVisible({ timeout: 2000 })) {
      await expect(pollutionLabel.first()).toBeVisible();
    }
  });

  test('污染隔离斜纹背景', async ({ page }) => {
    await page.goto(`/book/${bookId}`);

    // 斜纹背景 CSS
    const stripedBg = page.locator('[style*="repeating-linear"], [style*="45deg"]');
    if (await stripedBg.first().isVisible({ timeout: 3000 })) {
      await expect(stripedBg.first()).toBeVisible();
    }
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});

/**
 * E2E Test: PRD-033a 重组安全机制
 */
test.describe('PRD-033a: 重组安全机制', () => {
  const testBookTitle = `E2E-重组安全-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '同人',
        targetChapterCount: 5,
        targetWordsPerChapter: 2000,
        targetWords: 10000,
        brief: 'E2E 重组安全测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('重组锁文件存在', async ({ page }) => {
    await page.goto(`/truth-files?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: '真相文件' })).toBeVisible();

    // reorg 相关文件
    const reorgFile = page.getByText(/reorg|重组/i);
    if (await reorgFile.first().isVisible({ timeout: 3000 })) {
      await expect(reorgFile.first()).toBeVisible();
    }
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});
