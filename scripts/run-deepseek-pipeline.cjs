/**
 * DeepSeek API 完整 Pipeline 运行线路测试
 *
 * 链路：initBook → writeNextChapter（ContextCard → Intent → Executor → Polisher → Audit → Persist）
 */

const path = require('path');
const fs = require('fs');

// 从构建后的 core 包导入
const core = require(path.join(__dirname, '..', 'packages', 'core', 'dist', 'index.js'));

const { PipelineRunner, DeepSeekProvider } = core;

const API_KEY = process.env.DEEPSEEK_API_KEY || '';
const ROOT_DIR = path.join(__dirname, '..', 'test-data');
const BOOK_ID = `test-${Date.now()}`;

if (!API_KEY) {
  console.error('错误：未设置 DEEPSEEK_API_KEY 环境变量');
  process.exit(1);
}

// 确保测试数据目录存在
if (!fs.existsSync(ROOT_DIR)) {
  fs.mkdirSync(ROOT_DIR, { recursive: true });
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runPipeline() {
  console.log('========================================');
  console.log('  DeepSeek 完整 Pipeline 运行线路测试');
  console.log('========================================\n');

  console.log(`[配置] 数据目录: ${ROOT_DIR}`);
  console.log(`[配置] 书籍 ID: ${BOOK_ID}`);
  console.log(`[配置] 模型: deepseek-chat\n`);

  // 1. 创建 Provider
  console.log('[1/4] 初始化 DeepSeek Provider...');
  const provider = new DeepSeekProvider({
    apiKey: API_KEY,
    baseURL: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    temperature: 0.7,
  });

  // 2. 创建 PipelineRunner
  console.log('[2/4] 创建 PipelineRunner...');
  const runner = new PipelineRunner({
    rootDir: ROOT_DIR,
    provider,
    maxRevisionRetries: 1,
    fallbackAction: 'accept_with_warnings',
  });

  // 3. 初始化书籍
  console.log('[3/4] 初始化测试书籍...');
  const initResult = await runner.initBook({
    bookId: BOOK_ID,
    title: '测试书籍：秘境探险',
    genre: '玄幻',
    synopsis:
      '少年林辰在一次意外中获得上古秘境的钥匙，踏上探索未知世界的旅程。',
    targetChapters: 3,
    tone: '热血',
    targetAudience: '青少年',
    platform: '起点',
  });

  if (!initResult.success) {
    console.error(`[失败] 书籍初始化失败: ${initResult.error}`);
    process.exit(1);
  }
  console.log(`[成功] 书籍已初始化: ${initResult.bookDir}\n`);

  // 4. 运行完整链路：写第一章
  console.log('[4/4] 运行完整链路：写第一章（预计 2-5 分钟）...');
  console.log('        子步骤: ContextCard → IntentDirector → ChapterExecutor → ScenePolisher → Audit → Persist');
  console.log('        请耐心等待 DeepSeek API 响应...\n');

  const startTime = Date.now();

  const result = await runner.writeNextChapter({
    bookId: BOOK_ID,
    chapterNumber: 1,
    title: '秘境开启',
    genre: '玄幻',
    userIntent: '第一章：林辰在山中探险时意外发现上古秘境入口，获得神秘钥匙，决定进入探索。',
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n========================================');
  console.log('  链路执行结果');
  console.log('========================================');
  console.log(`  成功: ${result.success}`);
  console.log(`  耗时: ${elapsed} 秒`);
  console.log(`  状态: ${result.status || 'N/A'}`);

  if (result.usage) {
    console.log(`\n  Token 使用量:`);
    console.log(`    提示词: ${result.usage.promptTokens}`);
    console.log(`    完成: ${result.usage.completionTokens}`);
    console.log(`    总计: ${result.usage.totalTokens}`);
    if (result.usage.breakdown) {
      console.log(`  各阶段明细:`);
      for (const [channel, usage] of Object.entries(result.usage.breakdown)) {
        console.log(`    ${channel}: 提示=${usage.promptTokens} 完成=${usage.completionTokens} 总计=${usage.totalTokens}`);
      }
    }
  }

  if (result.warning) {
    console.log(`\n  警告: ${result.warning}`);
  }

  if (result.error) {
    console.log(`\n  错误: ${result.error}`);
  }

  if (result.content) {
    const preview = result.content.slice(0, 500);
    console.log(`\n  内容预览 (前500字):\n  ---`);
    console.log(preview + (result.content.length > 500 ? '...' : ''));
    console.log(`  ---\n  总字数: ${result.content.length}`);
  }

  console.log(`\n  书籍数据目录: ${path.join(ROOT_DIR, BOOK_ID)}`);
  console.log('========================================\n');

  // 清理（可选：保留测试数据供查看）
  console.log('[完成] 测试结束。测试数据保留在 test-data/ 目录中。');
}

runPipeline().catch((err) => {
  console.error('\n[致命错误]', err);
  process.exit(1);
});
