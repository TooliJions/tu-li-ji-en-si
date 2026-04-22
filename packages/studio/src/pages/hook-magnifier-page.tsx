import { useState } from 'react';
import HookMagnifier from '@/components/hook-magnifier';

type Chapter = {
  chapter: number;
  count: number;
  plantedHooks: string[];
  wakingHooks: string[];
  hasThunder: boolean;
};

const MOCK_CHAPTERS: Chapter[] = Array.from({ length: 11 }, (_, i) => ({
  chapter: i + 1,
  count: Math.floor(Math.random() * 4),
  plantedHooks: i === 5 ? ['身份之谜', '旧信物'] : i === 3 ? ['神秘来客'] : [],
  wakingHooks: i === 7 ? ['身份之谜'] : i === 9 ? ['旧信物'] : [],
  hasThunder: i === 6,
}));

export default function HookMagnifierPage() {
  const [focusChapter] = useState(6);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">局部放大镜甘特图</h1>
      <p className="text-sm text-muted-foreground mb-6">
        前后 10 章窗口的甘特图视图，显示伏笔埋设→推进→回收时间线。
      </p>
      <HookMagnifier focusChapter={focusChapter} chapters={MOCK_CHAPTERS} />
    </div>
  );
}
