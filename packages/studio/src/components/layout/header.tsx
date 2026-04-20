import { Wifi, WifiOff, Stethoscope, Bell, HelpCircle } from 'lucide-react';

export default function Header() {
  const connected = true;

  return (
    <header className="h-12 border-b bg-card px-4 flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>当前书籍：</span>
        <span className="font-medium text-foreground">未选择</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm">
          {connected ? (
            <>
              <Wifi size={14} className="text-green-500" />
              <span className="text-muted-foreground">SSE 已连接</span>
            </>
          ) : (
            <>
              <WifiOff size={14} className="text-red-500" />
              <span className="text-muted-foreground">未连接</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => (window.location.href = '/doctor')}
            className="px-2 py-1 text-xs border rounded hover:bg-accent transition-colors"
            title="系统诊断"
          >
            <Stethoscope size={14} />
          </button>

          <button
            className="px-2 py-1 text-xs border rounded hover:bg-accent transition-colors"
            title="通知"
          >
            <Bell size={14} />
          </button>

          <button
            className="px-2 py-1 text-xs border rounded hover:bg-accent transition-colors"
            title="帮助"
          >
            <HelpCircle size={14} />
          </button>
        </div>
      </div>
    </header>
  );
}
