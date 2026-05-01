import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { fetchBooks } from '../../lib/api';
import { LayoutDashboard, Plus, PenTool, FileDown, Settings } from 'lucide-react';

export interface SidebarBook {
  id: string;
  title: string;
  chapterCount: number;
  targetChapterCount: number;
  status: string;
}

export interface SidebarProps {
  currentBook?: SidebarBook | null;
}

async function fetchActiveBook(): Promise<SidebarBook | null> {
  const books = (await fetchBooks({ status: 'active' })) as SidebarBook[];
  return books.length > 0 ? books[0] : null;
}

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '我的书籍' },
  { to: '/book-create', icon: Plus, label: '新建书籍' },
  { to: '/writing', icon: PenTool, label: '创作' },
  { to: '/export', icon: FileDown, label: '导出' },
];

const systemNavItems = [{ to: '/config', icon: Settings, label: '设置' }];

const bookScopedQueryRoutes = new Set([
  '/writing',
  '/export',
  '/truth-files',
  '/hooks',
  '/hooks/timeline',
  '/hooks/minimap',
  '/hooks/magnifier',
  '/hooks/thunder',
  '/analytics',
  '/import',
  '/writing-plan',
  '/daemon',
  '/logs',
  '/natural-agent',
  '/style-manager',
  '/quality',
  '/chapter-plans',
  '/planning-brief',
  '/inspiration',
  '/story-outline',
]);

function resolveNavTarget(to: string, activeBook: SidebarBook | null) {
  if (!activeBook) {
    return to;
  }

  if (to.includes(':bookId')) {
    return to.replace(':bookId', encodeURIComponent(activeBook.id));
  }

  if (bookScopedQueryRoutes.has(to)) {
    return `${to}?bookId=${encodeURIComponent(activeBook.id)}`;
  }

  return to;
}

function NavItem({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
          isActive ? 'bg-sidebar-foreground/20 font-medium' : 'hover:bg-sidebar-foreground/10'
        }`
      }
    >
      <Icon size={18} />
      {label}
    </NavLink>
  );
}

export default function Sidebar({ currentBook }: SidebarProps) {
  const [activeBook, setActiveBook] = useState<SidebarBook | null>(currentBook ?? null);

  useEffect(() => {
    if (currentBook !== undefined) {
      setActiveBook(currentBook ?? null);
      return;
    }

    fetchActiveBook()
      .then(setActiveBook)
      .catch(() => {});
  }, [currentBook]);

  const progress =
    activeBook && activeBook.targetChapterCount > 0
      ? Math.min(((activeBook.chapterCount ?? 0) / activeBook.targetChapterCount) * 100, 100)
      : 0;

  return (
    <aside
      className="min-h-screen bg-sidebar text-sidebar-foreground flex flex-col"
      style={{ width: 220 }}
    >
      <div className="p-4 border-b border-sidebar-foreground/20">
        <h1 className="text-lg font-bold tracking-tight">CyberNovelist</h1>
        <p className="text-xs text-sidebar-foreground/60">v7.0 Studio</p>
      </div>

      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavItem key={to} to={resolveNavTarget(to, activeBook)} icon={Icon} label={label} />
        ))}
      </nav>

      {/* 底部系统入口 */}
      <div className="p-2 border-t border-sidebar-foreground/20">
        {systemNavItems.map(({ to, icon: Icon, label }) => (
          <NavItem key={to} to={resolveNavTarget(to, activeBook)} icon={Icon} label={label} />
        ))}
      </div>

      {/* 书籍进度条 */}
      {activeBook && (
        <div className="px-4 py-3 border-t border-sidebar-foreground/20">
          <p className="text-xs text-sidebar-foreground/80 truncate">当前书：{activeBook.title}</p>
          <p className="text-xs text-sidebar-foreground/60 mt-1">
            进度：{activeBook.chapterCount}/{activeBook.targetChapterCount} 章
          </p>
          <div className="h-1.5 bg-sidebar-foreground/10 rounded-full overflow-hidden mt-1">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-sidebar-foreground/60 mt-1 text-right">
            {progress.toFixed(0)}%
          </p>
        </div>
      )}
    </aside>
  );
}
