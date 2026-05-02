import { Terminal } from 'lucide-react';
import LogStream from './log-stream';

export default function LogViewer({
  bookId,
  logFilter,
  onLogFilterChange,
}: {
  bookId: string;
  logFilter: 'all' | 'info' | 'warn' | 'error';
  onLogFilterChange: (value: 'all' | 'info' | 'warn' | 'error') => void;
}) {
  return (
    <div className="rounded-lg border bg-card shadow-sm">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Terminal size={18} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wider">运行日志</h2>
        </div>
        <select
          value={logFilter}
          onChange={(e) => onLogFilterChange(e.target.value as 'all' | 'info' | 'warn' | 'error')}
          className="px-2 py-1 rounded border bg-background text-xs"
        >
          <option value="all">全部级别</option>
          <option value="info">INFO</option>
          <option value="warn">WARN</option>
          <option value="error">ERROR</option>
        </select>
      </div>
      <LogStream bookId={bookId} levelFilter={logFilter} />
    </div>
  );
}
