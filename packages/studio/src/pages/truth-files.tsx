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
  Users,
  GitBranch,
  Layers,
  FileText,
  Search,
  Zap,
} from 'lucide-react';
import {
  fetchTruthFiles,
  fetchTruthFile,
  fetchProjectionStatus,
  updateTruthFile,
  importMarkdown,
  fetchHooks,
  fetchMemoryPreview,
} from '../lib/api';

interface TruthFileEntry {
  name: string;
  updatedAt: string;
  size: number;
}

interface TruthFileContent {
  name: string;
  content: Record<string, any>;
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

interface Hook {
  id: string;
  description: string;
  chapter: number;
  status: 'open' | 'closed' | 'dormant';
  priority: 'high' | 'medium' | 'low';
}

interface Character {
  text: string;
  confidence: number;
  sourceType?: string;
}

export default function TruthFiles() {
  const [searchParams] = useSearchParams();
  const bookId = searchParams.get('bookId') || '';
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);

  // Data
  const [files, setFiles] = useState<TruthFileEntry[]>([]);
  const [projection, setProjection] = useState<ProjectionStatus | null>(null);
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [worldState, setWorldState] = useState<Record<string, any> | null>(null);

  // Selection
  const [selectedFile, setSelectedFile] = useState<TruthFileContent | null>(null);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');

  // Import
  const [importFile, setImportFile] = useState('current_state');
  const [markdownContent, setMarkdownContent] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    if (!bookId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    Promise.all([
      fetchTruthFiles(bookId),
      fetchProjectionStatus(bookId),
      fetchHooks(bookId),
      fetchMemoryPreview(bookId),
      fetchTruthFile(bookId, 'current_state').catch(() => null),
    ])
      .then(([list, status, hooksList, memory, ws]) => {
        setFiles(list.files || []);
        setProjection(status);
        setHooks(hooksList || []);
        setCharacters(memory.memories.filter((m: any) => m.entityType === 'character') || []);
        setWorldState(ws?.content ?? null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [bookId]);

  async function openFile(fileName: string) {
    if (!bookId) return;
    try {
      const data = await fetchTruthFile(bookId, fileName);
      setSelectedFile(data);
      setEditing(false);
      setEditContent(JSON.stringify(data.content, null, 2));
    } catch (err) {
      console.error('Failed to open file:', err);
    }
  }

  async function saveFile() {
    if (!bookId || !selectedFile) return;
    try {
      const parsed = JSON.parse(editContent);
      const result = await updateTruthFile(
        bookId,
        selectedFile.name,
        JSON.stringify(parsed),
        selectedFile.versionToken
      );
      setSelectedFile(result);
      setEditing(false);
      const list = await fetchTruthFiles(bookId);
      setFiles(list.files || []);
    } catch (err) {
      alert('保存失败，请检查 JSON 格式');
    }
  }

  async function handleImport() {
    if (!bookId || !markdownContent.trim()) return;
    setImportLoading(true);
    try {
      const result = await importMarkdown(bookId, importFile, markdownContent);
      setImportResult(result);
      // Refresh
      const [list, status] = await Promise.all([
        fetchTruthFiles(bookId),
        fetchProjectionStatus(bookId),
      ]);
      setFiles(list.files || []);
      setProjection(status);
      setMarkdownContent('');
    } catch (err) {
      console.error('Import failed:', err);
    } finally {
      setImportLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
        加载真相中…
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: '概览与同步', icon: Layers },
    { id: 'json', label: '源码编辑', icon: FileJson },
    { id: 'characters', label: '角色矩阵', icon: Users },
    { id: 'subplots', label: '副线管理', icon: GitBranch },
    { id: 'conflicts', label: '冲突检查', icon: Search },
  ];

  return (
    <div className="container mx-auto py-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">真相文件 (Truth Files)</h1>
          <p className="text-muted-foreground text-sm mt-1">
            管理书籍的核心真相源，确保 AI 生成逻辑的严密性与一致性。
          </p>
        </div>
        <Link
          to={`/book/${bookId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← 返回书籍详情
        </Link>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
              {/* 当前世界状态 */}
              {worldState && (
                <div className="rounded-lg border bg-card p-4">
                  <h3 className="text-sm font-semibold mb-4">
                    当前世界状态 (current_state.json 投影)
                  </h3>
                  {worldState.characters && (
                    <div className="space-y-3 mb-4">
                      <p className="text-xs text-muted-foreground font-medium">角色:</p>
                      {Object.entries(worldState.characters).map(([name, data]: [string, any]) => (
                        <div key={name} className="rounded border bg-muted p-3">
                          <h4 className="font-medium text-sm mb-2">{name}</h4>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground">位置:</span>{' '}
                              {(data as any).location ?? '未知'}
                            </div>
                            <div>
                              <span className="text-muted-foreground">健康:</span>{' '}
                              {(data as any).health ?? '良好'}
                            </div>
                            <div>
                              <span className="text-muted-foreground">情感状态:</span>{' '}
                              {(data as any).emotion ?? '未知'}
                            </div>
                            <div>
                              <span className="text-muted-foreground">资源:</span>{' '}
                              {(data as any).inventory?.join('、') ?? '无'}
                            </div>
                          </div>
                          {(data as any).knownInfo && (data as any).knownInfo.length > 0 && (
                            <div className="mt-2 text-xs">
                              <span className="text-muted-foreground">已知信息:</span>{' '}
                              {(data as any).knownInfo.join('、')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground mb-4">
                    <div>
                      <span className="font-medium">世界时间:</span> 第{worldState.chapter ?? '-'}章
                    </div>
                    <div>
                      <span className="font-medium">物理法则:</span>{' '}
                      {worldState.physics ?? '现实世界'}
                    </div>
                    <div>
                      <span className="font-medium">力量体系:</span>{' '}
                      {worldState.powerSystem ?? '无'}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="px-3 py-1.5 text-sm border rounded hover:bg-accent">
                      编辑
                    </button>
                    <button className="px-3 py-1.5 text-sm border rounded hover:bg-accent">
                      从 JSON 查看
                    </button>
                    <button className="px-3 py-1.5 text-sm border rounded hover:bg-accent">
                      回滚到上一章状态
                    </button>
                  </div>
                </div>
              )}

              {/* Projection Card */}
              <div className="rounded-lg border bg-card p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    {projection?.synced ? (
                      <CheckCircle size={20} className="text-green-500" />
                    ) : (
                      <AlertCircle size={20} className="text-amber-500" />
                    )}
                    <h2 className="text-lg font-semibold">投影状态同步</h2>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${projection?.synced ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}
                  >
                    {projection?.synced ? '已同步' : '存在差异'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-md bg-muted/30 border">
                    <p className="text-xs text-muted-foreground mb-1">JSON 核心哈希</p>
                    <p className="text-sm font-mono truncate">{projection?.jsonHash || 'N/A'}</p>
                  </div>
                  <div className="p-3 rounded-md bg-muted/30 border">
                    <p className="text-xs text-muted-foreground mb-1">Markdown 最后更新</p>
                    <p className="text-sm">
                      {projection?.markdownMtime
                        ? new Date(projection.markdownMtime).toLocaleString()
                        : 'N/A'}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-4">
                  系统会自动维护 JSON 真相源与 Markdown 投影文件的一致性。如果手动修改了
                  Markdown，请使用下方工具重新导入。
                </p>
              </div>

              {/* Import Markdown */}
              <div className="rounded-lg border bg-card p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4 text-primary">
                  <Upload size={18} />
                  <h2 className="text-lg font-semibold">手动导入 Markdown 投影</h2>
                </div>
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground mb-1 block">目标真相源</label>
                      <select
                        value={importFile}
                        onChange={(e) => setImportFile(e.target.value)}
                        className="w-full px-3 py-2 rounded-md border bg-background text-sm"
                      >
                        {files.map((f) => (
                          <option key={f.name} value={f.name}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <textarea
                    value={markdownContent}
                    onChange={(e) => setMarkdownContent(e.target.value)}
                    placeholder="# 在此粘贴 Markdown 内容..."
                    className="w-full h-48 px-3 py-2 rounded-md border bg-background font-mono text-sm"
                  />
                  <div className="flex justify-end items-center gap-4">
                    {importResult && (
                      <div className="flex-1 text-xs text-green-600 flex items-center gap-1">
                        <CheckCircle size={14} />
                        导入成功: 更新了 {importResult.parsed.diff.length} 个条目
                      </div>
                    )}
                    <button
                      onClick={handleImport}
                      disabled={importLoading || !markdownContent.trim()}
                      className="px-6 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
                    >
                      {importLoading ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : (
                        <Upload size={14} />
                      )}
                      执行同步导入
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="md:col-span-1 space-y-6">
              <div className="rounded-lg border bg-card p-6 shadow-sm">
                <h3 className="text-sm font-semibold mb-3">同步规则说明</h3>
                <ul className="text-xs space-y-2 text-muted-foreground">
                  <li>• Markdown 是为了方便人类阅读和快速编辑的投影。</li>
                  <li>• 系统以 JSON 为最终真相源，一切逻辑审计均基于 JSON。</li>
                  <li>• 章节生成时会自动更新 Markdown 投影以反映最新世界状态。</li>
                  <li>• 若检测到冲突，系统会通过「冲突检查」标签页预警。</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'json' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1">
              <div className="rounded-lg border bg-card overflow-hidden shadow-sm">
                <div className="bg-muted/50 px-4 py-2 border-b">
                  <h2 className="text-xs font-semibold text-muted-foreground uppercase">
                    JSON 源文件
                  </h2>
                </div>
                <div className="divide-y">
                  {files.map((file) => (
                    <button
                      key={file.name}
                      onClick={() => openFile(file.name)}
                      className={`w-full text-left p-4 transition-colors ${
                        selectedFile?.name === file.name
                          ? 'bg-primary/5 border-l-2 border-primary'
                          : 'hover:bg-accent/50'
                      }`}
                    >
                      <div className="text-sm font-medium">{file.name}</div>
                      <div className="flex justify-between items-center mt-1 text-[10px] text-muted-foreground">
                        <span>{(file.size / 1024).toFixed(1)} KB</span>
                        <span>{new Date(file.updatedAt).toLocaleDateString()}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="lg:col-span-3">
              {selectedFile ? (
                <div className="rounded-lg border bg-card shadow-sm h-full flex flex-col min-h-[500px]">
                  <div className="flex items-center justify-between p-4 border-b">
                    <div className="flex items-center gap-2">
                      <FileJson size={18} className="text-primary" />
                      <h2 className="text-sm font-semibold">{selectedFile.name}</h2>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        Token: {selectedFile.versionToken}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {editing ? (
                        <>
                          <button
                            onClick={saveFile}
                            className="px-3 py-1 bg-primary text-primary-foreground rounded text-xs"
                          >
                            保存
                          </button>
                          <button
                            onClick={() => setEditing(false)}
                            className="px-3 py-1 border rounded text-xs"
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setEditing(true)}
                          className="px-3 py-1 border rounded text-xs flex items-center gap-1"
                        >
                          <Edit3 size={12} /> 编辑源码
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex-1">
                    {editing ? (
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="w-full h-full p-4 font-mono text-sm focus:outline-none bg-slate-950 text-slate-200"
                        spellCheck={false}
                      />
                    ) : (
                      <pre className="p-4 font-mono text-xs overflow-auto h-full max-h-[600px] bg-slate-950 text-slate-200">
                        {JSON.stringify(selectedFile.content, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border bg-card p-24 text-center text-muted-foreground border-dashed">
                  <FileText size={48} className="mx-auto mb-4 opacity-20" />
                  <p>请选择一个 JSON 文件进行查看或编辑</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'characters' && (
          <div className="rounded-lg border bg-card shadow-sm">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Users size={20} className="text-primary" />
                角色矩阵
              </h2>
              <div className="text-xs text-muted-foreground">
                已识别 {characters.length} 个核心实体
              </div>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {characters.length === 0 ? (
                  <div className="col-span-full py-12 text-center text-muted-foreground border border-dashed rounded">
                    尚未从真相文件中提取到角色实体
                  </div>
                ) : (
                  characters.map((char, i) => (
                    <div
                      key={i}
                      className="p-4 rounded-lg border bg-background hover:border-primary/50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="font-bold text-lg">{char.text}</div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] ${char.confidence > 0.8 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}
                        >
                          确信度 {Math.round(char.confidence * 100)}%
                        </span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">角色定位</span>
                          <span className="font-medium text-primary">核心角色</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">真相源</span>
                          <span className="font-mono">{char.sourceType || 'characters.json'}</span>
                        </div>
                        <div className="mt-4 flex gap-2">
                          <button className="flex-1 px-2 py-1 text-[10px] border rounded hover:bg-accent">
                            查看关系
                          </button>
                          <button className="flex-1 px-2 py-1 text-[10px] border rounded hover:bg-accent">
                            属性详情
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'subplots' && (
          <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <GitBranch size={20} className="text-primary" />
                副线与伏笔进度
              </h2>
              <div className="text-xs text-muted-foreground">
                活跃伏笔 {hooks.filter((h) => h.status === 'open').length} / 总数 {hooks.length}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground font-medium">
                  <tr>
                    <th className="px-6 py-3 text-left">伏笔描述</th>
                    <th className="px-6 py-3 text-left">埋设章节</th>
                    <th className="px-6 py-3 text-left">状态</th>
                    <th className="px-6 py-3 text-left">优先级</th>
                    <th className="px-6 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {hooks.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-12 text-center text-muted-foreground border-dashed"
                      >
                        暂无副线或伏笔记录
                      </td>
                    </tr>
                  ) : (
                    hooks.map((hook) => (
                      <tr key={hook.id} className="hover:bg-accent/30 transition-colors">
                        <td className="px-6 py-4 font-medium">{hook.description}</td>
                        <td className="px-6 py-4 text-muted-foreground font-mono">
                          第 {hook.chapter} 章
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] border ${
                              hook.status === 'open'
                                ? 'bg-green-50 text-green-700 border-green-200'
                                : hook.status === 'closed'
                                  ? 'bg-slate-50 text-slate-500 border-slate-200'
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            {hook.status === 'open'
                              ? '活跃'
                              : hook.status === 'closed'
                                ? '已回收'
                                : '潜伏'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`text-[10px] font-bold ${hook.priority === 'high' ? 'text-rose-500' : hook.priority === 'medium' ? 'text-amber-500' : 'text-slate-400'}`}
                          >
                            {hook.priority.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button className="text-primary hover:underline">详情</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'conflicts' && (
          <div className="rounded-lg border bg-card shadow-sm">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Search size={20} className="text-primary" />
                冲突检查与差异详情
              </h2>
            </div>
            <div className="p-6">
              {projection?.discrepancies && projection.discrepancies.length > 0 ? (
                <div className="space-y-4">
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
                    <AlertCircle className="text-amber-500 mt-1" size={18} />
                    <div>
                      <p className="text-sm font-semibold text-amber-800">检测到真相漂移</p>
                      <p className="text-xs text-amber-700 mt-1">
                        以下条目在 JSON 源与 Markdown
                        投影中存在不一致，这可能会导致后续生成的逻辑错误。建议立即同步。
                      </p>
                    </div>
                  </div>
                  <div className="divide-y border rounded-lg overflow-hidden">
                    {projection.discrepancies.map((disc, i) => (
                      <div
                        key={i}
                        className="p-3 text-xs font-mono bg-muted/20 hover:bg-muted/40 flex items-center justify-between group"
                      >
                        <span>{disc}</span>
                        <button className="opacity-0 group-hover:opacity-100 text-primary transition-opacity">
                          定位冲突
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-muted-foreground bg-green-50/20 border border-dashed rounded-lg border-green-200">
                  <CheckCircle size={32} className="mx-auto mb-3 text-green-500/50" />
                  <p>真相源一致性检查通过，未发现冲突。</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-md bg-muted/30 border">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 font-semibold">
        {label}
      </p>
      <p className="text-sm font-bold">{value}</p>
    </div>
  );
}
