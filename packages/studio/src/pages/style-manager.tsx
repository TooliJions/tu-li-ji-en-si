import { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Upload, FileText, Zap, Eye, Settings, CheckCircle } from 'lucide-react';
import { extractStyleFingerprint, applyStyleImitation, fetchBook } from '../lib/api';

interface StyleFingerprint {
  avgSentenceLength: number;
  dialogueRatio: number;
  descriptionRatio: number;
  actionRatio: number;
  commonPhrases: string[];
  sentencePatternPreference: string;
  wordUsageHabit: string;
  rhetoricTendency: string;
}

const GENRES = ['仙侠', '玄幻', '都市', '科幻', '历史', '游戏', '悬疑', '言情', '同人'];

export default function StyleManager() {
  const [searchParams] = useSearchParams();
  const bookId = searchParams.get('bookId') || '';
  const [loading, setLoading] = useState(true);
  const [bookTitle, setBookTitle] = useState('书籍');
  const [genre, setGenre] = useState('');
  const [referenceText, setReferenceText] = useState('');
  const [fileName, setFileName] = useState('');
  const [fingerprint, setFingerprint] = useState<StyleFingerprint | null>(null);
  const [intensity, setIntensity] = useState(50);
  const [extracting, setExtracting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!bookId) {
      setLoading(false);
      return;
    }
    fetchBook(bookId)
      .then((book) => {
        setBookTitle(book.title);
        setGenre(book.genre || '');
      })
      .catch(() => {
        // load failed
      })
      .finally(() => setLoading(false));
  }, [bookId]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (ev) => {
        setReferenceText(ev.target?.result as string);
      };
      reader.readAsText(file);
    }
  }

  async function handleExtract() {
    if (!referenceText.trim()) return;
    setExtracting(true);
    setFingerprint(null);
    try {
      const result = await extractStyleFingerprint(bookId, {
        referenceText,
        genre,
      });
      setFingerprint(result.fingerprint);
    } catch {
      // extraction failed
    } finally {
      setExtracting(false);
    }
  }

  async function handleApply() {
    if (!fingerprint) return;
    setApplying(true);
    try {
      await applyStyleImitation(bookId, {
        fingerprint,
        intensity: Number(intensity),
      });
      setSuccess(true);
    } catch {
      // application failed
    } finally {
      setApplying(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">加载中…</div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">文风仿写配置</h1>
          <p className="text-sm text-muted-foreground">{bookTitle}</p>
        </div>
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← 返回仪表盘
        </Link>
      </div>

      {success ? (
        <div className="rounded-lg border bg-green-50 p-6 text-center">
          <CheckCircle size={32} className="mx-auto mb-3 text-green-500" />
          <h2 className="text-lg font-semibold text-green-700">文风配置已应用</h2>
          <p className="text-sm text-green-600 mt-2">强度: {intensity}%</p>
        </div>
      ) : (
        <>
          {/* Upload */}
          <div className="rounded-lg border bg-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Upload size={18} />
              <h2 className="text-lg font-semibold">上传参考作品</h2>
            </div>

            <div className="space-y-4">
              {/* File upload */}
              <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed rounded cursor-pointer hover:bg-accent/50 transition-colors">
                <FileText size={18} className="text-muted-foreground mb-1" />
                <span className="text-xs text-muted-foreground">
                  {fileName || '点击上传参考文件'}
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.markdown"
                  onChange={handleFileChange}
                  className="hidden"
                  aria-label="上传参考文件"
                />
              </label>

              {/* Genre selector */}
              <div>
                <label className="text-xs text-muted-foreground block mb-1">题材</label>
                <select
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  aria-label="题材"
                  className="w-full px-3 py-2 rounded border bg-background text-sm"
                >
                  <option value="">选择题材</option>
                  {GENRES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>

              {/* Text area */}
              <textarea
                value={referenceText}
                onChange={(e) => setReferenceText(e.target.value)}
                placeholder="或粘贴参考文本"
                rows={8}
                className="w-full px-3 py-2 rounded border bg-background text-sm resize-none font-mono"
              />

              {/* Extract button */}
              <button
                onClick={handleExtract}
                disabled={!referenceText.trim() || extracting}
                className="w-full px-4 py-2.5 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Zap size={16} />
                {extracting ? '提取中…' : '提取指纹'}
              </button>
            </div>
          </div>

          {/* Fingerprint Result */}
          {fingerprint && (
            <>
              <div className="rounded-lg border bg-card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Settings size={18} />
                  <h2 className="text-lg font-semibold">风格指纹</h2>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <InfoCard label="平均句长" value={`${fingerprint.avgSentenceLength} 字`} />
                  <InfoCard
                    label="对话占比"
                    value={`${Math.round(fingerprint.dialogueRatio * 100)}%`}
                  />
                  <InfoCard
                    label="描写占比"
                    value={`${Math.round(fingerprint.descriptionRatio * 100)}%`}
                  />
                  <InfoCard
                    label="动作占比"
                    value={`${Math.round(fingerprint.actionRatio * 100)}%`}
                  />
                </div>

                <div className="text-xs text-muted-foreground space-y-2">
                  <p>
                    <span className="font-medium">句式偏好：</span>
                    {fingerprint.sentencePatternPreference || '—'}
                  </p>
                  <p>
                    <span className="font-medium">用词习惯：</span>
                    {fingerprint.wordUsageHabit || '—'}
                  </p>
                  <p>
                    <span className="font-medium">修辞倾向：</span>
                    {fingerprint.rhetoricTendency || '—'}
                  </p>
                </div>

                {fingerprint.commonPhrases.length > 0 && (
                  <div className="mt-3">
                    <span className="text-xs font-medium text-muted-foreground">高频词汇：</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {fingerprint.commonPhrases.map((p) => (
                        <span key={p} className="px-2 py-0.5 rounded text-xs bg-secondary">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Intensity Slider */}
              <div className="rounded-lg border bg-card p-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold">仿写强度</h2>
                  <span className="text-sm font-mono">{intensity}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={intensity}
                  onChange={(e) => setIntensity(Number(e.target.value))}
                  aria-label="仿写强度"
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>低</span>
                  <span>高</span>
                </div>
              </div>

              {/* JSON Preview */}
              <div className="rounded-lg border bg-card p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Eye size={18} />
                  <h2 className="text-lg font-semibold">JSON 预览</h2>
                </div>
                <pre className="text-xs bg-background rounded p-3 overflow-auto max-h-48 font-mono">
                  {JSON.stringify(fingerprint, null, 2)}
                </pre>
              </div>

              {/* Apply */}
              <button
                onClick={handleApply}
                disabled={applying}
                className="w-full px-4 py-3 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <CheckCircle size={16} />
                {applying ? '应用中…' : '应用配置'}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
