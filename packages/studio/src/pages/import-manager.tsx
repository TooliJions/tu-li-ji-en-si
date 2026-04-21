import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle, FileUp, RefreshCw, SearchCheck } from 'lucide-react';
import { fetchProjectionStatus, fetchStateDiff, fetchTruthFiles, importMarkdown } from '../lib/api';
import StateDiffView from '../components/state-diff-view';

interface TruthFileEntry {
  name: string;
  updatedAt: string;
  size: number;
}

interface ProjectionStatus {
  synced: boolean;
  jsonHash: string;
  markdownMtime: string;
  discrepancies: string[];
}

interface ImportResult {
  parsed: { versionToken: number; diff: string[] };
  preview: string;
}

interface StateDiff {
  file: string;
  summary: string;
  changes: Array<{
    character: string;
    field: string;
    oldValue: string;
    newValue: string;
    naturalLanguage: string;
  }>;
  severity: string;
}

export default function ImportManager() {
  const [searchParams] = useSearchParams();
  const bookId = searchParams.get('bookId') || '';
  const requestedFile = searchParams.get('file') || 'current_state';
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<TruthFileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState(requestedFile);
  const [projection, setProjection] = useState<ProjectionStatus | null>(null);
  const [markdownContent, setMarkdownContent] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffData, setDiffData] = useState<StateDiff | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedFile(requestedFile);
  }, [requestedFile]);

  useEffect(() => {
    if (!bookId) {
      setLoading(false);
      return;
    }

    void loadImportContext(bookId);
  }, [bookId]);

  async function loadImportContext(currentBookId: string) {
    setLoading(true);
    try {
      const [truthFiles, projectionStatus] = await Promise.all([
        fetchTruthFiles(currentBookId),
        fetchProjectionStatus(currentBookId),
      ]);
      setFiles(truthFiles.files || []);
      setProjection(projectionStatus);
      if (
        truthFiles.files?.length &&
        !truthFiles.files.some((file: TruthFileEntry) => file.name === selectedFile)
      ) {
        setSelectedFile(truthFiles.files[0].name);
      }
    } catch {
      setFiles([]);
      setProjection(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!bookId || !selectedFile || !markdownContent.trim()) return;
    setImportLoading(true);
    setImportError(null);
    try {
      const result = await importMarkdown(bookId, selectedFile, markdownContent);
      setImportResult(result);
      setMarkdownContent('');
      await loadImportContext(bookId);
    } catch {
      setImportError('导入失败，请检查 Markdown 内容后重试。');
      setImportResult(null);
    } finally {
      setImportLoading(false);
    }
  }

  async function handleLoadDiff() {
    setDiffLoading(true);
    setDiffError(null);
    try {
      const diff = await fetchStateDiff(selectedFile);
      setDiffData(diff);
    } catch {
      setDiffData(null);
      setDiffError('状态差异加载失败。');
    } finally {
      setDiffLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">加载中…</div>
    );
  }

  if (!bookId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        请先选择一本书籍后再管理状态导入。
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">导入管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            集中处理 Markdown 投影回填、投影状态检查与状态差异确认。
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link
            to={`/truth-files?bookId=${bookId}&tab=current-state`}
            className="text-muted-foreground hover:text-foreground"
          >
            真相文件
          </Link>
          <Link to="/doctor" className="text-muted-foreground hover:text-foreground">
            系统诊断
          </Link>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                {projection?.synced ? (
                  <CheckCircle size={18} className="text-green-600" />
                ) : (
                  <AlertCircle size={18} className="text-amber-500" />
                )}
                <h2 className="text-lg font-semibold">投影状态</h2>
              </div>
              <span
                className={`rounded-full px-2 py-1 text-xs ${projection?.synced ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}
              >
                {projection?.synced ? '已同步' : '存在差异'}
              </span>
            </div>

            <div className="space-y-3 text-sm">
              <div className="rounded border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">JSON 核心哈希</div>
                <div className="mt-1 font-mono">{projection?.jsonHash || 'N/A'}</div>
              </div>
              <div className="rounded border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">Markdown 最后更新</div>
                <div className="mt-1">
                  {projection?.markdownMtime
                    ? new Date(projection.markdownMtime).toLocaleString()
                    : 'N/A'}
                </div>
              </div>
            </div>

            {projection?.discrepancies && projection.discrepancies.length > 0 && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <div className="font-medium">检测到真相漂移</div>
                <ul className="mt-2 space-y-1 text-xs">
                  {projection.discrepancies.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4 text-primary">
              <FileUp size={18} />
              <h2 className="text-lg font-semibold">同步导入</h2>
            </div>

            <label htmlFor="import-file" className="mb-1 block text-xs text-muted-foreground">
              目标真相源
            </label>
            <select
              id="import-file"
              aria-label="目标真相源"
              value={selectedFile}
              onChange={(event) => setSelectedFile(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {files.map((file) => (
                <option key={file.name} value={file.name}>
                  {file.name}
                </option>
              ))}
            </select>

            <textarea
              value={markdownContent}
              onChange={(event) => setMarkdownContent(event.target.value)}
              placeholder="# 在此粘贴 Markdown 内容..."
              className="mt-4 h-56 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
            />

            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="text-xs">
                {importResult ? (
                  <span className="text-green-700">{importResult.preview}</span>
                ) : importError ? (
                  <span className="text-red-600">{importError}</span>
                ) : (
                  <span className="text-muted-foreground">导入后会重新生成 Markdown 投影。</span>
                )}
              </div>
              <button
                onClick={handleImport}
                disabled={importLoading || !markdownContent.trim()}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {importLoading ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <FileUp size={14} />
                )}
                执行同步导入
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <SearchCheck size={18} />
                  <h2 className="text-lg font-semibold">状态差异</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  在导入前查看 JSON 真相源与 Markdown 投影的自然语言差异。
                </p>
              </div>
              <button
                onClick={handleLoadDiff}
                className="rounded-md border px-4 py-2 text-sm hover:bg-accent"
              >
                查看当前状态差异
              </button>
            </div>

            {diffLoading ? (
              <div className="mt-4 text-sm text-muted-foreground">对比中…</div>
            ) : diffError ? (
              <div className="mt-4 text-sm text-red-600">{diffError}</div>
            ) : diffData ? (
              <div className="mt-4">
                <StateDiffView diff={diffData} onMerge={() => {}} />
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                还没有加载差异。建议先查看差异，再决定是否执行导入。
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
