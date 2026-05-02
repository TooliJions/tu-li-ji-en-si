function SkeletonBlock({ className }: { className: string }) {
  return <div className={`rounded-xl bg-foreground/10 ${className}`} />;
}

export function DashboardPageSkeleton() {
  return (
    <section className="space-y-6 animate-pulse" aria-busy="true" aria-live="polite">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground/90">我的书籍</h1>
          <p className="mt-1 text-sm text-muted-foreground">正在准备书架与最新进度。</p>
        </div>
        <SkeletonBlock className="h-10 w-28" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="rounded-lg border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <SkeletonBlock className="h-5 w-3/5" />
                <SkeletonBlock className="mt-2 h-4 w-2/5" />
              </div>
              <SkeletonBlock className="h-6 w-6 rounded-full" />
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <SkeletonBlock className="h-3 w-16 rounded-md" />
                <SkeletonBlock className="h-3 w-10 rounded-md" />
              </div>
              <SkeletonBlock className="h-2 w-full rounded-full" />
            </div>

            <SkeletonBlock className="mt-4 h-3 w-24 rounded-md" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function WritingPageSkeleton() {
  return (
    <section
      className="container mx-auto max-w-7xl space-y-6 py-6 pb-20 animate-pulse"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <SkeletonBlock className="h-4 w-10 rounded-md" />
          <SkeletonBlock className="h-3 w-3 rounded-full" />
          <SkeletonBlock className="h-4 w-24 rounded-md" />
          <SkeletonBlock className="h-3 w-3 rounded-full" />
          <SkeletonBlock className="h-4 w-20 rounded-md" />
        </div>
        <SkeletonBlock className="h-4 w-24 rounded-md" />
      </div>

      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground/90">正文创作工作台</h1>
        <p className="text-sm text-muted-foreground">正在同步章节、草稿与实时流水线状态。</p>
      </header>

      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <SkeletonBlock className="h-6 w-32" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="rounded-lg border bg-background/70 p-4">
              <SkeletonBlock className="h-4 w-20 rounded-md" />
              <SkeletonBlock className="mt-4 h-8 w-24 rounded-lg" />
              <SkeletonBlock className="mt-3 h-3 w-28 rounded-md" />
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="space-y-6 xl:col-span-8">
          {Array.from({ length: 2 }, (_, index) => (
            <section key={index} className="rounded-lg border bg-card p-6 shadow-sm">
              <div className="mb-6 flex items-center gap-2">
                <SkeletonBlock className="h-6 w-28" />
              </div>
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-[96px_minmax(0,1fr)_160px]">
                  <SkeletonBlock className="h-10 w-full" />
                  <SkeletonBlock className="h-10 w-full" />
                  <SkeletonBlock className="h-10 w-full" />
                </div>
                <SkeletonBlock className="h-36 w-full" />
              </div>
            </section>
          ))}
        </div>

        <div className="space-y-6 xl:col-span-4">
          {Array.from({ length: 3 }, (_, index) => (
            <section key={index} className="rounded-lg border bg-card p-5 shadow-sm">
              <SkeletonBlock className="h-5 w-24" />
              <div className="mt-4 space-y-3">
                <SkeletonBlock className="h-12 w-full" />
                <SkeletonBlock className="h-12 w-full" />
                <SkeletonBlock className="h-12 w-full" />
              </div>
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}
