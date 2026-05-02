import { Suspense, lazy, type ComponentType, type ReactNode } from 'react';
import { Routes, Route } from 'react-router-dom';
import AppLayout from '@/components/layout/app-layout';
import { DashboardPageSkeleton, WritingPageSkeleton } from '@/components/page-loading-skeletons';

const Dashboard = lazy(() => import('@/pages/dashboard'));
const ChaptersPage = lazy(() => import('@/pages/chapters'));
const BookCreate = lazy(() => import('@/pages/book-create'));
const BookDetail = lazy(() => import('@/pages/book-detail'));
const ChapterReader = lazy(() => import('@/pages/chapter-reader'));
const Writing = lazy(() => import('@/pages/writing'));
const Analytics = lazy(() => import('@/pages/analytics'));
const TruthFiles = lazy(() => import('@/pages/truth-files'));
const HookPanel = lazy(() => import('@/pages/hook-panel'));
const HookTimelinePage = lazy(() => import('@/pages/hook-timeline'));
const ConfigView = lazy(() => import('@/pages/config-view'));
const DoctorView = lazy(() => import('@/pages/doctor-view'));
const StyleManager = lazy(() => import('@/pages/style-manager'));
const EmotionalArcs = lazy(() => import('@/pages/emotional-arcs'));
const WritingPlan = lazy(() => import('@/pages/writing-plan'));
const GenreManager = lazy(() => import('@/pages/genre-manager'));
const ExportView = lazy(() => import('@/pages/export-view'));
const ImportManager = lazy(() => import('@/pages/import-manager'));
const LogViewerPage = lazy(() => import('@/pages/log-viewer-page'));
const PromptVersion = lazy(() => import('@/pages/prompt-version'));
const HookMinimapPage = lazy(() => import('@/pages/hook-minimap-page'));
const HookMagnifierPage = lazy(() => import('@/pages/hook-magnifier-page'));
const ThunderAnimPage = lazy(() => import('@/pages/thunder-anim-page'));
const QualityGate = lazy(() => import('@/pages/quality-gate'));
const ChapterPlans = lazy(() => import('@/pages/chapter-plans'));
const PlanningBrief = lazy(() => import('@/pages/planning-brief'));
const InspirationInput = lazy(() => import('@/pages/inspiration-input'));
const StoryOutline = lazy(() => import('@/pages/story-outline'));

interface RouteFallbackConfig {
  title: string;
  description: string;
}

function renderLazyRoute(Page: ComponentType, fallback: ReactNode) {
  return (
    <Suspense fallback={fallback}>
      <Page />
    </Suspense>
  );
}

function renderGenericFallback(title: string, description: string) {
  return <GenericRouteFallback title={title} description={description} />;
}

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`rounded-xl bg-foreground/10 ${className}`} />;
}

function GenericRouteFallback({ title, description }: RouteFallbackConfig) {
  return (
    <section className="mx-auto max-w-5xl animate-pulse" aria-busy="true" aria-live="polite">
      <div className="rounded-2xl border border-border/60 bg-card/80 p-6 shadow-sm">
        <div className="h-4 w-24 rounded-full bg-primary/10" />
        <div className="mt-4 h-8 w-56 rounded-lg bg-foreground/10" />
        <div className="mt-3 h-4 w-full max-w-2xl rounded-md bg-foreground/10" />
        <div className="mt-2 h-4 w-full max-w-xl rounded-md bg-foreground/10" />
        <div className="mt-6 flex flex-wrap gap-3">
          <div className="h-10 w-28 rounded-lg bg-foreground/10" />
          <div className="h-10 w-36 rounded-lg bg-foreground/10" />
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.3fr,0.7fr]">
        <div className="rounded-2xl border border-border/60 bg-card/60 p-6 shadow-sm">
          <div className="h-5 w-32 rounded-md bg-foreground/10" />
          <div className="mt-4 space-y-3">
            <div className="h-4 w-full rounded-md bg-foreground/10" />
            <div className="h-4 w-11/12 rounded-md bg-foreground/10" />
            <div className="h-4 w-10/12 rounded-md bg-foreground/10" />
            <div className="h-4 w-9/12 rounded-md bg-foreground/10" />
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/60 p-6 shadow-sm">
          <div className="h-5 w-28 rounded-md bg-foreground/10" />
          <div className="mt-4 space-y-3">
            <div className="h-14 rounded-xl bg-foreground/10" />
            <div className="h-14 rounded-xl bg-foreground/10" />
            <div className="h-14 rounded-xl bg-foreground/10" />
          </div>
        </div>
      </div>

      <div className="mt-5 px-1 text-xs text-muted-foreground/80">
        <span className="font-medium text-foreground/80">{title}</span>
        <span className="mx-2">·</span>
        <span>{description}</span>
      </div>
    </section>
  );
}

function BookCreateRouteFallback() {
  return (
    <section
      className="mx-auto max-w-3xl space-y-6 animate-pulse"
      aria-busy="true"
      aria-live="polite"
    >
      <div>
        <h1 className="text-2xl font-bold text-foreground/90">新建书籍</h1>
        <p className="mt-1 text-sm text-muted-foreground">正在准备开书表单与创作参数。</p>
      </div>

      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <SkeletonBlock className="h-5 w-24 rounded-full" />
        <SkeletonBlock className="h-3 w-4 rounded-full" />
        <SkeletonBlock className="h-5 w-24 rounded-full" />
      </div>

      <div className="space-y-5 rounded-lg border bg-card p-6 shadow-sm">
        <div>
          <SkeletonBlock className="mb-2 h-4 w-16 rounded-md" />
          <SkeletonBlock className="h-10 w-full" />
        </div>
        <div>
          <SkeletonBlock className="mb-2 h-4 w-16 rounded-md" />
          <SkeletonBlock className="h-10 w-full" />
        </div>
        <div>
          <SkeletonBlock className="mb-2 h-4 w-12 rounded-md" />
          <div className="flex gap-4">
            <SkeletonBlock className="h-8 w-20 rounded-full" />
            <SkeletonBlock className="h-8 w-20 rounded-full" />
          </div>
        </div>
        <div>
          <SkeletonBlock className="mb-2 h-4 w-16 rounded-md" />
          <SkeletonBlock className="h-10 w-full" />
        </div>
        <SkeletonBlock className="h-11 w-full" />
      </div>
    </section>
  );
}

function WritingPlanRouteFallback() {
  return (
    <section
      className="flex h-full min-h-0 animate-pulse bg-background"
      aria-busy="true"
      aria-live="polite"
    >
      <aside className="w-60 shrink-0 border-r bg-muted/20 px-5 py-6">
        <SkeletonBlock className="h-4 w-20 rounded-md" />
        <div className="mt-5 space-y-2">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="flex items-start gap-3 rounded-lg border border-transparent px-3 py-2.5"
            >
              <SkeletonBlock className="h-6 w-6 rounded-full" />
              <div className="min-w-0 flex-1">
                <SkeletonBlock className="h-4 w-24 rounded-md" />
                <SkeletonBlock className="mt-2 h-3 w-32 rounded-md" />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-8 space-y-2 border-t pt-4">
          <SkeletonBlock className="h-4 w-24 rounded-md" />
          <SkeletonBlock className="h-4 w-24 rounded-md" />
          <SkeletonBlock className="h-4 w-24 rounded-md" />
          <SkeletonBlock className="h-4 w-24 rounded-md" />
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto px-6 py-6 lg:px-8">
        <div className="mb-6 flex items-start justify-between gap-4 border-b pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground/90">创作规划</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              正在准备章节规划、世界规则和角色上下文。
            </p>
          </div>
          <SkeletonBlock className="h-9 w-32 rounded-full" />
        </div>

        <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <SkeletonBlock className="h-6 w-24" />
                <SkeletonBlock className="mt-2 h-4 w-32 rounded-md" />
              </div>
              <SkeletonBlock className="h-7 w-16 rounded-full" />
            </div>
            <div className="rounded-xl border bg-muted/20 p-2">
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="flex items-center gap-3 rounded-lg px-3 py-2">
                  <SkeletonBlock className="h-4 w-14 rounded-md" />
                  <SkeletonBlock className="h-4 flex-1 rounded-md" />
                  <SkeletonBlock className="h-4 w-6 rounded-md" />
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <SkeletonBlock className="h-6 w-40" />
                <SkeletonBlock className="mt-2 h-4 w-48 rounded-md" />
              </div>
              <div className="flex gap-2">
                <SkeletonBlock className="h-9 w-20" />
                <SkeletonBlock className="h-9 w-24" />
                <SkeletonBlock className="h-9 w-28" />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-4">
                <SkeletonBlock className="h-24 w-full" />
                <SkeletonBlock className="h-24 w-full" />
              </div>
              <div className="space-y-4">
                <SkeletonBlock className="h-24 w-full" />
                <SkeletonBlock className="h-24 w-full" />
              </div>
            </div>
          </section>
        </div>
      </main>
    </section>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={renderLazyRoute(Dashboard, <DashboardPageSkeleton />)} />
        <Route
          path="/book-create"
          element={renderLazyRoute(BookCreate, <BookCreateRouteFallback />)}
        />
        <Route
          path="/book/:bookId"
          element={renderLazyRoute(
            BookDetail,
            renderGenericFallback('书籍详情', '正在整理当前书籍概览与章节进度。'),
          )}
        />
        <Route
          path="/book/:bookId/chapter/:chapterNumber"
          element={renderLazyRoute(
            ChapterReader,
            renderGenericFallback('章节阅读', '正在载入章节正文与审阅信息。'),
          )}
        />
        <Route path="/writing" element={renderLazyRoute(Writing, <WritingPageSkeleton />)} />
        <Route
          path="/chapters"
          element={renderLazyRoute(
            ChaptersPage,
            renderGenericFallback('章节列表', '正在汇总章节状态与发布信息。'),
          )}
        />
        <Route
          path="/review"
          element={renderLazyRoute(
            ChaptersPage,
            renderGenericFallback('章节审阅', '正在整理待审内容与章节状态。'),
          )}
        />
        <Route
          path="/hooks"
          element={renderLazyRoute(
            HookPanel,
            renderGenericFallback('伏笔面板', '正在加载伏笔状态与关联章节。'),
          )}
        />
        <Route
          path="/hooks/timeline"
          element={renderLazyRoute(
            HookTimelinePage,
            renderGenericFallback('伏笔时间轴', '正在展开伏笔推进与回收节奏。'),
          )}
        />
        <Route
          path="/hooks/minimap"
          element={renderLazyRoute(
            HookMinimapPage,
            renderGenericFallback('伏笔地图', '正在生成伏笔分布视图。'),
          )}
        />
        <Route
          path="/hooks/magnifier"
          element={renderLazyRoute(
            HookMagnifierPage,
            renderGenericFallback('伏笔放大镜', '正在细看高优先级伏笔细节。'),
          )}
        />
        <Route
          path="/hooks/thunder"
          element={renderLazyRoute(
            ThunderAnimPage,
            renderGenericFallback('伏笔惊群', '正在准备伏笔唤醒波峰视图。'),
          )}
        />
        <Route
          path="/analytics"
          element={renderLazyRoute(
            Analytics,
            renderGenericFallback('数据分析', '正在汇总创作指标与质量趋势。'),
          )}
        />
        <Route
          path="/truth-files"
          element={renderLazyRoute(
            TruthFiles,
            renderGenericFallback('事实档案', '正在读取角色、设定和事实索引。'),
          )}
        />
        <Route
          path="/config"
          element={renderLazyRoute(
            ConfigView,
            renderGenericFallback('系统设置', '正在加载模型、路由与运行配置。'),
          )}
        />
        <Route
          path="/doctor"
          element={renderLazyRoute(
            DoctorView,
            renderGenericFallback('状态诊断', '正在准备状态差异与诊断面板。'),
          )}
        />
        <Route
          path="/style-manager"
          element={renderLazyRoute(
            StyleManager,
            renderGenericFallback('风格管理', '正在同步文风指纹与仿写工具。'),
          )}
        />
        <Route
          path="/genres"
          element={renderLazyRoute(
            GenreManager,
            renderGenericFallback('题材管理', '正在整理题材模板与规则。'),
          )}
        />
        <Route
          path="/writing-plan"
          element={renderLazyRoute(WritingPlan, <WritingPlanRouteFallback />)}
        />
        <Route
          path="/book/:bookId/emotional-arcs"
          element={renderLazyRoute(
            EmotionalArcs,
            renderGenericFallback('情感曲线', '正在分析章节情绪波动与角色弧线。'),
          )}
        />
        <Route
          path="/export"
          element={renderLazyRoute(
            ExportView,
            renderGenericFallback('导出中心', '正在准备导出格式与任务状态。'),
          )}
        />
        <Route
          path="/import"
          element={renderLazyRoute(
            ImportManager,
            renderGenericFallback('导入管理', '正在整理外部文档与导入结果。'),
          )}
        />
        <Route
          path="/logs"
          element={renderLazyRoute(
            LogViewerPage,
            renderGenericFallback('运行日志', '正在读取最新日志与任务输出。'),
          )}
        />
        <Route
          path="/prompts/:bookId"
          element={renderLazyRoute(
            PromptVersion,
            renderGenericFallback('提示词版本', '正在准备版本差异与切换操作。'),
          )}
        />
        <Route
          path="/quality"
          element={renderLazyRoute(
            QualityGate,
            renderGenericFallback('质量门禁', '正在汇总质量评分与告警项。'),
          )}
        />
        <Route
          path="/chapter-plans"
          element={renderLazyRoute(
            ChapterPlans,
            renderGenericFallback('章节计划', '正在整理各章计划与关键节拍。'),
          )}
        />
        <Route
          path="/planning-brief"
          element={renderLazyRoute(
            PlanningBrief,
            renderGenericFallback('规划简报', '正在载入主题大纲与成长主线。'),
          )}
        />
        <Route
          path="/inspiration"
          element={renderLazyRoute(
            InspirationInput,
            renderGenericFallback('灵感输入', '正在准备创意来源与整理面板。'),
          )}
        />
        <Route
          path="/story-outline"
          element={renderLazyRoute(
            StoryOutline,
            renderGenericFallback('故事大纲', '正在展开幕结构与章节蓝图。'),
          )}
        />
        <Route path="*" element={<div>404 Not Found</div>} />
      </Route>
    </Routes>
  );
}
