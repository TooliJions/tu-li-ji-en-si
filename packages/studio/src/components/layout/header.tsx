import { useState } from 'react';
import { Wifi, WifiOff, Stethoscope, Bell, HelpCircle, X } from 'lucide-react';

export default function Header() {
  const connected = true;
  const [showNotificationPanel, setShowNotificationPanel] = useState(false);
  const [showHelpPanel, setShowHelpPanel] = useState(false);

  return (
    <header className="h-12 border-b bg-card px-4 flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>当前书籍：</span>
        <span className="font-medium text-foreground">未选择</span>
      </div>

      <div className="flex items-center gap-4">
        {/* 连接状态 */}
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

        {/* 功能按钮 */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => (window.location.href = '/doctor')}
            className="px-2 py-1 text-xs border rounded hover:bg-accent transition-colors"
            title="系统诊断"
          >
            <Stethoscope size={14} />
          </button>

          <button
            onClick={() => setShowNotificationPanel(true)}
            className="px-2 py-1 text-xs border rounded hover:bg-accent transition-colors"
            title="通知"
          >
            <Bell size={14} />
          </button>

          <button
            onClick={() => setShowHelpPanel(true)}
            className="px-2 py-1 text-xs border rounded hover:bg-accent transition-colors"
            title="帮助"
          >
            <HelpCircle size={14} />
          </button>
        </div>
      </div>

      {/* 通知面板 */}
      {showNotificationPanel && (
        <div className="fixed top-12 right-4 w-64 bg-popover border rounded-md shadow-lg p-4 z-50">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium">通知</h3>
            <button
              onClick={() => setShowNotificationPanel(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X size={16} />
            </button>
          </div>
          <div className="text-sm text-muted-foreground">暂无新通知</div>
        </div>
      )}

      {/* 帮助面板 */}
      {showHelpPanel && (
        <div className="fixed top-12 right-4 w-64 bg-popover border rounded-md shadow-lg p-4 z-50">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium">帮助</h3>
            <button
              onClick={() => setShowHelpPanel(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X size={16} />
            </button>
          </div>
          <div className="text-sm text-muted-foreground space-y-2">
            <p>CyberNovelist v7.0</p>
            <p>AI 写作助手</p>
            <div className="border-t pt-2 mt-2">
              <a href="/doctor" className="block hover:text-foreground">
                系统诊断
              </a>
              <a href="/config" className="block hover:text-foreground">
                配置
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
