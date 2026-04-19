import { Lightbulb, Info, AlertTriangle } from 'lucide-react';

const TYPE_CONFIG: Record<string, { bg: string; icon: typeof Info; label: string }> = {
  warning: {
    bg: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    icon: AlertTriangle,
    label: '建议',
  },
  info: { bg: 'bg-blue-50 border-blue-200 text-blue-800', icon: Info, label: '提示' },
  action: { bg: 'bg-green-50 border-green-200 text-green-800', icon: Lightbulb, label: '操作' },
};

/**
 * Suggestion bubble — soft suggestion display with float-in animation feel.
 * Replaces harsh alert flashing with gentle, colored bubbles.
 */
export default function SuggestionBubble({
  type,
  message,
}: {
  type: 'warning' | 'info' | 'action';
  message: string;
}) {
  const config = TYPE_CONFIG[type];
  const Icon = config.icon;

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-2 rounded-full border text-sm ${config.bg}`}
    >
      <Icon size={14} />
      <span className="text-xs opacity-70">{config.label}:</span>
      <span>{message}</span>
    </div>
  );
}
