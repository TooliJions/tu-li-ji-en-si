import { useEffect, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';

const WORLD_RULE_CATEGORY_OPTIONS = [
  { value: 'magic-system', label: '力量体系' },
  { value: 'society', label: '社会秩序' },
  { value: 'technology', label: '技术约束' },
  { value: 'geography', label: '地理规则' },
  { value: 'custom', label: '自定义规则' },
] as const;

function normalizeCategory(category: string | undefined) {
  const normalized = category?.trim() ?? '';
  return WORLD_RULE_CATEGORY_OPTIONS.some((option) => option.value === normalized)
    ? normalized
    : 'custom';
}

export interface EditableWorldRule {
  id: string;
  category: string;
  rule: string;
  exceptions: string[];
  sourceChapter?: number;
}

interface WorldRulesEditorProps {
  rules: Array<EditableWorldRule | string | Record<string, unknown>>;
  onSave: (rules: EditableWorldRule[]) => void;
  saving?: boolean;
}

interface DraftWorldRule {
  id: string;
  category: string;
  rule: string;
  exceptions: string;
  sourceChapter?: number;
}

function createRuleId() {
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toDraft(
  rule: EditableWorldRule | string | Record<string, unknown>,
  index: number
): DraftWorldRule {
  if (typeof rule === 'string') {
    return {
      id: `legacy-rule-${index}`,
      category: 'custom',
      rule,
      exceptions: '',
    };
  }

  const record = rule as Partial<EditableWorldRule>;
  return {
    id: record.id ?? `legacy-rule-${index}`,
    category: normalizeCategory(record.category),
    rule: record.rule ?? '',
    exceptions: Array.isArray(record.exceptions) ? record.exceptions.join('、') : '',
    ...(record.sourceChapter ? { sourceChapter: record.sourceChapter } : {}),
  };
}

function toEditable(rule: DraftWorldRule): EditableWorldRule | null {
  const normalizedRule = rule.rule.trim();
  if (!normalizedRule) {
    return null;
  }

  return {
    id: rule.id,
    category: normalizeCategory(rule.category),
    rule: normalizedRule,
    exceptions: rule.exceptions
      .split(/[、,，]/)
      .map((item) => item.trim())
      .filter(Boolean),
    ...(rule.sourceChapter ? { sourceChapter: rule.sourceChapter } : {}),
  };
}

export default function WorldRulesEditor({ rules, onSave, saving = false }: WorldRulesEditorProps) {
  const [draftRules, setDraftRules] = useState<DraftWorldRule[]>(rules.map(toDraft));

  useEffect(() => {
    setDraftRules(rules.map(toDraft));
  }, [rules]);

  function updateRule(id: string, patch: Partial<DraftWorldRule>) {
    setDraftRules((prev) => prev.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
  }

  function addRule() {
    setDraftRules((prev) => [
      ...prev,
      {
        id: createRuleId(),
        category: 'custom',
        rule: '',
        exceptions: '',
      },
    ]);
  }

  function removeRule(id: string) {
    setDraftRules((prev) => prev.filter((rule) => rule.id !== id));
  }

  function handleSave() {
    onSave(draftRules.map(toEditable).filter((rule): rule is EditableWorldRule => Boolean(rule)));
  }

  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">世界规则编辑器</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            维护不可违反的硬性约束，并同步到规则栈与当前状态投影。
          </p>
        </div>
        <button
          onClick={addRule}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent"
        >
          <Plus size={14} />
          新增规则
        </button>
      </div>

      <div className="mt-4 space-y-4">
        {draftRules.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            暂无世界规则。新增后可进入规则栈参与上下文治理。
          </div>
        ) : (
          draftRules.map((rule) => (
            <div key={rule.id} className="rounded-lg border bg-background p-4">
              <div className="mb-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>规则 ID：{rule.id}</span>
                <span>
                  {rule.sourceChapter
                    ? `来源章节：第 ${rule.sourceChapter} 章`
                    : '来源章节：未标注'}
                </span>
              </div>
              <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)_120px]">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-muted-foreground">规则分类</span>
                  <select
                    aria-label="规则分类"
                    value={rule.category}
                    onChange={(event) => updateRule(rule.id, { category: event.target.value })}
                    className="w-full rounded-md border bg-background px-3 py-2"
                  >
                    {WORLD_RULE_CATEGORY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-muted-foreground">规则内容</span>
                  <input
                    aria-label="规则内容"
                    value={rule.rule}
                    onChange={(event) => updateRule(rule.id, { rule: event.target.value })}
                    className="w-full rounded-md border bg-background px-3 py-2"
                  />
                </label>

                <div className="flex items-end">
                  <button
                    onClick={() => removeRule(rule.id)}
                    className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 size={14} />
                    删除规则
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-muted-foreground">例外条件</span>
                  <input
                    aria-label="例外条件"
                    value={rule.exceptions}
                    onChange={(event) => updateRule(rule.id, { exceptions: event.target.value })}
                    className="w-full rounded-md border bg-background px-3 py-2"
                    placeholder="多个例外可用 、 或 , 分隔"
                  />
                </label>

                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-muted-foreground">来源章节</span>
                  <input
                    aria-label="来源章节"
                    type="number"
                    min={1}
                    value={rule.sourceChapter ?? ''}
                    onChange={(event) =>
                      updateRule(rule.id, {
                        sourceChapter: event.target.value
                          ? Number.parseInt(event.target.value, 10)
                          : undefined,
                      })
                    }
                    className="w-full rounded-md border bg-background px-3 py-2"
                    placeholder="可选"
                  />
                </label>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Save size={14} />
          {saving ? '保存中…' : '保存世界规则'}
        </button>
      </div>
    </div>
  );
}
