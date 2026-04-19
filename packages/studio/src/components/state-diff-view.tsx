import { useState } from 'react';
import { FileText, CheckSquare } from 'lucide-react';

const SEVERITY_COLORS: Record<string, string> = {
  warning: 'bg-orange-100 text-orange-700',
  error: 'bg-red-100 text-red-700',
  info: 'bg-blue-100 text-blue-700',
};

interface DiffChange {
  character: string;
  field: string;
  oldValue: string;
  newValue: string;
  naturalLanguage: string;
}

interface DiffData {
  file: string;
  summary: string;
  changes: DiffChange[];
  severity: string;
}

/**
 * State diff view — side-by-side JSON vs Markdown diff with natural language translation.
 * Checkboxes to selectively merge changes.
 */
export default function StateDiffView({
  diff,
  onMerge,
}: {
  diff: DiffData;
  onMerge: (selectedIds: number[]) => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  function toggle(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(diff.changes.map((_, i) => i)));
  }

  function deselectAll() {
    setSelected(new Set());
  }

  if (diff.changes.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <FileText size={18} />
          <h3 className="text-lg font-semibold">状态差异</h3>
        </div>
        <p className="text-center text-muted-foreground py-8">无差异</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FileText size={18} />
          <h3 className="text-lg font-semibold">状态差异</h3>
        </div>
        <span className={`px-2 py-0.5 rounded text-xs ${SEVERITY_COLORS[diff.severity]}`}>
          {diff.severity}
        </span>
      </div>

      <p className="text-sm font-medium mb-4">{diff.summary}</p>

      {/* Select all / deselect all */}
      <div className="flex items-center gap-2 mb-3">
        <button onClick={selectAll} className="text-xs text-muted-foreground hover:text-foreground">
          全选
        </button>
        <span className="text-xs text-muted-foreground">|</span>
        <button
          onClick={deselectAll}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          取消全选
        </button>
      </div>

      {/* Side-by-side diff */}
      <div className="space-y-3">
        {diff.changes.map((change, i) => (
          <div
            key={i}
            className={`rounded border p-4 bg-background transition-colors ${
              selected.has(i) ? 'border-amber-400 bg-amber-50' : 'border-border'
            }`}
          >
            {/* Natural language description + checkbox */}
            <div className="flex items-start gap-3 mb-3">
              <input
                type="checkbox"
                checked={selected.has(i)}
                onChange={() => toggle(i)}
                className="mt-1"
              />
              <p className="text-sm flex-1">{change.naturalLanguage}</p>
            </div>

            {/* Side-by-side comparison: left = current/old, right = new */}
            <div className="grid grid-cols-2 gap-3 ml-6">
              <div className="rounded bg-red-50 border border-red-200 p-3">
                <div className="text-xs text-red-500 font-medium mb-1">当前</div>
                <div className="text-sm font-mono line-through text-red-600">{change.oldValue}</div>
              </div>
              <div className="rounded bg-green-50 border border-green-200 p-3">
                <div className="text-xs text-green-600 font-medium mb-1">新值</div>
                <div className="text-sm font-mono text-green-700">{change.newValue}</div>
              </div>
            </div>

            {/* Metadata */}
            <div className="flex items-center gap-2 mt-3 ml-6 text-xs text-muted-foreground">
              <span className="px-1.5 py-0.5 bg-muted rounded">{change.character}</span>
              <span>{change.field}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Merge action bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t">
          <span className="text-sm text-muted-foreground">已选择 {selected.size} 项</span>
          <button
            onClick={() => onMerge([...selected])}
            className="px-4 py-1.5 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 flex items-center gap-1"
          >
            <CheckSquare size={14} />
            合并选中
          </button>
        </div>
      )}
    </div>
  );
}
