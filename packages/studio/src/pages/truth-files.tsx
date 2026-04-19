import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  FileJson,
  Save,
  X,
  Edit3,
  Upload,
  RefreshCw,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import {
  fetchTruthFiles,
  fetchTruthFile,
  fetchProjectionStatus,
  updateTruthFile,
  importMarkdown,
} from '../lib/api';

interface TruthFileEntry {
  name: string;
  updatedAt: string;
  size: number;
}

interface TruthFileContent {
  name: string;
  content: Record<string, unknown>;
  versionToken: number;
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

export default function TruthFiles() {
  const [searchParams] = useSearchParams();
  const bookId = searchParams.get('bookId') || '';
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<TruthFileEntry[]>([]);
  const [versionToken, setVersionToken] = useState(0);
  const [projection, setProjection] = useState<ProjectionStatus | null>(null);

  const [selectedFile, setSelectedFile] = useState<TruthFileContent | null>(null);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');

  const [importFile, setImportFile] = useState('current_state');
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    Promise.all([fetchTruthFiles(), fetchProjectionStatus()])
      .then(([list, status]) => {
        setFiles(list.files || []);
        setVersionToken(list.versionToken || 0);
        setProjection(status);
      })
      .catch(() => {
        // load failed
      })
      .finally(() => setLoading(false));
  }, [bookId]);

  async function openFile(fileName: string) {
    try {
      const data = await fetchTruthFile(fileName);
      setSelectedFile(data);
      setEditing(false);
      setEditContent(JSON.stringify(data.content, null, 2));
      setImportResult(null);
    } catch {
      // fetch failed
    }
  }

  async function saveFile() {
    if (!selectedFile) return;
    try {
      const parsed = JSON.parse(editContent);
      const result = await updateTruthFile(
        selectedFile.name,
        JSON.stringify(parsed),
        selectedFile.versionToken
      );
      setSelectedFile(result);
      setEditContent(JSON.stringify(result.content, null, 2));
      setEditing(false);
      // Refresh file list
      const list = await fetchTruthFiles();
      setFiles(list.files || []);
      setVersionToken(list.versionToken || 0);
    } catch {
      // save failed
    }
  }

  async function handleImport() {
    setImportLoading(true);
    try {
      const result = await importMarkdown(importFile);
      setImportResult(result);
      // Refresh file list after import
      const list = await fetchTruthFiles();
      setFiles(list.files || []);
      setVersionToken(list.versionToken || 0);
    } catch {
      // import failed
    } finally {
      setImportLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">加载中…</div>
    );
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes <= 1024) return `${bytes.toLocaleString()} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString('zh-CN');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">真相文件</h1>
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← 返回仪表盘
        </Link>
      </div>

      {/* Projection Status */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          {projection?.synced ? (
            <CheckCircle size={18} className="text-green-500" />
          ) : (
            <AlertCircle size={18} className="text-red-500" />
          )}
          <h2 className="text-lg font-semibold">投影状态</h2>
        </div>
        {projection && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <InfoCard label="状态" value={projection.synced ? '已同步' : '未同步'} />
            <InfoCard label="JSON 哈希" value={projection.jsonHash || '—'} />
            <InfoCard
              label="Markdown 时间"
              value={projection.markdownMtime ? formatDate(projection.markdownMtime) : '—'}
            />
            <InfoCard label="差异数" value={(projection.discrepancies?.length || 0).toString()} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* File List */}
        <div className="lg:col-span-1">
          <div className="rounded-lg border bg-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <FileJson size={18} />
              <h2 className="text-lg font-semibold">文件列表</h2>
            </div>
            <div className="space-y-1">
              {files.map((file) => (
                <button
                  key={file.name}
                  onClick={() => openFile(file.name)}
                  className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                    selectedFile?.name === file.name
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent/50'
                  }`}
                >
                  <div className="font-medium">{file.name}</div>
                  <div className="text-xs text-muted-foreground flex justify-between">
                    <span>{formatSize(file.size)}</span>
                    <span>{formatDate(file.updatedAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* File Viewer */}
        <div className="lg:col-span-2">
          {selectedFile ? (
            <div className="rounded-lg border bg-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">{selectedFile.name}</h2>
                <div className="flex gap-2">
                  {!editing && (
                    <button
                      onClick={() => {
                        setEditContent(JSON.stringify(selectedFile.content, null, 2));
                        setEditing(true);
                      }}
                      title="编辑"
                      className="p-1.5 rounded hover:bg-accent transition-colors"
                    >
                      <Edit3 size={16} />
                    </button>
                  )}
                  {editing && (
                    <>
                      <button
                        onClick={saveFile}
                        title="保存"
                        className="p-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        <Save size={16} />
                      </button>
                      <button
                        onClick={() => {
                          setEditing(false);
                          setEditContent(JSON.stringify(selectedFile.content, null, 2));
                        }}
                        title="取消"
                        className="p-1.5 rounded hover:bg-accent transition-colors"
                      >
                        <X size={16} />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setSelectedFile(null)}
                    title="关闭"
                    className="p-1.5 rounded hover:bg-accent transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
              {editing ? (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full h-96 font-mono text-sm p-4 rounded border bg-background resize-none"
                />
              ) : (
                <pre className="text-sm p-4 rounded border bg-background overflow-auto max-h-96 font-mono">
                  {JSON.stringify(selectedFile.content, null, 2)}
                </pre>
              )}
              {/* Content Keys */}
              {!editing && selectedFile.content && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {Object.keys(selectedFile.content).map((key) => (
                    <span
                      key={key}
                      className="px-2 py-1 rounded bg-secondary text-secondary-foreground text-xs"
                    >
                      {key}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
              <FileJson size={32} className="mx-auto mb-3 opacity-40" />
              <p>选择一个文件查看内容</p>
            </div>
          )}
        </div>
      </div>

      {/* Import Markdown */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Upload size={18} />
          <h2 className="text-lg font-semibold">导入 Markdown</h2>
        </div>
        <div className="flex items-center gap-4">
          <select
            value={importFile}
            onChange={(e) => setImportFile(e.target.value)}
            className="px-3 py-2 rounded border bg-background text-sm"
          >
            {files.map((f) => (
              <option key={f.name} value={f.name}>
                {f.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleImport}
            disabled={importLoading}
            className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {importLoading ? '导入中…' : '导入'}
          </button>
          {importLoading && <RefreshCw size={16} className="animate-spin" />}
        </div>
        {importResult && (
          <div className="mt-4 p-4 rounded border bg-secondary/50">
            <p className="text-sm font-medium">导入结果</p>
            <p className="text-sm text-muted-foreground mt-1">{importResult.preview}</p>
            {importResult.parsed.diff.length > 0 && (
              <ul className="mt-2 text-xs text-muted-foreground">
                {importResult.parsed.diff.map((d, i) => (
                  <li key={i}>• {d}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-lg font-bold mt-1">{value}</p>
    </div>
  );
}
