import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookOpen, Upload, FileText, CheckCircle, AlertCircle, Sparkles } from 'lucide-react';
import { initFanfic, fetchBook } from '../lib/api';

const MODES = [
  {
    id: 'canon',
    label: 'Canon',
    title: '遵循正典',
    description: '遵循原作的世界观、角色设定和时间线，在原作框架内创作。',
    color: 'border-blue-500',
    bg: 'bg-blue-50',
  },
  {
    id: 'au',
    label: 'AU',
    title: '替代宇宙',
    description: '将角色置于全新的世界观中（如现代AU、奇幻AU等），保留角色核心特质。',
    color: 'border-purple-500',
    bg: 'bg-purple-50',
  },
  {
    id: 'ooc',
    label: 'OOC',
    title: '角色性格偏离',
    description: '允许角色性格发生显著偏离，探索"如果TA不是这样"的可能性。',
    color: 'border-orange-500',
    bg: 'bg-orange-50',
  },
  {
    id: 'cp',
    label: 'CP',
    title: '配对驱动',
    description: '以角色关系和配对为核心，围绕情感线展开故事。',
    color: 'border-pink-500',
    bg: 'bg-pink-50',
  },
];

export default function FanficInit() {
  const [searchParams] = useSearchParams();
  const bookId = searchParams.get('bookId') || '';
  const [loading, setLoading] = useState(true);
  const [bookTitle, setBookTitle] = useState('同人书籍');
  const [selectedMode, setSelectedMode] = useState('');
  const [description, setDescription] = useState('');
  const [canonFile, setCanonFile] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchBook(bookId)
      .then((book) => setBookTitle(book.title))
      .catch(() => {
        // load failed
      })
      .finally(() => setLoading(false));
  }, [bookId]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setCanonFile(file.name);
    }
  }

  async function handleInit() {
    if (!selectedMode) {
      setError('请选择同人模式');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await initFanfic(bookId, {
        mode: selectedMode,
        description,
        canonReference: canonFile,
      });
      setSuccess(true);
    } catch {
      setError('初始化失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">加载中…</div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Sparkles size={24} className="text-amber-500" />
        <div>
          <h1 className="text-2xl font-bold">同人模式初始化</h1>
          <p className="text-sm text-muted-foreground">{bookTitle}</p>
        </div>
      </div>

      {success ? (
        <div className="rounded-lg border bg-green-50 p-6 text-center">
          <CheckCircle size={32} className="mx-auto mb-3 text-green-500" />
          <h2 className="text-lg font-semibold text-green-700">同人模式初始化成功</h2>
          <p className="text-sm text-green-600 mt-2">
            已设置为 {MODES.find((m) => m.id === selectedMode)?.label} 模式
          </p>
        </div>
      ) : (
        <>
          {/* Mode Selection */}
          <div className="rounded-lg border bg-card p-6">
            <h2 className="text-lg font-semibold mb-4">选择同人模式</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {MODES.map((mode) => (
                <button
                  key={mode.id}
                  title={`${mode.label}模式`}
                  onClick={() => setSelectedMode(mode.id)}
                  className={`text-left rounded-lg border-2 p-4 transition-colors ${
                    selectedMode === mode.id
                      ? `${mode.color} ${mode.bg}`
                      : 'border-border hover:border-accent'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-bold">{mode.label}</span>
                    <span className="text-sm font-medium">{mode.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{mode.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="rounded-lg border bg-card p-6">
            <h2 className="text-lg font-semibold mb-4">设定描述</h2>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="同人设定描述"
              rows={4}
              className="w-full px-3 py-2 rounded border bg-background text-sm resize-none"
            />
          </div>

          {/* Canon Reference Upload (Canon mode only) */}
          {selectedMode === 'canon' && (
            <div className="rounded-lg border bg-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <FileText size={18} />
                <h2 className="text-lg font-semibold">上传正典参考</h2>
              </div>
              <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded cursor-pointer hover:bg-accent/50 transition-colors">
                <Upload size={20} className="text-muted-foreground mb-1" />
                <span className="text-xs text-muted-foreground">
                  {canonFile || '点击或拖拽上传 Markdown 文件'}
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".md,.markdown,.txt"
                  onChange={handleFileChange}
                  className="hidden"
                  aria-label="上传正典参考文件"
                />
              </label>
              {canonFile && (
                <div className="mt-2 text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle size={12} />
                  已选择: {canonFile}
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded px-3 py-2">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleInit}
            disabled={submitting}
            className="w-full px-4 py-3 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <BookOpen size={16} />
            {submitting ? '初始化中…' : '初始化'}
          </button>
        </>
      )}
    </div>
  );
}
