import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  BookOpen,
  PenTool,
  FileCheck,
  Package,
  Tags,
  Palette,
  FolderCheck,
  GitBranch,
  BarChart3,
  Settings,
  Server,
  Stethoscope,
} from 'lucide-react';

interface SidebarBook {
  id: string;
  title: string;
  chapterCount: number;
  targetChapterCount: number;
  status: string;
}

export interface SidebarProps {
  currentBook?: SidebarBook;
}

async function fetchActiveBook(): Promise<SidebarBook | null> {
  const res = await fetch('/api/books?status=active');
  if (!res.ok) return null;
  const data = await res.json();
  const books = (data.data || []) as SidebarBook[];
  return books.length > 0 ? books[0] : null;
}

const mainNavItems = [
  { to: '/', icon: LayoutDashboard, label: '仪表盘' },
  { to: '/chapters', icon: BookOpen, label: '章节管理' },
  { to: '/writing', icon: PenTool, label: '创作' },
  { to: '/hooks', icon: GitBranch, label: '伏笔面板' },
  { to: '/analytics', icon: BarChart3, label: '数据分析' },
];

const secondaryNavItems = [
  { to: '/style-manager', icon: Palette, label: '文风管理' },
  { to: '/truth-files', icon: FolderCheck, label: '真相文件' },
  { to: '/hooks/timeline', icon: GitBranch, label: '伏笔时间线' },
  { to: '/doctor', icon: Stethoscope, label: '系统诊断' },
];

const systemNavItems = [
  { to: '/config', icon: Settings, label: '配置' },
  { to: '/daemon', icon: Server, label: '守护进程' },
  { to: '/doctor', icon: Stethoscope, label: '诊断' },
];

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
    if (currentBook) return; // Use prop if provided
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
        {/* 主导航 */}
        {mainNavItems.map(({ to, icon: Icon, label }) => (
          <NavItem key={to} to={to} icon={Icon} label={label} />
        ))}

        {/* 分隔符 */}
        <div className="my-2 border-t border-sidebar-foreground/20" />

        {/* 二级导航 */}
        {secondaryNavItems.map(({ to, icon: Icon, label }) => (
          <NavItem key={to} to={to} icon={Icon} label={label} />
        ))}

        {/* 分隔符 */}
        <div className="my-2 border-t border-sidebar-foreground/20" />

        {/* 系统导航 */}
        {systemNavItems.map(({ to, icon: Icon, label }) => (
          <NavItem key={to} to={to} icon={Icon} label={label} />
        ))}
      </nav>

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
