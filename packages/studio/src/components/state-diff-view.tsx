import { useState } from 'react';
import { User, Users, Package, CheckSquare } from 'lucide-react';

const SEVERITY_COLORS: Record<string, string> = {
  warning: 'bg-orange-100 text-orange-700',
  error: 'bg-red-100 text-red-700',
  info: 'bg-blue-100 text-blue-700',
};

const CATEGORY_CONFIG = {
  character: { icon: User, label: '角色状态', color: 'text-blue-600 bg-blue-50' },
  relation: { icon: Users, label: '关系变更', color: 'text-purple-600 bg-purple-50' },
  item: { icon: Package, label: '物品', color: 'text-amber-600 bg-amber-50' },
};

interface DiffChange {
  character: string;
  field: string;
  oldValue: string;
  newValue: string;
  naturalLanguage: string;
  category?: 'character' | 'relation' | 'item';
}

interface DiffData {
  file: string;
  summary: string;
  changes: DiffChange[];
  severity: string;
}

type ChangeAction = 'adopt' | 'ignore';

/**
 * State diff view — natural language translation with category grouping
 * and per-change radio buttons (PRD-090).
 */
export default function StateDiffView({
  diff,
  onMerge,
  onIgnore,
  onReRead,
}: {
  diff: DiffData;
  onMerge: (selectedIds: number[]) => void;
  onIgnore: () => void;
  onReRead: () => void;
}) {
  const [actions, setActions] = useState<Record<number, ChangeAction>>(
    Object.fromEntries(diff.changes.map((_, i) => [i, 'adopt']))
  );

  function setAction(index: number, action: ChangeAction) {
    setActions((prev) => ({ ...prev, [index]: action }));
  }

  function selectAllAdopt() {
    setActions(Object.fromEntries(diff.changes.map((_, i) => [i, 'adopt'])));
  }

  function selectAllIgnore() {
    setActions(Object.fromEntries(diff.changes.map((_, i) => [i, 'ignore'])));
  }

  const adoptedCount = Object.values(actions).filter((a) => a === 'adopt').length;
  const ignoredCount = Object.values(actions).filter((a) => a === 'ignore').length;

  // Group by category
  const grouped = diff.changes.reduce<Record<string, { indices: number[]; change: DiffChange }[]>>(
    (acc, change, i) => {
      const cat = change.category ?? 'character';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push({ indices: [i], change });
      return acc;
    },
    {}
  );

  const categoryOrder: ('character' | 'relation' | 'item')[] = ['character', 'relation', 'item'];

  if (diff.changes.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <CheckSquare size={18} />
          <h3 className="text-lg font-semibold">状态差异</h3>
        </div>
        <p className="text-center text-muted-foreground py-8">无差异</p>
      </div>
    );
  }

  function getActionLabel(change: DiffChange, action: ChangeAction) {
    if (change.category === 'item') {
      return action === 'adopt' ? '添加物品' : '保持原样';
    }
    if (change.category === 'relation') {
      return action === 'adopt' ? '更新关系' : '保持原样';
    }
    return action === 'adopt' ? '同步更新' : '保持原样';
  }

  return (
    <div className="rounded-lg border bg-card p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CheckSquare size={18} />
          <h3 className="text-lg font-semibold">检测到您在小说文本中修改了设定</h3>
        </div>
        <span className={`px-2 py-0.5 rounded text-xs ${SEVERITY_COLORS[diff.severity]}`}>
          {diff.severity}
        </span>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        系统从您编辑的小说文本中提取到 {diff.changes.length} 处设定变更：
      </p>

      {/* Bulk actions */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={selectAllAdopt}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          全部同步更新
        </button>
        <span className="text-xs text-muted-foreground">|</span>
        <button
          onClick={selectAllIgnore}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          全部保持原样
        </button>
      </div>

      {/* Grouped by category */}
      <div className="space-y-6">
        {categoryOrder
          .filter((cat) => grouped[cat])
          .map((cat) => {
            const Config = CATEGORY_CONFIG[cat];
            const Icon = Config.icon;
            const items = grouped[cat];
            if (!items) return null;

            return (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${Config.color}`}
                  >
                    <Icon size={12} />
                    {Config.label}
                  </span>
                </div>
                <div className="space-y-3 ml-1">
                  {items.map(({ change }) => {
                    const idx = diff.changes.indexOf(change);
                    const action = actions[idx];

                    return (
                      <div
                        key={idx}
                        className={`rounded border p-4 bg-background transition-colors ${
                          action === 'adopt' ? 'border-amber-400 bg-amber-50/30' : 'border-border'
                        }`}
                      >
                        {/* Natural language description */}
                        <p className="text-sm mb-3">{change.naturalLanguage}</p>

                        {/* Side-by-side comparison */}
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div className="rounded bg-red-50 border border-red-200 p-2">
                            <div className="text-[10px] text-red-500 font-medium">当前记忆</div>
                            <div className="text-xs font-mono text-red-600">{change.oldValue}</div>
                          </div>
                          <div className="rounded bg-green-50 border border-green-200 p-2">
                            <div className="text-[10px] text-green-600 font-medium">文本中提取</div>
                            <div className="text-xs font-mono text-green-700">
                              {change.newValue}
                            </div>
                          </div>
                        </div>

                        {/* Radio buttons */}
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                            <input
                              type="radio"
                              name={`change-${idx}`}
                              checked={action === 'adopt'}
                              onChange={() => setAction(idx, 'adopt')}
                              className="accent-amber-500"
                            />
                            <span className="text-sm">{getActionLabel(change, 'adopt')}</span>
                          </label>
                          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                            <input
                              type="radio"
                              name={`change-${idx}`}
                              checked={action === 'ignore'}
                              onChange={() => setAction(idx, 'ignore')}
                              className="accent-muted-foreground"
                            />
                            <span className="text-sm">{getActionLabel(change, 'ignore')}</span>
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
      </div>

      {/* Summary + action buttons */}
      <div className="mt-6 pt-4 border-t flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          汇总: 将采纳 {adoptedCount} 项变更，忽略 {ignoredCount} 项变更
        </span>
        <div className="flex items-center gap-2">
          <button onClick={onReRead} className="px-3 py-1.5 border rounded text-sm hover:bg-accent">
            重新阅读文本
          </button>
          <button onClick={onIgnore} className="px-3 py-1.5 border rounded text-sm hover:bg-accent">
            全部忽略
          </button>
          <button
            onClick={() => {
              const selected = Object.entries(actions)
                .filter(([, a]) => a === 'adopt')
                .map(([i]) => Number(i));
              onMerge(selected);
            }}
            className="px-4 py-1.5 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 flex items-center gap-1"
          >
            <CheckSquare size={14} />
            确认同步
          </button>
        </div>
      </div>
    </div>
  );
}
