import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { fetchBook, fetchBooks } from '../../lib/api';
import Sidebar, { type SidebarBook } from './sidebar';
import Header from './header';

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

export default function AppLayout() {
  const location = useLocation();
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

  return (
    <div className="flex h-screen">
      <Sidebar currentBook={currentBook} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header currentBook={currentBook} />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
