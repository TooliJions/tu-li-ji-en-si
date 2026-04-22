import ThunderAnim from '@/components/thunder-anim';

const MOCK_ALERTS = [
  { chapter: 12, count: 5, message: '5个伏笔同时唤醒，触发惊群平滑' },
  { chapter: 18, count: 3, message: '3个伏笔到期，分流至后续章节' },
];

export default function ThunderAnimPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">惊群抛物线平移动画</h1>
      <p className="text-sm text-muted-foreground mb-6">
        惊群平滑策略的可视化动画，显示伏笔分流到未来章节的效果。
      </p>
      <ThunderAnim alerts={MOCK_ALERTS} active={true} />
    </div>
  );
}
