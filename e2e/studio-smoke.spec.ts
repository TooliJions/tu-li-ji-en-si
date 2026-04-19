import { expect, test } from '@playwright/test';

test('studio main path stays reachable after creating a book', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '仪表盘' })).toBeVisible();

  await page.getByRole('link', { name: '新建书籍' }).click();
  await expect(page.getByRole('heading', { name: '新建书籍' })).toBeVisible();

  await page.getByLabel('书名').fill('E2E 冒烟书');
  await page.getByLabel('题材').selectOption('都市');
  await page.getByRole('button', { name: '下一步' }).click();

  await expect(page.getByRole('heading', { name: '创作设置' })).toBeVisible();
  await page.getByLabel('创作简报').fill('这是 E2E 冒烟测试创建的书籍，用于验证主路径可达。');
  await page.getByRole('button', { name: '创建书籍' }).click();

  await expect(page).toHaveURL(/\/book\/book-/);
  await expect(page.getByRole('heading', { name: 'E2E 冒烟书' })).toBeVisible();

  const bookId = page.url().split('/').pop();
  if (!bookId) {
    throw new Error('创建书籍后未能从 URL 提取 bookId');
  }

  await page.getByRole('link', { name: '快速试写' }).click();
  await expect(page).toHaveURL(new RegExp(`/writing\\?bookId=${bookId}$`));
  await expect(page.getByRole('heading', { name: /写作工作台/ })).toBeVisible();
  await expect(page.getByText('记忆提取')).toBeVisible();

  await page.goto(`/hooks?bookId=${bookId}`);
  await expect(page.getByRole('heading', { name: '伏笔管理' })).toBeVisible();
  await expect(page.getByRole('button', { name: '时间轴' })).toBeVisible();

  await page.goto(`/truth-files?bookId=${bookId}`);
  await expect(page.getByRole('heading', { name: '真相文件' })).toBeVisible();
  await expect(page.getByText('导入 Markdown')).toBeVisible();
});
