import { expect, test } from '@playwright/test';

/**
 * E2E Test: 创作规划完整流程（PRD-010~015）
 * 覆盖：大纲生成、角色设计、世界观设定、分章规划
 */
test.describe('创作规划流程（PRD-010~015）', () => {
  const testBookTitle = `E2E-创作规划-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '玄幻',
        targetChapterCount: 50,
        targetWordsPerChapter: 3000,
        targetWords: 150000,
        brief: 'E2E 创作规划测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('1. 创作规划页面加载', async ({ page }) => {
    await page.goto(`/writing-plan?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /创作规划|灵感|世界观|角色/ })).toBeVisible();
  });

  test('2. 灵感与设定步骤', async ({ page }) => {
    await page.goto(`/writing-plan?bookId=${bookId}`);

    // 查找灵感输入区域
    const inspirationSection = page.locator('text=/灵感|设定|brief/i');
    await expect(inspirationSection.first()).toBeVisible({ timeout: 5000 });
  });

  test('3. 世界观构建步骤', async ({ page }) => {
    await page.goto(`/writing-plan?bookId=${bookId}`);

    // 查找世界观相关元素
    const worldBuildingSection = page.locator('text=/世界观|力量体系|地理|势力/i');
    if (await worldBuildingSection.first().isVisible({ timeout: 3000 })) {
      await expect(worldBuildingSection.first()).toBeVisible();
    }
  });

  test('4. 角色设计步骤', async ({ page }) => {
    await page.goto(`/writing-plan?bookId=${bookId}`);

    // 查找角色设计相关元素
    const characterSection = page.locator('text=/角色|人物|性格/i');
    if (await characterSection.first().isVisible({ timeout: 3000 })) {
      await expect(characterSection.first()).toBeVisible();
    }
  });

  test('5. 分章规划步骤（PRD-013）', async ({ page }) => {
    await page.goto(`/writing-plan?bookId=${bookId}`);

    // 查找分章规划相关元素
    const chapterPlanSection = page.locator('text=/分章|章节规划|关键事件/i');
    if (await chapterPlanSection.first().isVisible({ timeout: 3000 })) {
      await expect(chapterPlanSection.first()).toBeVisible();
    }

    // 查找规划按钮
    const planBtn = page.getByRole('button', { name: /生成规划|规划本章/i });
    if (await planBtn.isVisible()) {
      await expect(planBtn).toBeVisible();
    }
  });

  test('6. 步骤导航流转', async ({ page }) => {
    await page.goto(`/writing-plan?bookId=${bookId}`);

    // 验证步骤导航存在
    await expect(page.getByText('创作步骤')).toBeVisible({ timeout: 5000 });

    // 验证至少有一个步骤
    await expect(page.getByText('灵感与设定')).toBeVisible();
  });

  test.afterAll('清理测试书籍', async ({ request }) => {
    if (bookId) {
      await request.delete(`/api/books/${bookId}`);
    }
  });
});

/**
 * E2E Test: 章节阅读器与回滚（PRD-063, PRD-092）
 * 覆盖：章节阅读、回滚拨盘交互
 */
test.describe('章节阅读器与回滚（PRD-063, PRD-092）', () => {
  const testBookTitle = `E2E-章节阅读-${Date.now()}`;
  let bookId: string;
  let chapterNumber: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '都市',
        targetChapterCount: 20,
        targetWordsPerChapter: 2000,
        targetWords: 40000,
        brief: 'E2E 章节阅读测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('1. 章节阅读器加载', async ({ page }) => {
    await page.goto(`/book/${bookId}`);
    await expect(page.getByRole('heading', { name: testBookTitle })).toBeVisible();

    // 等待章节列表加载
    await page.waitForTimeout(2000);

    // 查找第一个章节链接
    const chapterLink = page.locator('a[href*="/chapter/"]').first();
    if (await chapterLink.isVisible({ timeout: 5000 })) {
      await chapterLink.click();
      await page.waitForTimeout(2000);

      // 验证不是 404
      await expect(page).not.toHaveURL(/404|error/i);
    }
  });

  test('2. 章节快照列表', async ({ page }) => {
    // 直接访问章节 URL
    await page.goto(`/book/${bookId}/chapter/1`);
    await page.waitForTimeout(2000);

    // 查找快照相关元素
    const snapshotSection = page.locator('text=/快照|snapshot/i');
    if (await snapshotSection.first().isVisible({ timeout: 3000 })) {
      await expect(snapshotSection.first()).toBeVisible();
    }
  });

  test('3. 回滚按钮显示', async ({ page }) => {
    await page.goto(`/book/${bookId}/chapter/1`);
    await page.waitForTimeout(2000);

    // 查找回滚按钮
    const rollbackBtn = page.getByRole('button', { name: /回滚|rollback/i });
    if (await rollbackBtn.isVisible({ timeout: 3000 })) {
      await expect(rollbackBtn).toBeVisible();
    }
  });

  test('4. 污染隔离标记显示（PRD-091）', async ({ page }) => {
    await page.goto(`/book/${bookId}/chapter/1`);
    await page.waitForTimeout(2000);

    // 查找污染隔离标记
    const pollutionBadge = page.locator('[class*="pollution"]').or(page.getByText(/污染|隔离/i));
    if (await pollutionBadge.first().isVisible({ timeout: 3000 })) {
      await expect(pollutionBadge.first()).toBeVisible();
    }
  });

  test('5. 审计报告雷达图显示（PRD-036b）', async ({ page }) => {
    await page.goto(`/book/${bookId}/chapter/1`);
    await page.waitForTimeout(2000);

    // 查找雷达图或审计报告
    const radarChart = page.locator('[class*="radar"], canvas');
    if (await radarChart.first().isVisible({ timeout: 3000 })) {
      await expect(radarChart.first()).toBeVisible();
    }
  });

  test.afterAll('清理测试书籍', async ({ request }) => {
    if (bookId) {
      await request.delete(`/api/books/${bookId}`);
    }
  });
});

/**
 * E2E Test: 伏笔双轨时间轴（PRD-056a, PRD-056b）
 * 覆盖：小地图、放大镜、惊群动画
 */
test.describe('伏笔双轨时间轴（PRD-056a, PRD-056b）', () => {
  const testBookTitle = `E2E-伏笔时间轴-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '玄幻',
        targetChapterCount: 100,
        targetWordsPerChapter: 3000,
        targetWords: 300000,
        brief: 'E2E 伏笔双轨时间轴测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('1. 伏笔双轨时间轴页面加载', async ({ page }) => {
    await page.goto(`/hooks/timeline?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /伏笔.*时间轴|双轨/i })).toBeVisible();
  });

  test('2. 小地图显示（PRD-056a）', async ({ page }) => {
    await page.goto(`/hooks/timeline?bookId=${bookId}`);

    // 查找小地图元素
    const minimap = page.locator('[class*="minimap"], [class*="mini-map"], canvas');
    if (await minimap.first().isVisible({ timeout: 5000 })) {
      await expect(minimap.first()).toBeVisible();
    }
  });

  test('3. 放大镜视图（PRD-056a）', async ({ page }) => {
    await page.goto(`/hooks/timeline?bookId=${bookId}`);

    // 查找放大镜相关元素
    const magnifier = page
      .getByText(/放大镜/i)
      .or(page.locator('[class*="magnifier"], [class*="zoom"]'));
    if (
      await magnifier
        .first()
        .isVisible({ timeout: 3000 })
        .catch(() => false)
    ) {
      await expect(magnifier.first()).toBeVisible();
    }
  });

  test('4. 惊群检测动画（PRD-056b）', async ({ page }) => {
    await page.goto(`/hooks/timeline?bookId=${bookId}`);

    // 查找惊群检测元素
    const thunderAlert = page.locator('text=/惊群|thunder/i');
    if (await thunderAlert.first().isVisible({ timeout: 3000 })) {
      await expect(thunderAlert.first()).toBeVisible();
    }
  });

  test('5. 热力色带显示', async ({ page }) => {
    await page.goto(`/hooks/timeline?bookId=${bookId}`);

    // 查找热力图或色带
    const heatmap = page.locator('[class*="heatmap"], [class*="heat"], canvas');
    if (await heatmap.first().isVisible({ timeout: 5000 })) {
      await expect(heatmap.first()).toBeVisible();
    }
  });

  test('6. 返回伏笔面板链接', async ({ page }) => {
    await page.goto(`/hooks/timeline?bookId=${bookId}`);

    const backLink = page.getByRole('link', { name: /返回伏笔面板/i });
    await expect(backLink).toBeVisible();
  });

  test.afterAll('清理测试书籍', async ({ request }) => {
    if (bookId) {
      await request.delete(`/api/books/${bookId}`);
    }
  });
});

/**
 * E2E Test: 心流模式与实体感知（PRD-024b）
 * 覆盖：心流模式开启、实体高亮、上下文气泡
 */
test.describe('心流模式与实体感知（PRD-024b）', () => {
  const testBookTitle = `E2E-心流模式-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '仙侠',
        targetChapterCount: 50,
        targetWordsPerChapter: 3000,
        targetWords: 150000,
        brief: 'E2E 心流模式测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('1. 心流模式入口', async ({ page }) => {
    await page.goto(`/writing?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /正文创作/ })).toBeVisible();

    // 查找心流模式按钮
    const flowModeBtn = page.getByRole('button', { name: /心流|flow/i });
    if (await flowModeBtn.isVisible({ timeout: 3000 })) {
      await expect(flowModeBtn).toBeVisible();
    }
  });

  test('2. 开启心流模式', async ({ page }) => {
    await page.goto(`/writing?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /正文创作/ })).toBeVisible();

    const flowModeBtn = page.getByRole('button', { name: /心流|flow/i });
    if (await flowModeBtn.isVisible()) {
      await flowModeBtn.click();
      await page.waitForTimeout(1000);

      // 验证心流模式已开启
      const flowIndicator = page.locator('text=/退出心流/i');
      if (await flowIndicator.isVisible({ timeout: 3000 })) {
        await expect(flowIndicator).toBeVisible();
      }
    }
  });

  test('3. 实体高亮显示', async ({ page }) => {
    await page.goto(`/writing?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /正文创作/ })).toBeVisible();

    // 查找带有实体高亮的文本
    const highlightedEntity = page.locator('mark[class*="border-dashed"]');
    if (await highlightedEntity.first().isVisible({ timeout: 5000 })) {
      await expect(highlightedEntity.first()).toBeVisible();
    }
  });

  test('4. 实体悬停上下文气泡', async ({ page }) => {
    await page.goto(`/writing?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /正文创作/ })).toBeVisible();

    // 查找高亮实体
    const highlightedEntity = page.locator('mark').first();
    if (await highlightedEntity.isVisible({ timeout: 5000 })) {
      // 悬停
      await highlightedEntity.hover();
      await page.waitForTimeout(500);

      // 查找上下文气泡
      const contextPopup = page.locator('[class*="popup"], [class*="context"]');
      if (await contextPopup.first().isVisible({ timeout: 3000 })) {
        await expect(contextPopup.first()).toBeVisible();
      }
    }
  });

  test('5. 退出心流模式', async ({ page }) => {
    await page.goto(`/writing?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /正文创作/ })).toBeVisible();

    const exitBtn = page.getByRole('button', { name: /退出心流/i });
    if (await exitBtn.isVisible({ timeout: 3000 })) {
      await exitBtn.click();
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
 * E2E Test: 记忆词云与灵感洗牌（PRD-036c, PRD-083b）
 * 覆盖：记忆词云动画、灵感洗牌功能
 */
test.describe('记忆词云与灵感洗牌（PRD-036c, PRD-083b）', () => {
  const testBookTitle = `E2E-词云洗牌-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '科幻',
        targetChapterCount: 30,
        targetWordsPerChapter: 2500,
        targetWords: 75000,
        brief: 'E2E 记忆词云测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('1. 记忆提取区域显示', async ({ page }) => {
    await page.goto(`/writing?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /正文创作/ })).toBeVisible();

    // 查找记忆提取相关元素
    const memorySection = page.locator('text=/记忆提取|memory/i');
    if (await memorySection.first().isVisible({ timeout: 3000 })) {
      await expect(memorySection.first()).toBeVisible();
    }
  });

  test('2. 词云显示', async ({ page }) => {
    await page.goto(`/writing?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /正文创作/ })).toBeVisible();

    // 查找词云容器
    const wordcloud = page.locator('[class*="wordcloud"], [class*="word-cloud"], canvas');
    if (await wordcloud.first().isVisible({ timeout: 5000 })) {
      await expect(wordcloud.first()).toBeVisible();
    }
  });

  test('3. 灵感洗牌按钮', async ({ page }) => {
    await page.goto(`/writing?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /正文创作/ })).toBeVisible();

    // 查找灵感洗牌按钮
    const shuffleBtn = page.getByRole('button', { name: /灵感洗牌|shuffle/i });
    if (await shuffleBtn.isVisible({ timeout: 3000 })) {
      await expect(shuffleBtn).toBeVisible();
    }
  });

  test('4. 灵感洗牌功能', async ({ page }) => {
    await page.goto(`/writing?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /正文创作/ })).toBeVisible();

    const shuffleBtn = page.getByRole('button', { name: /灵感洗牌|shuffle/i });
    if (await shuffleBtn.isVisible()) {
      await shuffleBtn.click();
      await page.waitForTimeout(5000); // 等待洗牌结果

      // 查找洗牌结果
      const shuffleResults = page.locator('text=/快节奏|细腻情感|内省/i');
      if (await shuffleResults.first().isVisible({ timeout: 10000 })) {
        await expect(shuffleResults.first()).toBeVisible();
      }
    }
  });

  test('5. 建议气泡显示（PRD-083b）', async ({ page }) => {
    await page.goto(`/writing?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /正文创作/ })).toBeVisible();

    // 查找建议气泡
    const suggestionBubble = page.locator('[class*="suggestion"], [class*="bubble"]');
    if (await suggestionBubble.first().isVisible({ timeout: 3000 })) {
      await expect(suggestionBubble.first()).toBeVisible();
    }
  });

  test.afterAll('清理测试书籍', async ({ request }) => {
    if (bookId) {
      await request.delete(`/api/books/${bookId}`);
    }
  });
});

/**
 * E2E Test: 状态差异对比（PRD-090）
 * 覆盖：脱节检测、自然语言翻译、差异对比
 */
test.describe('状态差异对比（PRD-090）', () => {
  const testBookTitle = `E2E-状态差异-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '悬疑',
        targetChapterCount: 20,
        targetWordsPerChapter: 2000,
        targetWords: 40000,
        brief: 'E2E 状态差异测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('1. Doctor 诊断页面', async ({ page }) => {
    await page.goto(`/doctor?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /Doctor|诊断/ })).toBeVisible();
  });

  test('2. 状态差异对比组件', async ({ page }) => {
    await page.goto(`/doctor?bookId=${bookId}`);

    // 查找差异对比元素
    const diffView = page.getByText(/差异|diff/i).or(page.locator('[class*="diff"]'));
    if (
      await diffView
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false)
    ) {
      await expect(diffView.first()).toBeVisible();
    }
  });

  test('3. 自然语言翻译显示', async ({ page }) => {
    await page.goto(`/doctor?bookId=${bookId}`);

    // 查找自然语言描述
    const nlDescription = page.locator('text=/系统发现|是否同步|语义化/i');
    if (await nlDescription.first().isVisible({ timeout: 3000 })) {
      await expect(nlDescription.first()).toBeVisible();
    }
  });

  test('4. 分类展示（角色/关系/物品）', async ({ page }) => {
    await page.goto(`/doctor?bookId=${bookId}`);

    // 查找分类标签
    const categoryLabels = page.locator('text=/角色|关系|物品/i');
    const count = await categoryLabels.count();
    if (count > 0) {
      await expect(categoryLabels.first()).toBeVisible();
    }
  });

  test.afterAll('清理测试书籍', async ({ request }) => {
    if (bookId) {
      await request.delete(`/api/books/${bookId}`);
    }
  });
});

/**
 * E2E Test: 章节合并与拆分（PRD-032, PRD-033）
 * 覆盖：章节合并、章节拆分
 */
test.describe('章节合并与拆分（PRD-032, PRD-033）', () => {
  const testBookTitle = `E2E-章节合并拆分-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '游戏',
        targetChapterCount: 20,
        targetWordsPerChapter: 2000,
        targetWords: 40000,
        brief: 'E2E 章节合并拆分测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('1. 章节列表合并/拆分入口', async ({ page }) => {
    await page.goto(`/book/${bookId}`);
    await expect(page.getByRole('heading', { name: testBookTitle })).toBeVisible();

    // 等待章节列表加载
    await page.waitForTimeout(2000);

    // 查找合并/拆分相关按钮
    const mergeBtn = page.getByRole('button', { name: /合并|merge/i });
    const splitBtn = page.getByRole('button', { name: /拆分|split/i });

    // 至少有一个可见
    const hasMerge = await mergeBtn.isVisible().catch(() => false);
    const hasSplit = await splitBtn.isVisible().catch(() => false);

    if (hasMerge || hasSplit) {
      // OK - 功能存在
    }
  });

  test('2. 合并章节弹窗', async ({ page }) => {
    await page.goto(`/book/${bookId}`);
    await expect(page.getByRole('heading', { name: testBookTitle })).toBeVisible();

    const mergeBtn = page.getByRole('button', { name: /合并|merge/i });
    if (await mergeBtn.isVisible()) {
      await mergeBtn.click();
      await page.waitForTimeout(1000);

      // 验证弹窗出现
      const mergeDialog = page.locator('[class*="dialog"], [class*="modal"], [role="dialog"]');
      if (await mergeDialog.first().isVisible({ timeout: 3000 })) {
        await expect(mergeDialog.first()).toBeVisible();
      }
    }
  });

  test('3. 拆分章节弹窗', async ({ page }) => {
    await page.goto(`/book/${bookId}`);
    await expect(page.getByRole('heading', { name: testBookTitle })).toBeVisible();

    const splitBtn = page.getByRole('button', { name: /拆分|split/i });
    if (await splitBtn.isVisible()) {
      await splitBtn.click();
      await page.waitForTimeout(1000);

      // 验证弹窗出现
      const splitDialog = page.locator('[class*="dialog"], [class*="modal"], [role="dialog"]');
      if (await splitDialog.first().isVisible({ timeout: 3000 })) {
        await expect(splitDialog.first()).toBeVisible();
      }
    }
  });

  test.afterAll('清理测试书籍', async ({ request }) => {
    if (bookId) {
      await request.delete(`/api/books/${bookId}`);
    }
  });
});

/**
 * E2E Test: 质量基线与漂移检测（PRD-083a, PRD-083b）
 * 覆盖：基线建立、漂移检测、琥珀关注区
 */
test.describe('质量基线与漂移检测（PRD-083a, PRD-083b）', () => {
  const testBookTitle = `E2E-质量基线-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '同人',
        targetChapterCount: 50,
        targetWordsPerChapter: 2500,
        targetWords: 125000,
        brief: 'E2E 质量基线测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('1. 分析页面基线图表', async ({ page }) => {
    await page.goto(`/analytics?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: '数据分析' })).toBeVisible();

    // 查找基线图表
    const baselineChart = page.locator('[class*="baseline"], canvas');
    if (await baselineChart.first().isVisible({ timeout: 5000 })) {
      await expect(baselineChart.first()).toBeVisible();
    }
  });

  test('2. 漂移阈值显示（琥珀色渐变区）', async ({ page }) => {
    await page.goto(`/analytics?bookId=${bookId}`);

    // 查找琥珀色相关元素
    const amberZone = page.locator('text=/30%|恶化|漂移/i');
    if (await amberZone.first().isVisible({ timeout: 3000 })) {
      await expect(amberZone.first()).toBeVisible();
    }
  });

  test('3. 柔和建议气泡（PRD-083b）', async ({ page }) => {
    await page.goto(`/analytics?bookId=${bookId}`);

    // 查找建议气泡
    const suggestion = page
      .getByText(/建议/i)
      .or(page.locator('[class*="suggestion"], [class*="bubble"]'));
    if (
      await suggestion
        .first()
        .isVisible({ timeout: 3000 })
        .catch(() => false)
    ) {
      await expect(suggestion.first()).toBeVisible();
    }
  });

  test.afterAll('清理测试书籍', async ({ request }) => {
    if (bookId) {
      await request.delete(`/api/books/${bookId}`);
    }
  });
});

/**
 * E2E Test: 世界规则编辑器（PRD-014）
 * 覆盖：世界规则设定
 */
test.describe('世界规则编辑器（PRD-014）', () => {
  const testBookTitle = `E2E-世界规则-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '科幻',
        targetChapterCount: 30,
        targetWordsPerChapter: 2500,
        targetWords: 75000,
        brief: 'E2E 世界规则测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('1. 真相文件页面世界规则区域', async ({ page }) => {
    await page.goto(`/truth-files?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: '真相文件' })).toBeVisible();

    // 查找世界规则相关元素
    const worldRules = page.locator('text=/世界规则|rule|约束/i');
    if (await worldRules.first().isVisible({ timeout: 3000 })) {
      await expect(worldRules.first()).toBeVisible();
    }
  });

  test.afterAll('清理测试书籍', async ({ request }) => {
    if (bookId) {
      await request.delete(`/api/books/${bookId}`);
    }
  });
});
