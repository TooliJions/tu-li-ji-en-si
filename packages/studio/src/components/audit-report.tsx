import { useState } from 'react';
import { ChevronDown, ChevronRight, CheckCircle, AlertCircle, XCircle } from 'lucide-react';

interface AuditCheck {
  name: string;
  passed: boolean;
  score: number;
  message?: string;
}

interface AuditCategory {
  name: string;
  severity: 'blocking' | 'warning' | 'suggestion';
  checks: AuditCheck[];
}

interface AuditReportData {
  overallScore: number;
  totalChecks: number;
  passed: number;
  warnings: number;
  blocked: number;
  categories: AuditCategory[];
}

const SEVERITY_COLORS: Record<string, string> = {
  blocking: 'bg-red-100 text-red-700 border-red-200',
  warning: 'bg-orange-100 text-orange-700 border-orange-200',
  suggestion: 'bg-blue-100 text-blue-700 border-blue-200',
};

/**
 * Audit report — 33-dimension audit with collapsible categories.
 */
export default function AuditReport({ report }: { report: AuditReportData }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(name: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <div className="rounded-lg border bg-card p-6">
      {/* Summary */}
      <div className="flex items-center gap-6 mb-4">
        <div className="text-center">
          <div className="text-3xl font-bold">{report.overallScore}</div>
          <div className="text-xs text-muted-foreground">综合评分</div>
        </div>
        <div className="text-sm text-muted-foreground space-y-1">
          <div>
            总计: <span className="font-medium">{report.totalChecks}</span> 项
          </div>
          <div>
            通过: <span className="text-green-600">{report.passed}</span>
          </div>
          <div>
            警告: <span className="text-orange-600">{report.warnings}</span>
          </div>
          <div>
            阻断: <span className="text-red-600">{report.blocked}</span>
          </div>
        </div>
      </div>

      {/* Categories */}
      <div className="space-y-2">
        {report.categories.map((cat) => (
          <div key={cat.name} className="rounded border overflow-hidden">
            <button
              onClick={() => toggle(cat.name)}
              className={`w-full flex items-center justify-between px-4 py-3 text-left ${SEVERITY_COLORS[cat.severity]}`}
            >
              <div className="flex items-center gap-2">
                {expanded.has(cat.name) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span className="font-medium">{cat.name}</span>
                <span className="text-xs opacity-70">({cat.checks.length}项)</span>
              </div>
            </button>
            {expanded.has(cat.name) && (
              <div className="divide-y bg-background">
                {cat.checks.map((check) => (
                  <div key={check.name} className="px-4 py-2 flex items-start gap-2">
                    {check.passed ? (
                      <CheckCircle size={14} className="text-green-500 mt-0.5 shrink-0" />
                    ) : (
                      <XCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">{check.name}</span>
                        <span className="text-xs text-muted-foreground">{check.score}%</span>
                      </div>
                      {check.message && (
                        <div className="flex items-center gap-1 text-xs text-red-600 mt-1">
                          <AlertCircle size={12} />
                          {check.message}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
