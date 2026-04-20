import { Outlet } from 'react-router-dom';
import Sidebar from './sidebar';
import Header from './header';

interface AppLayoutProps {
  rightPanel?: React.ReactNode;
}

export default function AppLayout({ rightPanel }: AppLayoutProps) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
      {/* 右侧面板 - 320px 固定宽度 */}
      {rightPanel && (
        <aside
          className="border-l bg-card overflow-auto"
          style={{ width: 320, minWidth: 320, maxWidth: 320 }}
        >
          {rightPanel}
        </aside>
      )}
    </div>
  );
}
