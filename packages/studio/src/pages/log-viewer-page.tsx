import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Terminal } from 'lucide-react';
import DaemonLogStream from '../components/daemon-log-stream';

export default function LogViewerPage() {
  const [searchParams] = useSearchParams();
  const bookId = searchParams.get('bookId') || '';
  const [levelFilter, setLevelFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  if (!bookId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        请先选择一本书籍后再查看日志。
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Terminal size={20} className="text-primary" />
            <h1 className="text-2xl font-bold">日志查看</h1>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            实时查看当前书籍的守护进程与流水线事件，并按级别或关键词检索日志内容。
          </p>
        </div>
        <Link
          to={`/daemon?bookId=${bookId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          返回守护进程
        </Link>
      </div>

      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">关键词搜索</span>
            <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
              <Search size={14} className="text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索章节、错误或事件描述"
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">级别过滤</span>
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value as 'all' | 'info' | 'warn' | 'error')}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="all">全部级别</option>
              <option value="info">INFO</option>
              <option value="warn">WARN</option>
              <option value="error">ERROR</option>
            </select>
          </label>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-slate-800">
          <DaemonLogStream bookId={bookId} levelFilter={levelFilter} searchQuery={searchQuery} />
        </div>
      </div>
    </div>
  );
}
