import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function BookCreate() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState('');
  const [targetWords, setTargetWords] = useState(30000);
  const [brief, setBrief] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, genre, targetWords, brief }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || '创建失败');
      }

      const data = await res.json();
      navigate(`/book/${data.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">新建书籍</h1>

      {/* Step Indicator */}
      <div className="flex items-center gap-4 text-sm">
        <span className={step >= 1 ? 'font-medium' : 'text-muted-foreground'}>① 基本信息</span>
        <span className="text-muted-foreground">→</span>
        <span className={step >= 2 ? 'font-medium' : 'text-muted-foreground'}>② 确认创建</span>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 text-destructive rounded-md text-sm">{error}</div>
      )}

      {step === 1 && (
        <form onSubmit={() => setStep(2)} className="space-y-4 rounded-lg border bg-card p-6">
          <div>
            <label className="block text-sm font-medium mb-1">书名</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border rounded-md bg-background"
              placeholder="输入书名…"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">类型</label>
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="w-full px-3 py-2 border rounded-md bg-background"
              required
            >
              <option value="">选择类型…</option>
              <option value="玄幻">玄幻</option>
              <option value="都市">都市</option>
              <option value="科幻">科幻</option>
              <option value="历史">历史</option>
              <option value="悬疑">悬疑</option>
              <option value="言情">言情</option>
              <option value="同人">同人</option>
              <option value="其他">其他</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">目标字数</label>
            <input
              type="number"
              value={targetWords}
              onChange={(e) => setTargetWords(Number(e.target.value))}
              className="w-full px-3 py-2 border rounded-md bg-background"
              min={1000}
              step={1000}
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              约 {Math.ceil(targetWords / 3000)} 章（每章 ~3000 字）
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">简介（可选）</label>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              className="w-full px-3 py-2 border rounded-md bg-background"
              rows={3}
              placeholder="简要描述故事背景…"
            />
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
        <div className="space-y-4 rounded-lg border bg-card p-6">
          <h2 className="text-lg font-semibold">确认信息</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">书名</dt>
              <dd className="font-medium">{title}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">类型</dt>
              <dd>{genre}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">目标字数</dt>
              <dd>{targetWords.toLocaleString()} 字</dd>
            </div>
            {brief && (
              <div>
                <dt className="text-muted-foreground">简介</dt>
                <dd className="mt-1 text-muted-foreground">{brief}</dd>
              </div>
            )}
          </dl>
          <div className="flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="flex-1 px-4 py-2 border rounded-md hover:bg-accent"
            >
              返回修改
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? '创建中…' : '确认创建'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
