import { useState } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle, AlertCircle, Info } from 'lucide-react';

/**
 * PRD-036b: 33 维审计明细折叠视图
 * 三级折叠列表：阻断级 > 警告级 > 建议级，阻断级优先展示
 */
interface AuditIssue {
  dimension: string;
  severity: 'blocking' | 'warning' | 'suggestion';
  message: string;
  suggestion?: string;
  location?: { paragraph?: number; sentence?: number };
}

interface AuditDetailProps {
  issues: AuditIssue[];
  dimensions?: Record<string, unknown>;
}

const SEVERITY_CONFIG = {
  blocking: {
    icon: AlertTriangle,
    label: '阻断级',
    color: 'text-red-600',
    bg: 'bg-red-50',
    borderColor: 'border-red-200',
  },
  warning: {
    icon: AlertCircle,
    label: '警告级',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    borderColor: 'border-amber-200',
  },
  suggestion: {
    icon: Info,
    label: '建议级',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    borderColor: 'border-blue-200',
  },
};

// 33 维分类映射
const DIMENSION_GROUPS: Record<string, string> = {
  // 阻断级 12 项
  情节逻辑: 'blocking',
  角色一致性: 'blocking',
  世界观一致性: 'blocking',
  事实准确性: 'blocking',
  人称视角: 'blocking',
  时间线: 'blocking',
  // 警告级 12 项
  节奏控制: 'warning',
  对话自然度: 'warning',
  描写具体性: 'warning',
  伏笔追踪: 'warning',
  情感递进: 'warning',
  场景过渡: 'warning',
  // 建议级 9 项
  语言风格: 'suggestion',
  词汇丰富度: 'suggestion',
  句式变化: 'suggestion',
  修辞手法: 'suggestion',
  段落长度: 'suggestion',
};

function getSeverityForDimension(dimension: string): 'blocking' | 'warning' | 'suggestion' {
  return (DIMENSION_GROUPS[dimension] ?? 'suggestion') as 'blocking' | 'warning' | 'suggestion';
}

export default function AuditDetail({ issues, dimensions }: AuditDetailProps) {
  if (!issues || issues.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center text-muted-foreground">
        <p>暂无审计问题</p>
      </div>
    );
  }

  // Group by severity (blocking first), then by dimension
  const grouped = issues.reduce<Record<string, Record<string, AuditIssue[]>>>((acc, issue) => {
    const severity = getSeverityForDimension(issue.dimension);
    if (!acc[severity]) acc[severity] = {};
    if (!acc[severity][issue.dimension]) acc[severity][issue.dimension] = [];
    acc[severity][issue.dimension].push(issue);
    return acc;
  }, {});

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="bg-muted px-4 py-3">
        <h3 className="text-sm font-semibold">
          审计明细
          <span className="ml-2 text-xs text-muted-foreground">
            {issues.filter((i) => getSeverityForDimension(i.dimension) === 'blocking').length} 阻断
            / {issues.filter((i) => getSeverityForDimension(i.dimension) === 'warning').length} 警告
            / {issues.filter((i) => getSeverityForDimension(i.dimension) === 'suggestion').length}{' '}
            建议
          </span>
        </h3>
      </div>

      <div className="divide-y">
        {(['blocking', 'warning', 'suggestion'] as const).map((severity) => {
          const dims = grouped[severity];
          if (!dims) return null;
          const config = SEVERITY_CONFIG[severity];
          const Icon = config.icon;

          return (
            <div key={severity} className={`${config.bg}`}>
              <div
                className={`px-4 py-2 text-xs font-semibold ${config.color} flex items-center gap-1.5`}
              >
                <Icon size={14} />
                {config.label} ({Object.values(dims).flat().length} 项)
              </div>
              {Object.entries(dims).map(([dimension, dimIssues]) => (
                <DimensionGroup
                  key={dimension}
                  dimension={dimension}
                  issues={dimIssues}
                  severity={severity}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DimensionGroup({
  dimension,
  issues,
  severity,
}: {
  dimension: string;
  issues: AuditIssue[];
  severity: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const config = SEVERITY_CONFIG[severity as keyof typeof SEVERITY_CONFIG];

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-white/50 transition-colors"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className={`font-medium ${config.color}`}>{dimension}</span>
        <span className="text-xs text-muted-foreground">({issues.length} 项)</span>
      </button>
      {expanded && (
        <div className="ml-6 pb-2 space-y-2">
          {issues.map((issue, i) => (
            <div key={i} className="rounded border px-3 py-2 bg-white text-sm">
              <p>{issue.message}</p>
              {issue.suggestion && (
                <p className="text-xs text-muted-foreground mt-1">建议：{issue.suggestion}</p>
              )}
              {issue.location && (
                <p className="text-xs text-muted-foreground mt-1">
                  位置：
                  {issue.location.paragraph !== undefined && `第 ${issue.location.paragraph} 段`}
                  {issue.location.sentence !== undefined && `，第 ${issue.location.sentence} 句`}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
