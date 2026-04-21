import { useState, useEffect, useRef } from 'react';
import { Terminal, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  module?: string;
}

interface LogPanelProps {
  logs: LogEntry[];
  onClear: () => void;
  className?: string;
}

export default function LogPanel({ logs, onClear, className = '' }: LogPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isExpanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isExpanded]);

  const levelColors = {
    info: 'text-sky-400',
    warn: 'text-amber-400',
    error: 'text-rose-500',
    success: 'text-emerald-400',
  };

  return (
    <div
      className={`rounded-lg border bg-slate-950 text-slate-200 overflow-hidden flex flex-col ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-slate-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            流水线日志
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onClear}
            className="p-1 hover:bg-slate-800 rounded text-slate-400 transition-colors"
            title="清空日志"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-slate-800 rounded text-slate-400 transition-colors"
          >
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div
          ref={scrollRef}
          className="h-48 overflow-y-auto p-4 font-mono text-xs space-y-1.5 scrollbar-thin scrollbar-thumb-slate-800"
        >
          {logs.length === 0 ? (
            <div className="text-slate-600 italic">暂无日志内容</div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="flex gap-3 animate-in fade-in slide-in-from-left-2 duration-300"
              >
                <span className="text-slate-500 shrink-0">[{log.timestamp}]</span>
                {log.module && (
                  <span className="text-slate-400 shrink-0 font-bold">[{log.module}]</span>
                )}
                <span className={levelColors[log.level]}>{log.message}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
