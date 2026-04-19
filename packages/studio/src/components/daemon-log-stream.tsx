import { useState, useEffect, useRef, useCallback } from 'react';

export interface DaemonLogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  chapter?: number;
  raw?: Record<string, unknown>;
}

interface DaemonLogStreamProps {
  bookId: string;
  levelFilter: 'all' | 'info' | 'warn' | 'error';
}

export default function DaemonLogStream({ bookId, levelFilter }: DaemonLogStreamProps) {
  const [logs, setLogs] = useState<DaemonLogEntry[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  const parseEvent = useCallback((data: unknown): DaemonLogEntry | null => {
    const event = data as Record<string, unknown>;
    const timestamp = (event.timestamp ?? new Date().toISOString()) as string;

    switch (event.type) {
      case 'state_change':
        return {
          timestamp,
          level: 'info',
          message: `守护进程状态变更: ${event.from} → ${event.to}`,
        };
      case 'chapter_complete': {
        const auditPassed = event.auditStatus === 'passed';
        const aiScore = ((event.aiTraceScore as number) ?? 0) * 100;
        return {
          timestamp,
          level: auditPassed ? 'info' : 'warn',
          message: `第${event.chapter}章 完成${auditPassed ? '  审计通过' : '  审计警告'}  AI痕迹 ${aiScore.toFixed(1)}%`,
          chapter: event.chapter as number,
          raw: event,
        };
      }
      case 'chapter_error':
        return {
          timestamp,
          level: 'error',
          message: `第${event.chapter}章 创作失败: ${event.error ?? '未知错误'}`,
          chapter: event.chapter as number,
          raw: event,
        };
      case 'daemon_event': {
        if (event.subtype === 'rpm_throttle') {
          return {
            timestamp,
            level: 'warn',
            message: `RPM 限流触发，间隔延长至 ${event.newInterval}s`,
            raw: event,
          };
        }
        if (event.subtype === 'quota_warning') {
          return {
            timestamp,
            level: 'warn',
            message: `Token 配额警告: ${event.used}/${event.limit}`,
            raw: event,
          };
        }
        return {
          timestamp,
          level: 'info',
          message: String(event.message ?? JSON.stringify(event)),
          raw: event,
        };
      }
      default:
        // Fallback for any other event types
        return {
          timestamp,
          level: 'info',
          message: String(event.message ?? JSON.stringify(event)),
          raw: event,
        };
    }
  }, []);

  useEffect(() => {
    if (!bookId) return;

    const es = new EventSource(`/api/books/${bookId}/sse`);
    esRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const entry = parseEvent(data);
        if (entry) {
          setLogs((prev) => [...prev.slice(-200), entry]); // Keep last 200 entries
        }
      } catch {
        // parse error, ignore
      }
    };

    es.onerror = () => {
      // Connection lost — browser will auto-reconnect
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [bookId, parseEvent]);

  const filtered = logs.filter((l) => levelFilter === 'all' || l.level === levelFilter);

  return (
    <div
      ref={containerRef}
      className="p-4 bg-slate-950 text-slate-300 font-mono text-xs space-y-1.5 h-64 overflow-y-auto"
    >
      {filtered.length === 0 ? (
        <div className="text-slate-500">等待事件...</div>
      ) : (
        filtered.map((log, i) => (
          <div key={i} className="flex gap-3">
            <span className="text-slate-500 shrink-0">
              [{new Date(log.timestamp).toLocaleTimeString()}]
            </span>
            <span
              className={`shrink-0 ${
                log.level === 'error'
                  ? 'text-rose-500'
                  : log.level === 'warn'
                    ? 'text-amber-500'
                    : 'text-emerald-500'
              }`}
            >
              {log.level.toUpperCase()}
            </span>
            <span className="break-all">{log.message}</span>
          </div>
        ))
      )}
    </div>
  );
}
