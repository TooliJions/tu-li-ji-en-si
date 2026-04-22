import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { fetchBook, fetchBooks } from '../../lib/api';
import Sidebar, { type SidebarBook } from './sidebar';
import Header from './header';

interface AppLayoutProps {
  rightPanel?: React.ReactNode;
}

function getRequestedBookId(pathname: string, search: string) {
  const params = new URLSearchParams(search);
  const searchBookId = params.get('bookId');
  if (searchBookId) {
    return searchBookId;
  }

  const pathBookMatch = pathname.match(/^\/book\/([^/]+)/);
  if (pathBookMatch) {
    return pathBookMatch[1];
  }

  const promptBookMatch = pathname.match(/^\/prompts\/([^/]+)/);
  if (promptBookMatch) {
    return promptBookMatch[1];
  }

  return '';
}

export default function AppLayout({ rightPanel }: AppLayoutProps) {
  const location = useLocation();
  const isWritingPage = location.pathname.startsWith('/writing');
  const [currentBook, setCurrentBook] = useState<SidebarBook | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolveCurrentBook() {
      const requestedBookId = getRequestedBookId(location.pathname, location.search);

      try {
        if (requestedBookId) {
          const book = (await fetchBook(requestedBookId)) as SidebarBook;
          if (!cancelled) {
            setCurrentBook(book);
          }
          return;
        }

        const activeBooks = (await fetchBooks({ status: 'active' })) as SidebarBook[];
        if (!cancelled) {
          setCurrentBook(activeBooks[0] ?? null);
        }
      } catch {
        if (!cancelled) {
          setCurrentBook(null);
        }
      }
    }

    resolveCurrentBook();

    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search]);

  // Writing pages render full-width with no right panel for focused writing.
  // Non-writing pages get a default info panel unless overridden by `rightPanel`.
  const defaultPanel = rightPanel ?? (
    <div className="p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold mb-2">当前工作区</h3>
        <p className="text-xs text-muted-foreground">{location.pathname}</p>
      </div>
      <div className="border-t pt-4">
        <h3 className="text-sm font-semibold mb-2">属性 / 状态 / 质量</h3>
        <p className="text-xs text-muted-foreground">暂无数据</p>
      </div>
      <div className="border-t pt-4">
        <h3 className="text-sm font-semibold mb-2">日志输出</h3>
        <p className="text-xs text-muted-foreground">无新日志</p>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen">
      <Sidebar currentBook={currentBook} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header currentBook={currentBook} />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
      {/* 右侧面板 - 320px 固定宽度 (writing pages get no panel) */}
      {!isWritingPage && (
        <aside
          className="border-l bg-card overflow-auto"
          style={{ width: 320, minWidth: 320, maxWidth: 320 }}
        >
          {defaultPanel}
        </aside>
      )}
    </div>
  );
}
