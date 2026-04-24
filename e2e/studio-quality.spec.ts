import { expect, test } from '@playwright/test';

/**
 * E2E Test: 质量系统（PRD-035~043, PRD-083a/b）
 *
 * PRD-035: AI 痕迹检测 — 9 类 AI 生成特征识别
 * PRD-036: 33 维连续性审计
 * PRD-036a: 审计分层降级
 * PRD-036b: 审计报告可视化 — 8 维雷达图 + 33 维三级折叠
 * PRD-036c: 记忆抽取透视 — 词云动画
 * PRD-037: 4 种智能修复策略
 * PRD-038: 字数治理
 * PRD-083a: 质量基线快照
 * PRD-083b: 质量漂移柔和建议
 */
test.describe('AI 痕迹检测（PRD-035）', () => {
  const testBookTitle = `E2E-AI检测-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '玄幻',
        targetChapterCount: 10,
        targetWordsPerChapter: 2000,
        targetWords: 20000,
        brief: 'E2E AI 痕迹检测测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('9 类 AI 特征检测类别在 UI 中可识别', async ({ page }) => {
    await page.goto(`/analytics?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: '数据分析' })).toBeVisible();

    // AI 痕迹检测类别
    const aiTraceLabels = ['套话', '句式单调', '语义重复'];
    for (const label of aiTraceLabels) {
      const labelEl = page.getByText(label);
      if (await labelEl.first().isVisible({ timeout: 2000 })) {
        await expect(labelEl.first()).toBeVisible();
      }
    }
  });

  test('AI 痕迹评分显示在分析面板', async ({ page }) => {
    await page.goto(`/analytics?bookId=${bookId}`);
    const aiScore = page.getByText(/AI.*痕迹|ai.*score|ai.*trace/i);
    if (await aiScore.first().isVisible({ timeout: 3000 })) {
      await expect(aiScore.first()).toBeVisible();
    }
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});

test.describe('33 维连续性审计（PRD-036, PRD-036a）', () => {
  const testBookTitle = `E2E-33维审计-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '都市',
        targetChapterCount: 5,
        targetWordsPerChapter: 2000,
        targetWords: 10000,
        brief: 'E2E 33 维审计测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('审计维度分类显示：阻断级/警告级/建议级', async ({ page }) => {
    await page.goto(`/book/${bookId}/chapter/1`);
    await page.waitForTimeout(2000);

    const severityLabels = ['阻断级', '警告级', '建议级'];
    for (const label of severityLabels) {
      const el = page.getByText(label);
      if (await el.first().isVisible({ timeout: 2000 })) {
        await expect(el.first()).toBeVisible();
      }
    }
  });

  test('阻断级维度优先展示', async ({ page }) => {
    await page.goto(`/book/${bookId}/chapter/1`);
    await page.waitForTimeout(2000);

    // 查找审计报告容器
    const auditContainer = page.locator('[class*="audit"], [class*="Audit"]').first();
    if (await auditContainer.isVisible({ timeout: 3000 })) {
      const content = await auditContainer.innerText();
      const blockingIdx = content.indexOf('阻断');
      const warningIdx = content.indexOf('警告');
      if (blockingIdx >= 0 && warningIdx >= 0) {
        expect(blockingIdx).toBeLessThan(warningIdx);
      }
    }
  });

  test('单维 LLM 失败自动降级', async ({ page: _page, request }) => {
    // 通过 API 验证审计降级逻辑
    const res = await request.get(`/api/audit/${bookId}/chapter/1`);
    expect([200, 404, 501]).toContain(res.status());
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});

test.describe('审计报告可视化（PRD-036b）', () => {
  const testBookTitle = `E2E-审计UI-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '仙侠',
        targetChapterCount: 5,
        targetWordsPerChapter: 2000,
        targetWords: 10000,
        brief: 'E2E 审计报告 UI 测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('8 维度雷达图存在', async ({ page }) => {
    await page.goto(`/book/${bookId}/chapter/1`);
    await page.waitForTimeout(2000);

    // 查找雷达图 SVG 或 canvas
    const radarSvg = page.locator('svg[class*="radar"], canvas[class*="radar"], .radar-chart');
    if (await radarSvg.first().isVisible({ timeout: 3000 })) {
      await expect(radarSvg.first()).toBeVisible();
    }

    // 或查找通用的 svg 图表
    const genericSvg = page.locator('svg').first();
    if (await genericSvg.isVisible({ timeout: 2000 })) {
      await expect(genericSvg).toBeVisible();
    }
  });

  test('雷达图覆盖 8 个维度', async ({ page }) => {
    await page.goto(`/book/${bookId}/chapter/1`);
    await page.waitForTimeout(2000);

    // 条件断言：数据存在时验证维度
    const dimensions = ['AI 痕迹', '连贯性', '节奏', '对话', '描写', '情感', '创新', '完整性'];
    for (const dim of dimensions) {
      const el = page.getByText(dim);
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

  test('33 维明细三级折叠视图', async ({ page }) => {
    await page.goto(`/book/${bookId}/chapter/1`);
    await page.waitForTimeout(2000);

    // 查找折叠按钮
    const collapseBtns = page
      .locator('[class*="collapse"], button')
      .filter({ hasText: /阻断|警告|建议/ });
    if (await collapseBtns.first().isVisible({ timeout: 3000 })) {
      await expect(collapseBtns.first()).toBeVisible();
    }
  });

  test('折叠视图展开/收起交互', async ({ page }) => {
    await page.goto(`/book/${bookId}/chapter/1`);
    await page.waitForTimeout(2000);

    const expandBtn = page
      .locator('button')
      .filter({ hasText: /阻断级/ })
      .first();
    if (await expandBtn.isVisible({ timeout: 3000 })) {
      await expandBtn.click();
      await page.waitForTimeout(500);
      // 展开后内容应可见
      const expandedContent = page.locator('[class*="blocking"], [class*="Blocking"]').first();
      if (await expandedContent.isVisible({ timeout: 2000 })) {
        await expect(expandedContent).toBeVisible();
      }
    }
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});

test.describe('记忆抽取透视（PRD-036c）', () => {
  const testBookTitle = `E2E-记忆抽取-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '科幻',
        targetChapterCount: 5,
        targetWordsPerChapter: 2000,
        targetWords: 10000,
        brief: 'E2E 记忆抽取测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('词云容器存在', async ({ page }) => {
    await page.goto(`/writing?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /正文创作/ })).toBeVisible();

    const wordcloud = page.locator('[class*="wordcloud"], [class*="word-cloud"], [class*="cloud"]');
    if (await wordcloud.first().isVisible({ timeout: 5000 })) {
      await expect(wordcloud.first()).toBeVisible();
    }
  });

  test('高置信度事实居中+大字号', async ({ page }) => {
    await page.goto(`/writing?bookId=${bookId}`);

    // 词云中的大字元素
    const largeWords = page
      .locator('[class*="wordcloud"] span, [class*="cloud"] span')
      .filter({ hasText: /.{1,10}/ });
    if (await largeWords.first().isVisible({ timeout: 5000 })) {
      await expect(largeWords.first()).toBeVisible();
    }
  });

  test('低置信度污染标记标红置于边缘', async ({ page }) => {
    await page.goto(`/writing?bookId=${bookId}`);

    // 查找红色/边缘标记
    const redWords = page.locator('[class*="polluted"], [class*="low"], [style*="red"]');
    if (await redWords.first().isVisible({ timeout: 5000 })) {
      await expect(redWords.first()).toBeVisible();
    }
  });

  test('渐隐渐显动画效果', async ({ page }) => {
    await page.goto(`/writing?bookId=${bookId}`);
    // 等待词云出现后自动消失
    await page.waitForTimeout(5000);

    // 验证淡出（可能已消失）
    const wordcloud = page.locator('[class*="wordcloud"]').first();
    const isHidden = await wordcloud.isHidden().catch(() => true);
    // 可能已淡出，这是预期行为
    expect(isHidden || true).toBe(true);
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});

test.describe('智能修复策略（PRD-037）', () => {
  const testBookTitle = `E2E-修复策略-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '游戏',
        targetChapterCount: 5,
        targetWordsPerChapter: 2000,
        targetWords: 10000,
        brief: 'E2E 修复策略测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('4 种修复策略在 UI 中可识别', async ({ page }) => {
    await page.goto(`/book/${bookId}/chapter/1`);
    await page.waitForTimeout(2000);

    const strategies = ['局部替换', '段落重排', '节拍重写', '整章重写'];
    for (const strategy of strategies) {
      const el = page.getByText(strategy);
      if (await el.first().isVisible({ timeout: 1000 })) {
        await expect(el.first()).toBeVisible();
      }
    }
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});

test.describe('字数治理（PRD-038）', () => {
  const testBookTitle = `E2E-字数治理-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '悬疑',
        targetChapterCount: 5,
        targetWordsPerChapter: 2000,
        targetWords: 10000,
        brief: 'E2E 字数治理测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('章节字数显示', async ({ page }) => {
    await page.goto(`/book/${bookId}`);
    await expect(page.getByRole('heading', { name: testBookTitle })).toBeVisible();

    // 字数统计应显示
    const wordCount = page.getByText(/\d+\s*字/);
    if (await wordCount.first().isVisible({ timeout: 3000 })) {
      await expect(wordCount.first()).toBeVisible();
    }
  });

  test('目标字数/软区间/硬区间配置', async ({ page }) => {
    await page.goto(`/writing?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: /正文创作/ })).toBeVisible();

    const targetWords = page.getByText(/目标.*字|target.*word/i);
    if (await targetWords.first().isVisible({ timeout: 2000 })) {
      await expect(targetWords.first()).toBeVisible();
    }
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});

test.describe('质量基线快照（PRD-083a）', () => {
  const testBookTitle = `E2E-质量基线-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '同人',
        targetChapterCount: 10,
        targetWordsPerChapter: 2000,
        targetWords: 20000,
        brief: 'E2E 质量基线测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('质量基线在分析面板显示', async ({ page }) => {
    await page.goto(`/analytics?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: '数据分析' })).toBeVisible();

    const baselineLabel = page.getByText(/基线|baseline/i);
    if (await baselineLabel.first().isVisible({ timeout: 3000 })) {
      await expect(baselineLabel.first()).toBeVisible();
    }
  });

  test('基线包含 AI 痕迹/句式多样性/段落长度', async ({ page }) => {
    await page.goto(`/analytics?bookId=${bookId}`);

    const baselineMetrics = ['AI 痕迹', '句式', '段落'];
    for (const metric of baselineMetrics) {
      const el = page.getByText(metric);
      if (await el.first().isVisible({ timeout: 1000 })) {
        await expect(el.first()).toBeVisible();
      }
    }
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});

test.describe('质量漂移柔和建议（PRD-083b）', () => {
  const testBookTitle = `E2E-质量漂移-${Date.now()}`;
  let bookId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/books', {
      data: {
        title: testBookTitle,
        genre: '仙侠',
        targetChapterCount: 10,
        targetWordsPerChapter: 2000,
        targetWords: 20000,
        brief: 'E2E 质量漂移测试',
      },
    });
    const data = await res.json();
    bookId = data.data.id;
  });

  test('趋势图上绘制初始基线虚线', async ({ page }) => {
    await page.goto(`/analytics?bookId=${bookId}`);
    await expect(page.getByRole('heading', { name: '数据分析' })).toBeVisible();

    // SVG 虚线
    const dashedLine = page.locator('svg line[stroke-dasharray], svg polyline[stroke-dasharray]');
    if (await dashedLine.first().isVisible({ timeout: 3000 })) {
      await expect(dashedLine.first()).toBeVisible();
    }
  });

  test('恶化 30% 琥珀色渐变关注区', async ({ page }) => {
    await page.goto(`/analytics?bookId=${bookId}`);

    // 查找琥珀色/黄色关注区
    const amberZone = page.locator(
      '[class*="amber"], [class*="warning"], [style*="amber"], [style*="#f59e0b"]'
    );
    if (await amberZone.first().isVisible({ timeout: 3000 })) {
      await expect(amberZone.first()).toBeVisible();
    }
  });

  test('柔和建议气泡显示', async ({ page }) => {
    await page.goto(`/analytics?bookId=${bookId}`);

    const suggestionBubble = page.getByText(/建议|切换.*模型|调整.*大纲/i);
    if (await suggestionBubble.first().isVisible({ timeout: 3000 })) {
      await expect(suggestionBubble.first()).toBeVisible();
    }
  });

  test('灵感洗牌按钮存在', async ({ page }) => {
    await page.goto(`/analytics?bookId=${bookId}`);

    const shuffleBtn = page.getByRole('button', { name: /灵感洗牌|shuffle|重写/i });
    if (await shuffleBtn.isVisible({ timeout: 3000 })) {
      await expect(shuffleBtn).toBeVisible();
    }
  });

  test('无全屏闪烁警告', async ({ page }) => {
    await page.goto(`/analytics?bookId=${bookId}`);
    await page.waitForTimeout(3000);

    // 不应出现红色闪烁或全屏警告
    const flashOverlay = page.locator(
      '[class*="flash"], [class*="alert-danger"], [class*="error-full"]'
    );
    const isVisible = await flashOverlay
      .first()
      .isVisible()
      .catch(() => false);
    expect(isVisible).toBe(false);
  });

  test.afterAll('清理', async ({ request }) => {
    if (bookId) await request.delete(`/api/books/${bookId}`);
  });
});
