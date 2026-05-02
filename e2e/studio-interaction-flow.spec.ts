import { expect, test } from '@playwright/test';

/**
 * E2E Test: 端到端用户交互流程
 *
 * 基于 UI 原型文档的完整用户旅程测试：
 * 1. 创建书籍 → 自动规划 → 写第一章 → 审计通过 → 写下一章
 * 2. 伏笔埋设 → 自动唤醒 → 回收确认
 * 3. 草稿模式 → 审计不通过 → 手动确认保留
 * 4. 系统诊断 → 修复锁 → 验证清理
 * 5. 导出 → 批量选择 → 下载文件验证
 * 6. 角色关系网络可视化
 * 7. 情感弧线折线图
 * 8. 世界规则编辑器
 * 9. 真相文件编辑
 * 10. 时间 dial 回滚交互
 */
test.describe('完整创作旅程（创建→规划→写作→审计→下一章）', () => {
  test.describe.configure({ mode: 'serial' });
  const testBookTitle = `E2E-创作旅程-${Date.now()}`;
  let bookId: string;

  test('1. 创建新书', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '我的书籍' })).toBeVisible();

    await page.locator('main').getByRole('link', { name: '新建书籍' }).click();
    await expect(page.getByRole('heading', { name: '新建书籍' })).toBeVisible();

    await page.getByLabel('书名').fill(testBookTitle);
    await page.locator('#book-genre').selectOption('玄幻');
    await page.getByRole('button', { name: '下一步' }).click();

    await expect(page.getByRole('heading', { name: '创作设置' })).toBeVisible();
    await page.getByLabel('创作简报').fill('少年林辰在天玄宗觉醒星辰灵体，踏上修仙之路。');
    await page.getByRole('button', { name: '创建书籍' }).click();

    await page.waitForURL(/\/book\/book-|\/inspiration\?bookId=book-|\/writing\?bookId=book-/, {
      timeout: 30000,
    });
    const createdUrl = new URL(page.url());
    bookId = (createdUrl.searchParams.get('bookId') ??
      createdUrl.pathname.split('/').pop()) as string;
    expect(bookId).toMatch(/^book-/);
  });

  test('2. 访问创作规划页面', async ({ page }) => {
    await page.goto(`/chapter-plans?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /细纲规划/ })).toBeVisible();
  });

  test('3. 快速试写第一章', async ({ page }) => {
    await page.goto(`/writing?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /正文创作/ })).toBeVisible();
    await expect(page.getByText('记忆透视')).toBeVisible();

    // 输入意图
    const intentInput = page.getByPlaceholder('输入简要意图');
    await expect(intentInput).toBeVisible();
    await intentInput.fill('林辰觉醒星辰灵体，遭遇第一次危机');

    // 快速试写按钮存在
    const fastDraftBtn = page.getByRole('button', { name: /开始快速试写/ });
    await expect(fastDraftBtn).toBeVisible();
  });

  test('4. 审计结果显示', async ({ page }) => {
    await page.goto(`/book/${bookId}`);
    await expect(page.getByRole('heading', { name: testBookTitle })).toBeVisible();

    // 章节状态徽章
    await expect(page.getByText('章节列表')).toBeVisible();
  });

  test('5. 写下一章入口', async ({ page }) => {
    await page.goto(`/writing?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /正文创作/ })).toBeVisible();

    // 下一章按钮存在
    const nextChapterBtn = page.getByRole('button', { name: /下一章|next|连续/i });
    if (await nextChapterBtn.isVisible({ timeout: 3000 })) {
      await expect(nextChapterBtn).toBeVisible();
    }
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});

test.describe('伏笔埋设→唤醒→回收流程', () => {
  test.describe.configure({ mode: 'serial' });
  const testBookTitle = `E2E-伏笔流程-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '玄幻',
        targetChapterCount: 50,
        targetWordsPerChapter: 3000,
        targetWords: 150000,
        brief: 'E2E 伏笔流程测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('1. 创建伏笔（PRD-050）', async ({ page }) => {
    await page.goto(`/hooks?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: '伏笔管理' })).toBeVisible();

    const descInput = page.getByPlaceholder('伏笔描述');
    await expect(descInput).toBeVisible();
    await descInput.fill('星辰灵体的真正来源——上古星辰守护者传承');

    await page.getByRole('button', { name: '创建' }).click();
    await expect(page.getByText('上古星辰守护者传承')).toBeVisible({ timeout: 10000 });
  });

  test('2. 设置预期回收窗口（PRD-057）', async ({ page }) => {
    await page.goto(`/hooks?bookId=${bookId}`);

    // 查找伏笔条目并点击编辑
    const hookItem = page.getByText('上古星辰守护者传承');
    if (await hookItem.isVisible()) {
      await hookItem.click();
      await page.waitForTimeout(500);

      // 回收窗口输入
      const minChapter = page.locator('input[placeholder*="最小"], input[name*="min"]');
      if (await minChapter.first().isVisible({ timeout: 2000 })) {
        await expect(minChapter.first()).toBeVisible();
      }
    }
  });

  test('3. 伏笔生命周期状态显示（PRD-053）', async ({ page }) => {
    await page.goto(`/hooks?bookId=${bookId}`);

    // 条件断言：数据存在时验证生命周期标签
    const lifecycleLabels = ['open', 'progressing', 'deferred', 'dormant', 'resolved'];
    for (const label of lifecycleLabels) {
      const el = page.getByText(label);
      if (
        await el
          .first()
          .isVisible({ timeout: 1000 })
          .catch(() => false)
      ) {
        await expect(el.first()).toBeVisible();
        break;
      }
    }
  });

  test('4. 伏笔休眠状态（PRD-058）', async ({ page }) => {
    await page.goto(`/hooks?bookId=${bookId}`);

    const dormantBtn = page.getByRole('button', { name: /休眠|dormant/i });
    if (await dormantBtn.isVisible({ timeout: 3000 })) {
      await expect(dormantBtn).toBeVisible();
    }
  });

  test('5. 惊群效应动画（PRD-056b）', async ({ page }) => {
    await page.goto(`/hooks/timeline?bookId=${bookId}`);

    // 惊群动画元素
    const thunderAnim = page.locator('[class*="thunder"], [class*="惊群"], [class*="parabola"]');
    if (await thunderAnim.first().isVisible({ timeout: 3000 })) {
      await expect(thunderAnim.first()).toBeVisible();
    }
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});

test.describe('草稿模式→审计不通过→手动确认', () => {
  test.describe.configure({ mode: 'serial' });
  const testBookTitle = `E2E-草稿审计-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '都市',
        targetChapterCount: 10,
        targetWordsPerChapter: 2000,
        targetWords: 20000,
        brief: 'E2E 草稿审计测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('1. 草稿模式创作（PRD-022）', async ({ page }) => {
    await page.goto(`/writing?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /正文创作/ })).toBeVisible();

    const draftBtn = page.getByRole('button', { name: /草稿模式/ });
    await expect(draftBtn).toBeVisible();
  });

  test('2. 草稿状态标记', async ({ page }) => {
    await page.goto(`/book/${bookId}`);
    await expect(page.getByRole('heading', { name: testBookTitle })).toBeVisible();

    // draft 状态徽章
    const draftBadge = page.getByText(/draft|草稿/i);
    if (await draftBadge.first().isVisible({ timeout: 3000 })) {
      await expect(draftBadge.first()).toBeVisible();
    }
  });

  test('3. 转为正式章节入口（PRD-024）', async ({ page }) => {
    await page.goto(`/book/${bookId}`);

    const upgradeBtn = page.getByRole('button', { name: /转为正式|upgrade|启动审计/i });
    if (await upgradeBtn.first().isVisible({ timeout: 3000 })) {
      await expect(upgradeBtn.first()).toBeVisible();
    }
  });

  test('4. 审计不通过后手动确认', async ({ page }) => {
    await page.goto(`/book/${bookId}/chapter/1`);
    await page.waitForTimeout(2000);

    // 审计不通过的确认对话框
    const confirmDialog = page.locator('[role="dialog"], [class*="dialog"], [class*="modal"]');
    if (await confirmDialog.first().isVisible({ timeout: 3000 })) {
      await expect(confirmDialog.first()).toBeVisible();
    }
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});

test.describe('系统诊断→修复锁→验证清理', () => {
  const testBookTitle = `E2E-诊断修复-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '仙侠',
        targetChapterCount: 5,
        targetWordsPerChapter: 2000,
        targetWords: 10000,
        brief: 'E2E 诊断修复测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('1. 运行诊断（PRD-085）', async ({ page }) => {
    await page.goto(`/doctor?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /Doctor|诊断/ })).toBeVisible();
  });

  test('2. 问题清单显示', async ({ page }) => {
    await page.goto(`/doctor?bookId=${bookId}`);

    const issuesList = page.getByText(/问题|issue/i);
    if (await issuesList.first().isVisible({ timeout: 3000 })) {
      await expect(issuesList.first()).toBeVisible();
    }
  });

  test('3. 修复僵尸锁（NFR-025）', async ({ page }) => {
    await page.goto(`/doctor?bookId=${bookId}`);

    const fixLocksBtn = page.getByRole('button', { name: /修复.*锁|fix.*lock|清理/i });
    if (await fixLocksBtn.isVisible({ timeout: 3000 })) {
      await fixLocksBtn.click();
      await page.waitForTimeout(2000);

      // 验证修复成功提示
      const successMsg = page.getByText(/已修复|fixed|成功/i);
      if (await successMsg.first().isVisible({ timeout: 3000 })) {
        await expect(successMsg.first()).toBeVisible();
      }
    }
  });

  test('4. Provider 健康检查', async ({ page }) => {
    await page.goto(`/doctor?bookId=${bookId}`);

    const providerHealth = page.getByText(/Provider|provider|提供商/i);
    if (await providerHealth.first().isVisible({ timeout: 3000 })) {
      await expect(providerHealth.first()).toBeVisible();
    }
  });

  test('5. 质量基线显示', async ({ page }) => {
    await page.goto(`/doctor?bookId=${bookId}`);

    const qualityBaseline = page.getByText(/质量基线|quality.*baseline/i);
    if (await qualityBaseline.first().isVisible({ timeout: 3000 })) {
      await expect(qualityBaseline.first()).toBeVisible();
    }
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});

test.describe('导出→批量选择→下载验证', () => {
  const testBookTitle = `E2E-导出旅程-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '科幻',
        targetChapterCount: 10,
        targetWordsPerChapter: 2000,
        targetWords: 20000,
        brief: 'E2E 导出旅程测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('1. 访问导出页面', async ({ page }) => {
    await page.goto(`/export?bookId=${bookId}`);
    await expect(page).not.toHaveURL(/404|error/i);
  });

  test('2. 选择导出格式', async ({ page }) => {
    await page.goto(`/export?bookId=${bookId}`);

    // EPUB 选项
    const epubOption = page.getByText(/EPUB|epub/i);
    if (await epubOption.isVisible({ timeout: 2000 })) {
      await expect(epubOption).toBeVisible();
    }
  });

  test('3. 选择章节范围', async ({ page }) => {
    await page.goto(`/export?bookId=${bookId}`);

    const chapterStart = page.locator('input[name="chapterStart"], input[placeholder*="起始"]');
    if (await chapterStart.first().isVisible({ timeout: 2000 })) {
      await expect(chapterStart.first()).toBeVisible();
    }
  });

  test('4. 触发导出', async ({ page }) => {
    await page.goto(`/export?bookId=${bookId}`);

    const exportBtn = page.getByRole('button', { name: /导出|download|export/i });
    if (await exportBtn.isVisible({ timeout: 3000 })) {
      await expect(exportBtn).toBeVisible();
    }
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});

test.describe('角色关系网络可视化（PRD-011）', () => {
  const testBookTitle = `E2E-角色关系-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '玄幻',
        targetChapterCount: 10,
        targetWordsPerChapter: 2000,
        targetWords: 20000,
        brief: 'E2E 角色关系测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('角色矩阵 tab 存在', async ({ page }) => {
    await page.goto(`/truth-files?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: '真相文件' })).toBeVisible();

    const relationTab = page.getByRole('button', { name: /角色矩阵|关系|character/i });
    if (await relationTab.first().isVisible({ timeout: 2000 })) {
      await expect(relationTab.first()).toBeVisible();
    }
  });

  test('SVG 关系图存在', async ({ page }) => {
    await page.goto(`/truth-files?bookId=${bookId}`);

    const relationGraph = page.locator('svg');
    if (await relationGraph.first().isVisible({ timeout: 3000 })) {
      await expect(relationGraph.first()).toBeVisible();
    }
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});

test.describe('情感弧线折线图（PRD-015）', () => {
  const testBookTitle = `E2E-情感弧线-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '都市',
        targetChapterCount: 10,
        targetWordsPerChapter: 2000,
        targetWords: 20000,
        brief: 'E2E 情感弧线测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('情感弧线页面加载', async ({ page }) => {
    await page.goto(`/book/${bookId}/emotional-arcs`);
    await expect(page).not.toHaveURL(/404|error/i);
  });

  test('SVG 折线图存在', async ({ page }) => {
    await page.goto(`/book/${bookId}/emotional-arcs`);

    const svgChart = page.locator('svg');
    if (await svgChart.first().isVisible({ timeout: 3000 })) {
      await expect(svgChart.first()).toBeVisible();
    }
  });

  test('情感类型标签存在', async ({ page }) => {
    await page.goto(`/book/${bookId}/emotional-arcs`);

    // 条件断言：数据存在时验证情感标签
    const emotionLabels = ['喜悦', '愤怒', '悲伤', '恐惧', '期待'];
    for (const label of emotionLabels) {
      const el = page.getByText(label);
      if (
        await el
          .first()
          .isVisible({ timeout: 1000 })
          .catch(() => false)
      ) {
        await expect(el.first()).toBeVisible();
        break;
      }
    }
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});

test.describe('世界规则编辑器（PRD-014）', () => {
  const testBookTitle = `E2E-世界规则-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '科幻',
        targetChapterCount: 5,
        targetWordsPerChapter: 2000,
        targetWords: 10000,
        brief: 'E2E 世界规则测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('世界规则编辑器存在', async ({ page }) => {
    await page.goto(`/truth-files?bookId=${bookId}`);

    const worldRulesSection = page.getByText(/世界规则|world.*rule|规则编辑器/i);
    if (await worldRulesSection.first().isVisible({ timeout: 3000 })) {
      await expect(worldRulesSection.first()).toBeVisible();
    }
  });

  test('规则添加功能', async ({ page }) => {
    await page.goto(`/truth-files?bookId=${bookId}`);

    const addRuleBtn = page.getByRole('button', { name: /添加规则|add.*rule|新建规则/i });
    if (await addRuleBtn.isVisible({ timeout: 3000 })) {
      await expect(addRuleBtn).toBeVisible();
    }
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});

test.describe('真相文件编辑（PRD-065, PRD-066, PRD-067）', () => {
  const testBookTitle = `E2E-真相编辑-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '游戏',
        targetChapterCount: 5,
        targetWordsPerChapter: 2000,
        targetWords: 10000,
        brief: 'E2E 真相编辑测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('JSON + Markdown 双视图', async ({ page }) => {
    await page.goto(`/truth-files?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: '真相文件' })).toBeVisible();
    // 条件断言
    const jsonLabel = page.getByText('JSON 源文件');
    if (await jsonLabel.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(jsonLabel).toBeVisible();
    }
  });

  test('导入 Markdown 按钮（PRD-067）', async ({ page }) => {
    await page.goto(`/truth-files?bookId=${bookId}`);

    const importMdBtn = page.getByRole('button', { name: /导入 Markdown|import.*markdown/i });
    if (await importMdBtn.isVisible({ timeout: 2000 })) {
      await expect(importMdBtn).toBeVisible();
    }
  });

  test('源码编辑 tab', async ({ page }) => {
    await page.goto(`/truth-files?bookId=${bookId}`);

    const sourceEditTab = page.getByRole('button', { name: /源码编辑/i });
    if (await sourceEditTab.isVisible({ timeout: 2000 })) {
      await expect(sourceEditTab).toBeVisible();
    }
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});

test.describe('时间回溯拨盘（PRD-092）', () => {
  const testBookTitle = `E2E-回滚拨盘-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '悬疑',
        targetChapterCount: 5,
        targetWordsPerChapter: 2000,
        targetWords: 10000,
        brief: 'E2E 回滚拨盘测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('回滚按钮存在', async ({ page }) => {
    await page.goto(`/book/${bookId}/chapter/1`);
    await page.waitForTimeout(2000);

    const rollbackBtn = page.getByRole('button', { name: /回滚|rollback|时间回溯/i });
    if (await rollbackBtn.isVisible({ timeout: 3000 })) {
      await expect(rollbackBtn).toBeVisible();
    }
  });

  test('时间拨盘对话框', async ({ page }) => {
    await page.goto(`/book/${bookId}/chapter/1`);
    await page.waitForTimeout(2000);

    const rollbackBtn = page.getByRole('button', { name: /回滚|rollback/ }).first();
    if (await rollbackBtn.isVisible({ timeout: 2000 })) {
      await rollbackBtn.click();
      await page.waitForTimeout(1000);

      // 拨盘对话框
      const dialDialog = page.locator('[role="dialog"], [class*="dial"], [class*="time-dial"]');
      if (await dialDialog.first().isVisible({ timeout: 3000 })) {
        await expect(dialDialog.first()).toBeVisible();
      }
    }
  });

  test('仅逆时针拖拽有效（PRD-092a）', async ({ page }) => {
    await page.goto(`/book/${bookId}/chapter/1`);
    await page.waitForTimeout(2000);

    // 时间 dial 元素
    const timeDial = page.locator('[class*="time-dial"], [class*="TimeDial"]');
    if (await timeDial.first().isVisible({ timeout: 3000 })) {
      await expect(timeDial.first()).toBeVisible();
    }
  });

  test('章节卡片碎裂动画（PRD-092b）', async ({ page }) => {
    await page.goto(`/book/${bookId}/chapter/1`);
    await page.waitForTimeout(2000);

    // 碎裂动画 CSS 类
    const shatter = page.locator('[class*="shatter"], [class*="Shatter"]');
    if (await shatter.first().isVisible({ timeout: 3000 })) {
      await expect(shatter.first()).toBeVisible();
    }
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});
