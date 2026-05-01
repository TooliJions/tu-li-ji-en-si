import { Wifi, WifiOff } from 'lucide-react';

interface HeaderBook {
  title: string;
}

interface HeaderProps {
  currentBook?: HeaderBook | null;
}

export default function Header({ currentBook }: HeaderProps) {
  const connected = true;

  return (
    <header className="h-12 border-b bg-card px-4 flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>当前书籍：</span>
        <span className="font-medium text-foreground">{currentBook?.title ?? '未选择'}</span>
      </div>

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
    </header>
  );
}
