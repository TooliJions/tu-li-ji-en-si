import { useEffect, useRef, useState } from 'react';

interface LogEvent {
  id: string;
  type: string;
  level: 'info' | 'warn' | 'error';
  timestamp: string;
  message: string;
}

interface LogStreamProps {
  bookId: string;
  levelFilter: 'all' | 'info' | 'warn' | 'error';
  searchQuery?: string;
}

const MAX_EVENTS = 200;

const LEVEL_FROM_TYPE: Record<string, 'info' | 'warn' | 'error'> = {
  pipeline_progress: 'info',
  memory_extracted: 'info',
  chapter_complete: 'info',
  hook_wake: 'info',
  thundering_herd: 'warn',
  quality_drift: 'warn',
  context_changed: 'info',
};

export default function LogStream({ bookId, levelFilter, searchQuery = '' }: LogStreamProps) {
  const [events, setEvents] = useState<LogEvent[]>([]);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!bookId) return undefined;
    const source = new EventSource(`/api/books/${bookId}/sse`);
    sourceRef.current = source;

    const handler = (type: string) => (e: MessageEvent) => {
      let message = '';
      try {
        message = JSON.stringify(JSON.parse(e.data));
      } catch {
        message = String(e.data);
      }
      const evt: LogEvent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        level: LEVEL_FROM_TYPE[type] ?? 'info',
        timestamp: new Date().toISOString(),
        message,
      };
      setEvents((prev) => [evt, ...prev].slice(0, MAX_EVENTS));
    };

    Object.keys(LEVEL_FROM_TYPE).forEach((type) => {
      source.addEventListener(type, handler(type) as EventListener);
    });

    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, [bookId]);

  const filtered = events.filter((evt) => {
    if (levelFilter !== 'all' && evt.level !== levelFilter) return false;
    if (searchQuery && !evt.message.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  if (filtered.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
        暂无事件,创作过程中将在此实时显示。
      </div>
    );
  }

  return (
    <ul className="divide-y divide-slate-800 text-xs">
      {filtered.map((evt) => (
        <li key={evt.id} className="flex gap-3 px-4 py-2 font-mono">
          <span className="w-20 shrink-0 text-muted-foreground">{evt.timestamp.slice(11, 19)}</span>
          <span
            className={
              'w-12 shrink-0 ' +
              (evt.level === 'error'
                ? 'text-rose-400'
                : evt.level === 'warn'
                  ? 'text-amber-400'
                  : 'text-emerald-400')
            }
          >
            {evt.level.toUpperCase()}
          </span>
          <span className="w-32 shrink-0 text-muted-foreground">{evt.type}</span>
          <span className="flex-1 break-all">{evt.message}</span>
        </li>
      ))}
    </ul>
  );
}
