import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  History,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  RefreshCcw,
  FileCode,
  ArrowRightLeft,
  Search,
} from 'lucide-react';
import { fetchPromptVersions, setPromptVersion, fetchPromptDiff, fetchBook } from '../lib/api';

interface PromptVersion {
  version: string;
  label: string;
  date: string;
  description?: string;
  agentCount?: number;
}

interface BookSummary {
  id: string;
  title: string;
}

interface DiffResult {
  from: string;
  to: string;
  diff: string;
}

export default function PromptVersionView() {
  const { bookId } = useParams<{ bookId: string }>();
  const [loading, setLoading] = useState(true);
  const [book, setBook] = useState<BookSummary | null>(null);
  const [data, setData] = useState<{ versions: PromptVersion[]; current: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [compareFrom, setCompareFrom] = useState('v1');
  const [compareTo, setCompareTo] = useState('v2');

  useEffect(() => {
    if (!bookId) return;

    Promise.all([fetchBook(bookId), fetchPromptVersions(bookId)])
      .then(([bookData, promptData]) => {
        setLoadError(null);
        setBook(bookData);
        setData(promptData);
        if (promptData.versions.length >= 2) {
          setCompareFrom(promptData.versions[0].version);
          setCompareTo(promptData.versions[1].version);
        }
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : '无法获取提示词版本信息');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [bookId]);

  const runDiffComparison = async (from: string, to: string) => {
    if (!bookId || diffLoading) return;
    setDiffLoading(true);
    setActionError(null);
    setActionFeedback(null);
    try {
      const result = await fetchPromptDiff(bookId, from, to);
      setDiffResult(result);
    } catch (err) {
      setDiffResult(null);
      setActionError(err instanceof Error ? err.message : '获取提示词差异失败');
    } finally {
      setDiffLoading(false);
    }
  };

  const handleSwitchVersion = async (version: string) => {
    if (!bookId || switching) return;
    setSwitching(true);
    setActionError(null);
    setActionFeedback(null);
    try {
      await setPromptVersion(bookId, version);
      const updatedData = await fetchPromptVersions(bookId);
      setData(updatedData);
      setActionFeedback(`已切换到 ${version}。`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '切换提示词版本失败');
    } finally {
      setSwitching(false);
    }
  };

  const handleViewChanges = (version: string) => {
    if (!data) return;
    const idx = data.versions.findIndex((v) => v.version === version);
    const prevVersion = idx > 0 ? data.versions[idx - 1].version : data.versions[0].version;
    setCompareFrom(prevVersion);
    setCompareTo(version);
    void runDiffComparison(prevVersion, version);
  };

  const handleCompare = async () => {
    await runDiffComparison(compareFrom, compareTo);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <RefreshCcw className="mr-2 h-4 w-4 animate-spin" />
        加载中…
      </div>
    );
  }

  if (!data || !book) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive opacity-50 mb-4" />
        <h3 className="text-lg font-medium">加载失败</h3>
        <p className="text-muted-foreground mt-1">{loadError || '无法获取提示词版本信息'}</p>
        <Link to={`/book/${bookId}`} className="mt-4 text-primary hover:underline inline-block">
          返回书籍详情
        </Link>
      </div>
    );
  }

  const currentVersion = data.versions.find((v) => v.version === data.current);

  return (
    <div className="container mx-auto py-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            首页
          </Link>
          <ChevronRight size={14} />
          <Link to={`/book/${bookId}`} className="hover:text-foreground">
            {book.title}
          </Link>
          <ChevronRight size={14} />
          <span className="text-foreground font-medium">提示词版本</span>
        </div>
        <Link
          to={`/book/${bookId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← 返回书籍详情
        </Link>
      </div>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">提示词版本管理</h1>
        <p className="text-muted-foreground">
          管理本书使用的 AI 提示词版本，确保生成质量的稳定性。
        </p>
      </header>

      {actionError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {actionError}
        </div>
      )}

      {actionFeedback && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {actionFeedback}
        </div>
      )}

      <div className="grid gap-6">
        {/* Current Configuration */}
        <section className="rounded-lg border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4 text-lg font-semibold">
            <CheckCircle2 className="text-green-500" size={20} />
            <h2>当前配置</h2>
          </div>
          <div className="bg-accent/30 rounded-lg p-4 border border-accent flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium mb-1">
                当前使用版本: <span className="text-primary">{data.current}</span>
              </div>
              <div className="text-sm text-muted-foreground">
                说明: 本书当前固定使用 {currentVersion?.label || data.current}{' '}
                提示词，不受全局更新影响。
              </div>
            </div>
            <div className="flex gap-2">
              <button
                disabled={data.current === 'latest' || switching}
                onClick={() => handleSwitchVersion('latest')}
                className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:bg-secondary/80 disabled:opacity-50"
              >
                切换为 latest (跟随最新)
              </button>
            </div>
          </div>
        </section>

        {/* Available Versions */}
        <section className="rounded-lg border bg-card shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center gap-2 text-lg font-semibold">
            <History size={20} />
            <h2>可用版本</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground font-medium">
                <tr>
                  <th className="px-6 py-3 text-left">版本</th>
                  <th className="px-6 py-3 text-left">创建日期</th>
                  <th className="px-6 py-3 text-left">变更说明</th>
                  <th className="px-6 py-3 text-left">Agent 数</th>
                  <th className="px-6 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.versions.map((v) => (
                  <tr key={v.version} className={v.version === data.current ? 'bg-primary/5' : ''}>
                    <td className="px-6 py-4 font-medium">
                      {v.version}
                      {v.version === data.current && (
                        <span className="ml-2 px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full">
                          当前
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{v.date}</td>
                    <td className="px-6 py-4">
                      {v.description ||
                        (v.version === 'v2'
                          ? '优化审计提示词，增强逻辑一致性。'
                          : '初始版本，基于三幕式结构。')}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{v.agentCount || 21} 个</td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button
                        onClick={() => handleViewChanges(v.version)}
                        className="text-primary hover:underline"
                      >
                        查看变更
                      </button>
                      {v.version !== data.current && (
                        <button
                          disabled={switching}
                          onClick={() => handleSwitchVersion(v.version)}
                          className="text-primary hover:underline"
                        >
                          切换到{v.version}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Version Comparison */}
        <section className="rounded-lg border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4 text-lg font-semibold">
            <ArrowRightLeft size={20} />
            <h2>版本对比</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3 mb-6 bg-muted/30 p-3 rounded-md border">
            <span className="text-sm font-medium">对比版本:</span>
            <select
              value={compareFrom}
              onChange={(e) => setCompareFrom(e.target.value)}
              className="px-3 py-1.5 rounded border bg-background text-sm min-w-[100px]"
            >
              {data.versions.map((v) => (
                <option key={v.version} value={v.version}>
                  {v.version}
                </option>
              ))}
            </select>
            <span className="text-muted-foreground text-sm">vs</span>
            <select
              value={compareTo}
              onChange={(e) => setCompareTo(e.target.value)}
              className="px-3 py-1.5 rounded border bg-background text-sm min-w-[100px]"
            >
              {data.versions.map((v) => (
                <option key={v.version} value={v.version}>
                  {v.version}
                </option>
              ))}
            </select>
            <button
              onClick={handleCompare}
              disabled={diffLoading}
              className="ml-auto px-4 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 flex items-center gap-1 disabled:opacity-50"
            >
              {diffLoading ? (
                <RefreshCcw size={14} className="animate-spin" />
              ) : (
                <Search size={14} />
              )}
              开始对比
            </button>
          </div>

          {diffResult ? (
            <div className="border rounded-md overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/50 border-b px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <span>差异摘要</span>
                <span>
                  {diffResult.from || compareFrom} vs {diffResult.to || compareTo}
                </span>
              </div>
              <div className="bg-background px-4 py-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                  <FileCode size={14} className="text-muted-foreground" />
                  接口返回结果
                </div>
                <pre className="whitespace-pre-wrap rounded-md border bg-muted/20 p-4 text-sm leading-6 text-foreground">
                  {diffResult.diff || '未发现可展示的版本差异。'}
                </pre>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 border border-dashed rounded-md bg-muted/10">
              <p className="text-muted-foreground text-sm">
                选择两个版本并点击「开始对比」查看提示词差异
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
