import { useState, useRef, useCallback } from 'react';
import { Clock, ArrowLeft, RotateCw } from 'lucide-react';

/**
 * Time dial — rollback confirmation with drag-to-rotate dial and shatter animation.
 * User must drag the dial past a threshold to confirm the rollback.
 */
export default function TimeDial({
  open,
  snapshots,
  currentChapter,
  onConfirm,
  onClose,
}: {
  open: boolean;
  snapshots: { id: string; chapter: number; label: string; timestamp: string }[];
  currentChapter: number;
  onConfirm: (snapshotId: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [shattering, setShattering] = useState(false);
  const dialRef = useRef<HTMLDivElement>(null);
  const startAngle = useRef(0);
  const startRotation = useRef(0);

  const CONFIRM_THRESHOLD = 180; // degrees to trigger confirm

  const getAngleFromCenter = useCallback((clientX: number, clientY: number) => {
    if (!dialRef.current) return 0;
    const rect = dialRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return Math.atan2(clientY - cy, clientX - cx) * (180 / Math.PI);
  }, []);

  function handlePointerDown(e: React.PointerEvent) {
    setIsDragging(true);
    startAngle.current = getAngleFromCenter(e.clientX, e.clientY);
    startRotation.current = rotation;
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!isDragging) return;
    const currentAngle = getAngleFromCenter(e.clientX, e.clientY);
    const delta = currentAngle - startAngle.current;
    // 只接受逆时针方向（delta < 0）
    if (delta > 0) return;
    setRotation(Math.max(0, Math.min(360, startRotation.current + Math.abs(delta))));
  }

  function handlePointerUp() {
    setIsDragging(false);
    if (rotation >= CONFIRM_THRESHOLD && selected) {
      triggerShatter();
    } else {
      setRotation(0);
    }
  }

  function triggerShatter() {
    setShattering(true);
    // Shatter animation duration: 800ms
    setTimeout(() => {
      if (selected) onConfirm(selected);
      setShattering(false);
      setRotation(0);
      setSelected(null);
    }, 800);
  }

  function handleConfirmClick() {
    if (!selected) return;
    // Auto-rotate to confirm
    setRotation(CONFIRM_THRESHOLD);
    setTimeout(() => triggerShatter(), 300);
  }

  if (!open) return null;

  const progressPct = Math.min(rotation / CONFIRM_THRESHOLD, 1);
  const isConfirmReady = rotation >= CONFIRM_THRESHOLD;

  // Shatter state
  if (shattering) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
        <div className="text-center">
          <div className="relative">
            <Clock size={64} className="mx-auto text-amber-400 shatter-icon" />
            <div className="shatter-pieces">
              {Array.from({ length: 8 }, (_, i) => {
                const startAngle = i * 45;
                const endAngle = startAngle + (120 + Math.random() * 180);
                const flyDist = 60 + Math.random() * 80;
                const spin = (Math.random() > 0.5 ? 1 : -1) * (180 + Math.random() * 360);
                return (
                  <div
                    key={i}
                    className="shatter-piece"
                    style={
                      {
                        '--start-angle': `${startAngle}deg`,
                        '--end-angle': `${endAngle}deg`,
                        '--fly-distance': `${flyDist}px`,
                        '--spin': `${spin}deg`,
                        '--delay': `${i * 50}ms`,
                      } as React.CSSProperties
                    }
                  />
                );
              })}
            </div>
          </div>
          <p className="text-lg font-medium text-amber-300 mt-6">时间碎裂中…</p>
          <p className="text-sm text-muted-foreground mt-2">正在回滚至选定快照</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg border p-6 w-96 max-w-lg">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <Clock size={18} className="text-amber-500" />
          <h3 className="text-lg font-semibold">时间回溯</h3>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          当前第{currentChapter}章，选择要回滚到的快照：
        </p>

        {/* Snapshot list */}
        <div className="space-y-2 mb-4 max-h-36 overflow-y-auto">
          {snapshots.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setSelected(s.id);
                setRotation(0);
              }}
              className={`w-full text-left px-4 py-2.5 rounded border transition-colors text-sm ${
                selected === s.id ? 'border-amber-500 bg-amber-50' : 'hover:bg-accent'
              }`}
            >
              <div className="flex items-center gap-2">
                <ArrowLeft size={14} className="text-amber-500" />
                <span className="font-medium">{s.label}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {new Date(s.timestamp).toLocaleString('zh-CN')}
              </div>
            </button>
          ))}
          {snapshots.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">暂无可用快照</p>
          )}
        </div>

        {/* Dial */}
        {selected && (
          <div className="mb-4">
            <p className="text-xs text-muted-foreground mb-2 text-center">拖拽旋转拨盘以确认回滚</p>
            <div
              ref={dialRef}
              className="relative w-32 h-32 mx-auto rounded-full border-4 border-border bg-background cursor-grab active:cursor-grabbing"
              style={{ touchAction: 'none' }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              {/* Progress arc */}
              <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="46"
                  fill="none"
                  stroke={isConfirmReady ? '#f59e0b' : '#e2e8f0'}
                  strokeWidth="4"
                  strokeDasharray={`${2 * Math.PI * 46 * progressPct} ${2 * Math.PI * 46}`}
                  className="transition-all duration-75"
                />
              </svg>
              {/* Center icon */}
              <div className="absolute inset-0 flex items-center justify-center">
                <RotateCw
                  size={24}
                  className={`transition-colors ${isConfirmReady ? 'text-amber-500' : 'text-muted-foreground'}`}
                  style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 0.05s' }}
                />
              </div>
              {/* Thumb indicator */}
              <div
                className="absolute w-4 h-4 rounded-full bg-amber-500 shadow"
                style={{
                  left: '50%',
                  top: '50%',
                  transform: `translate(-50%, -50%) rotate(${rotation}deg) translateY(-46px)`,
                }}
              />
            </div>
            <p className="text-xs text-center mt-2 text-muted-foreground">
              {isConfirmReady ? (
                <span className="text-amber-600 font-medium">已解锁 — 回滚确认</span>
              ) : (
                `${Math.round(progressPct * 100)}%`
              )}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-1.5 rounded text-sm hover:bg-accent">
            取消
          </button>
          <button
            onClick={handleConfirmClick}
            disabled={!selected}
            className="px-4 py-1.5 bg-amber-500 text-white rounded text-sm hover:bg-amber-600 disabled:opacity-50"
          >
            确认回滚
          </button>
        </div>
      </div>
    </div>
  );
}
