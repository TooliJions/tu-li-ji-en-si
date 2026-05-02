import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const GENRE_OPTIONS = ['都市', '玄幻', '科幻', '仙侠', '历史', '悬疑', '游戏', '同人', '其他'];
const PLATFORM_OPTIONS = [
  { value: 'qidian', label: '起点中文网' },
  { value: 'fanqie', label: '番茄小说' },
  { value: 'jjwxc', label: '晋江文学城' },
  { value: 'webnovel', label: 'Webnovel' },
];
const PROMPT_VERSION_OPTIONS = ['latest', 'v2', 'v1'];
const MODEL_OPTIONS = ['qwen3.6-plus', 'gpt-4o', 'gpt-4o-mini', 'claude-3.7-sonnet'];

interface ModelConfig {
  useGlobalDefaults: boolean;
  writer: string;
  auditor: string;
  planner: string;
}

/**
 * 从 brief 文本中提取目标字数（单位：字）。
 * 支持格式：
 *   "500万字" / "500万" / "50万字" / "5万字"
 *   "5000000字" / "5000000"
 *   "三百万字" / "一百万字"
 */
function extractTargetWordsFromBrief(text: string): number | null {
  if (!text.trim()) return null;

  const chineseDigitMap: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
    百: 100,
    千: 1000,
    万: 10000,
    亿: 100000000,
  };

  // 中文数字解析（简易版，支持"三百"、"五十"、"一百二十"等）
  function parseChineseNumber(s: string): number {
    let result = 0;
    let current = 0;
    for (const ch of s) {
      const v = chineseDigitMap[ch];
      if (v === undefined) continue;
      if (v >= 10) {
        if (current === 0) current = 1;
        if (v >= 10000) {
          result = result + current * v;
          current = 0;
        } else {
          current *= v;
        }
      } else {
        current = v;
      }
    }
    return result + current;
  }

  // Pattern 1: "X万字" or "X万" (Arabic numerals)
  const wanMatch = text.match(/(\d+(?:\.\d+)?)\s*万字/);
  if (wanMatch) return Math.round(parseFloat(wanMatch[1]) * 10000);

  // Pattern 2: "X百万字" (Arabic numerals)
  const baiWanMatch = text.match(/(\d+(?:\.\d+)?)\s*百万字/);
  if (baiWanMatch) return Math.round(parseFloat(baiWanMatch[1]) * 1000000);

  // Pattern 3: pure digit + "字"
  const digitMatch = text.match(/(\d{5,})\s*字/);
  if (digitMatch) return parseInt(digitMatch[1], 10);

  // Pattern 4: Chinese number + "万字"
  const cnWanMatch = text.match(/([一二三四五六七八九十百千万亿零]+)\s*万字/);
  if (cnWanMatch) {
    const n = parseChineseNumber(cnWanMatch[1]);
    if (n > 0) return n * 10000;
  }

  // Pattern 5: Chinese number + "百万字"
  const cnBaiWanMatch = text.match(/([一二三四五六七八九十百千万亿零]+)\s*百万字/);
  if (cnBaiWanMatch) {
    const n = parseChineseNumber(cnBaiWanMatch[1]);
    if (n > 0) return n * 1000000;
  }

  return null;
}

export default function BookCreate() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState('');
  const [language, setLanguage] = useState<'zh-CN' | 'en-US'>('zh-CN');
  const [platform, setPlatform] = useState('qidian');
  const [targetWordsPerChapter, setTargetWordsPerChapter] = useState(3000);
  const [totalWordsOverride, setTotalWordsOverride] = useState<number | null>(null);
  // 用字符串状态跟踪输入框，避免受控数字组件吞掉小数点/清空内容
  const [targetWordsWan, setTargetWordsWan] = useState('30');
  const [promptVersion, setPromptVersion] = useState('v2');
  const [modelConfig, setModelConfig] = useState<ModelConfig>({
    useGlobalDefaults: true,
    writer: 'qwen3.6-plus',
    auditor: 'gpt-4o',
    planner: 'qwen3.6-plus',
  });
  const [brief, setBrief] = useState('');
  const [briefFileName, setBriefFileName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 从 brief 中自动提取目标字数
  const briefTargetWords = useMemo(() => extractTargetWordsFromBrief(brief), [brief]);

  // 总字数 = 用户手动覆盖 > brief 提取 > 默认 30 万字
  const targetWords = totalWordsOverride ?? briefTargetWords ?? 300000;
  const targetChapterCount = Math.max(1, Math.ceil(targetWords / targetWordsPerChapter));

  // 同步输入框显示值
  useEffect(() => {
    if (totalWordsOverride !== null) {
      setTargetWordsWan(String(totalWordsOverride / 10000));
    } else {
      const wan = (briefTargetWords ?? 300000) / 10000;
      setTargetWordsWan(String(wan));
    }
  }, [totalWordsOverride, briefTargetWords]);

  // 格式化总字数显示
  function formatWords(w: number): string {
    if (w >= 100000000) return `${(w / 100000000).toFixed(1)}亿`;
    if (w >= 10000) return `${(w / 10000).toFixed(w % 10000 === 0 ? 0 : 1)}万`;
    return w.toLocaleString();
  }

  function updateModelConfig<K extends keyof ModelConfig>(key: K, value: ModelConfig[K]) {
    setModelConfig((prev) => ({ ...prev, [key]: value }));
  }

  function handleBasicSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStep(2);
  }

  async function handleBriefFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    setBriefFileName(file.name);

    if (typeof file.text === 'function') {
      setBrief(await file.text());
      return;
    }

    const buffer = await file.arrayBuffer();
    setBrief(new TextDecoder().decode(buffer));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          genre,
          language,
          platform,
          targetChapterCount,
          targetWordsPerChapter,
          targetWords,
          promptVersion,
          modelConfig,
          brief,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || '创建失败');
      }

      const data = await res.json();
      navigate(brief.trim() ? `/inspiration?bookId=${data.data.id}` : `/book/${data.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">新建书籍</h1>

      {/* Step Indicator */}
      <div className="flex items-center gap-4 text-sm">
        <span className={step >= 1 ? 'font-medium' : 'text-muted-foreground'}>① 基本信息</span>
        <span className="text-muted-foreground">→</span>
        <span className={step >= 2 ? 'font-medium' : 'text-muted-foreground'}>② 创作设置</span>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 text-destructive rounded-md text-sm">{error}</div>
      )}

      {step === 1 && (
        <form onSubmit={handleBasicSubmit} className="space-y-5 rounded-lg border bg-card p-6">
          <div>
            <label htmlFor="book-title" className="block text-sm font-medium mb-1">
              书名
            </label>
            <input
              id="book-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border rounded-md bg-background"
              placeholder="输入书名…"
              required
            />
          </div>
          <div>
            <label htmlFor="book-genre" className="block text-sm font-medium mb-1">
              题材
            </label>
            <select
              id="book-genre"
              aria-label="题材"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="w-full px-3 py-2 border rounded-md bg-background"
              required
            >
              <option value="">选择题材…</option>
              {GENRE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">语言</legend>
            <div className="flex gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="language"
                  value="zh-CN"
                  checked={language === 'zh-CN'}
                  onChange={() => setLanguage('zh-CN')}
                />
                中文
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="language"
                  value="en-US"
                  checked={language === 'en-US'}
                  onChange={() => setLanguage('en-US')}
                />
                英文
              </label>
            </div>
          </fieldset>

          <div>
            <label htmlFor="book-platform" className="block text-sm font-medium mb-1">
              平台
            </label>
            <select
              id="book-platform"
              aria-label="平台"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full px-3 py-2 border rounded-md bg-background"
            >
              {PLATFORM_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            下一步
          </button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={handleSubmit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-5 rounded-lg border bg-card p-6">
            <h2 className="text-lg font-semibold">创作设置</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="target-total-words" className="block text-sm font-medium mb-1">
                  目标总字数（万字）
                </label>
                <input
                  id="target-total-words"
                  aria-label="目标总字数（万字）"
                  type="text"
                  inputMode="decimal"
                  value={targetWordsWan}
                  onChange={(e) => {
                    const raw = e.target.value;
                    // 只允许数字和最多一个小数点
                    if (!/^\d*\.?\d*$/.test(raw)) return;
                    setTargetWordsWan(raw);
                    const wan = raw === '' || raw === '.' ? 0 : Number(raw);
                    if (wan > 0) {
                      setTotalWordsOverride(Math.round(wan * 10000));
                    } else {
                      setTotalWordsOverride(null);
                    }
                  }}
                  className="w-full px-3 py-2 border rounded-md bg-background"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  对应 {formatWords(targetWords)}字
                </p>
                {briefTargetWords && totalWordsOverride === null && (
                  <p className="text-xs text-muted-foreground mt-1">
                    从创作简报自动识别：{formatWords(briefTargetWords)}字
                  </p>
                )}
              </div>
              <div>
                <label
                  htmlFor="target-words-per-chapter"
                  className="block text-sm font-medium mb-1"
                >
                  目标字数/章
                </label>
                <input
                  id="target-words-per-chapter"
                  aria-label="目标字数/章"
                  type="number"
                  min={500}
                  step={100}
                  value={targetWordsPerChapter}
                  onChange={(e) => setTargetWordsPerChapter(Number(e.target.value) || 500)}
                  className="w-full px-3 py-2 border rounded-md bg-background"
                />
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              预计 {targetChapterCount} 章 × {targetWordsPerChapter.toLocaleString()} 字 ={' '}
              {formatWords(targetWords)}字
              {totalWordsOverride !== null && (
                <button
                  type="button"
                  className="ml-2 text-primary underline text-xs"
                  onClick={() => setTotalWordsOverride(null)}
                >
                  重置为自动
                </button>
              )}
            </p>

            <div>
              <label htmlFor="prompt-version" className="block text-sm font-medium mb-1">
                提示词版本
              </label>
              <select
                id="prompt-version"
                aria-label="提示词版本"
                value={promptVersion}
                onChange={(e) => setPromptVersion(e.target.value)}
                className="w-full px-3 py-2 border rounded-md bg-background"
              >
                {PROMPT_VERSION_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3 rounded-lg border bg-background/60 p-4">
              <label className="inline-flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={!modelConfig.useGlobalDefaults}
                  onChange={(e) => updateModelConfig('useGlobalDefaults', !e.target.checked)}
                />
                不使用全局默认
              </label>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="writer-model" className="block text-sm font-medium mb-1">
                    Writer Agent
                  </label>
                  <select
                    id="writer-model"
                    aria-label="Writer Agent"
                    value={modelConfig.writer}
                    disabled={modelConfig.useGlobalDefaults}
                    onChange={(e) => updateModelConfig('writer', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md bg-background disabled:opacity-60"
                  >
                    {MODEL_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="auditor-model" className="block text-sm font-medium mb-1">
                    Auditor Agent
                  </label>
                  <select
                    id="auditor-model"
                    aria-label="Auditor Agent"
                    value={modelConfig.auditor}
                    disabled={modelConfig.useGlobalDefaults}
                    onChange={(e) => updateModelConfig('auditor', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md bg-background disabled:opacity-60"
                  >
                    {MODEL_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="planner-model" className="block text-sm font-medium mb-1">
                    Planner Agent
                  </label>
                  <select
                    id="planner-model"
                    aria-label="Planner Agent"
                    value={modelConfig.planner}
                    disabled={modelConfig.useGlobalDefaults}
                    onChange={(e) => updateModelConfig('planner', e.target.value)}
                    className="w-full px-3 py-2 border rounded-md bg-background disabled:opacity-60"
                  >
                    {MODEL_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <label htmlFor="brief-textarea" className="block text-sm font-medium">
                  创作简报
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
                  上传 markdown 文件
                  <input
                    type="file"
                    accept=".md,.markdown,.txt"
                    aria-label="上传 markdown 文件"
                    className="hidden"
                    onChange={handleBriefFileChange}
                  />
                </label>
              </div>
              {briefFileName && (
                <p className="mb-2 text-xs text-muted-foreground">已导入：{briefFileName}</p>
              )}
              <textarea
                id="brief-textarea"
                aria-label="创作简报"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                className="w-full px-3 py-2 border rounded-md bg-background"
                rows={8}
                placeholder="将已有设定、创作简报或章节规划粘贴到这里…"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex-1 px-4 py-2 border rounded-md hover:bg-accent"
              >
                返回修改
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                {submitting ? '创建中…' : '创建书籍'}
              </button>
            </div>
          </div>

          <aside className="rounded-lg border bg-card p-6">
            <h2 className="text-lg font-semibold">创建摘要</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">书名</dt>
                <dd className="font-medium text-right">{title || '未填写'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">题材</dt>
                <dd>{genre || '未选择'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">语言</dt>
                <dd>{language === 'zh-CN' ? '中文' : '英文'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">平台</dt>
                <dd>{PLATFORM_OPTIONS.find((option) => option.value === platform)?.label}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">提示词版本</dt>
                <dd>{promptVersion}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">章节规划</dt>
                <dd>
                  约 {targetChapterCount} 章 / {formatWords(targetWords)}字
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">模型配置</dt>
                <dd>{modelConfig.useGlobalDefaults ? '全局默认' : '自定义'}</dd>
              </div>
            </dl>
          </aside>
        </form>
      )}
    </div>
  );
}
