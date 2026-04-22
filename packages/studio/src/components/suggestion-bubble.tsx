import { Lightbulb, Info, AlertTriangle, ArrowRight } from 'lucide-react';

const TYPE_CONFIG: Record<
  string,
  { bg: string; border: string; icon: typeof Info; label: string }
> = {
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: AlertTriangle,
    label: '建议',
  },
  info: { bg: 'bg-blue-50', border: 'border-blue-200', icon: Info, label: '提示' },
  action: { bg: 'bg-green-50', border: 'border-green-200', icon: Lightbulb, label: '操作' },
};

/**
 * Suggestion bubble — PRD-083b quality drift suggestion with float-in styling.
 * Supports simple message or rich content with reasons and action slots.
 */
export default function SuggestionBubble({
  type = 'warning',
  title,
  message,
  reasons,
  actions,
}: {
  type?: 'warning' | 'info' | 'action';
  title?: string;
  message: string;
  reasons?: string[];
  actions?: React.ReactNode;
}) {
  const config = TYPE_CONFIG[type];
  const Icon = config.icon;

  return (
    <div className={`rounded-lg ${config.bg} ${config.border} border p-4 relative mt-6`}>
      {/* Arrow pointer */}
      <div
        className={`absolute -top-2 left-8 w-4 h-4 ${config.bg} border-l border-t ${config.border} transform rotate-45`}
      />
      <div className="flex items-start gap-2 mb-2">
        <Icon size={16} className="text-amber-700 shrink-0 mt-0.5" />
        <p className="text-sm font-medium text-amber-800">{title || config.label}</p>
      </div>
      <p className="text-sm text-amber-700 mb-2">{message}</p>
      {reasons && reasons.length > 0 && (
        <ul className="text-sm text-amber-700 space-y-1 mb-3">
          {reasons.map((r, i) => (
            <li key={i} className="flex items-start gap-1">
              <ArrowRight size={12} className="mt-1 shrink-0 opacity-60" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}
      {actions && <div className="flex flex-wrap gap-2 mt-3">{actions}</div>}
    </div>
  );
}
