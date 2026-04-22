import { useState } from 'react';
import HookMinimap from '@/components/hook-minimap';

type Chapter = {
  chapter: number;
  count: number;
  pendingWakes: number;
  isFocused: boolean;
  hasThunder: boolean;
};

const MOCK_CHAPTERS: Chapter[] = Array.from({ length: 30 }, (_, i) => ({
  chapter: i + 1,
  count: Math.floor(Math.random() * 5),
  pendingWakes: Math.floor(Math.random() * 3),
  isFocused: false,
  hasThunder: Math.random() > 0.85,
}));

export default function HookMinimapPage() {
  const [chapters, setChapters] = useState<Chapter[]>(MOCK_CHAPTERS);

  const handleSelect = (chapter: number) => {
    setChapters((prev) => prev.map((c) => ({ ...c, isFocused: c.chapter === chapter })));
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">全局热力色带小地图</h1>
      <p className="text-sm text-muted-foreground mb-6">
        显示全局伏笔密度热力色带，点击章节聚焦查看。
      </p>
      <HookMinimap chapters={chapters} onSelectChapter={handleSelect} />
    </div>
  );
}
