import { NavLink } from 'react-router-dom';
import {
  BookOpen,
  PenTool,
  FileText,
  LayoutDashboard,
  GitBranch,
  Map,
  Server,
  BarChart3,
  Settings,
  Stethoscope,
} from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '仪表盘' },
  { to: '/chapters', icon: FileText, label: '书籍与章节' },
  { to: '/writing', icon: PenTool, label: '写作' },
  { to: '/hooks', icon: GitBranch, label: '伏笔' },
  { to: '/hooks/timeline', icon: Map, label: '双轨时间轴' },
  { to: '/daemon', icon: Server, label: '守护进程' },
  { to: '/analytics', icon: BarChart3, label: '数据分析' },
  { to: '/truth-files', icon: BookOpen, label: '真相文件' },
  { to: '/config', icon: Settings, label: '配置' },
  { to: '/doctor', icon: Stethoscope, label: '系统诊断' },
];

export default function Sidebar() {
  return (
    <aside className="w-56 min-h-screen bg-sidebar text-sidebar-foreground flex flex-col">
      <div className="p-4 border-b border-sidebar-foreground/20">
        <h1 className="text-lg font-bold tracking-tight">CyberNovelist</h1>
        <p className="text-xs text-sidebar-foreground/60">v7.0 Studio</p>
      </div>
      <nav className="flex-1 p-2 space-y-0.5">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
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
        ))}
      </nav>
      <div className="m-2 rounded-md border border-sidebar-foreground/15 bg-sidebar-foreground/5 p-3 text-[11px] leading-5 text-sidebar-foreground/75">
        <p className="font-medium text-sidebar-foreground">阶段性入口说明</p>
        <p className="mt-1">
          导出独立页与题材独立管理暂未开放；书籍级工具请从“书籍与章节”或书籍详情进入。
        </p>
      </div>
    </aside>
  );
}
