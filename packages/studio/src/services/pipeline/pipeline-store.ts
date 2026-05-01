export const pipelineStore = new Map<
  string,
  {
    pipelineId: string;
    status: string;
    stages: string[];
    currentStage: string;
    progress: Record<string, { status: string; elapsedMs: number }>;
    startedAt: string;
    finishedAt?: string;
    result?: {
      success: boolean;
      chapterNumber: number;
      status?: string;
      persisted?: boolean;
      error?: string;
    };
  }
>();

export function createPipelineEntry(): string {
  const id = `pipeline-${Date.now()}`;
  const stages = ['planning', 'composing', 'writing', 'auditing', 'revising', 'persisting'];
  pipelineStore.set(id, {
    pipelineId: id,
    status: 'running',
    stages,
    currentStage: stages[0],
    progress: Object.fromEntries(
      stages.map((s) => [s, { status: s === stages[0] ? 'running' : 'pending', elapsedMs: 0 }]),
    ),
    startedAt: new Date().toISOString(),
  });
  return id;
}

export function markCurrentStage(pipelineId: string, stage: string): void {
  const pipeline = pipelineStore.get(pipelineId);
  if (!pipeline) {
    return;
  }

  pipeline.currentStage = stage;
  for (const [name, progress] of Object.entries(pipeline.progress)) {
    if (name === stage) {
      progress.status = 'running';
    } else if (progress.status !== 'completed') {
      progress.status = 'pending';
    }
  }
}

export function finalizePipeline(
  pipelineId: string,
  result: {
    success: boolean;
    chapterNumber: number;
    status?: string;
    persisted?: boolean;
    error?: string;
  },
): void {
  const pipeline = pipelineStore.get(pipelineId);
  if (!pipeline) {
    return;
  }

  pipeline.status = result.success ? 'completed' : 'failed';
  pipeline.currentStage = result.success ? 'persisting' : pipeline.currentStage;
  pipeline.finishedAt = new Date().toISOString();
  pipeline.result = result;

  for (const progress of Object.values(pipeline.progress)) {
    progress.status = result.success
      ? 'completed'
      : progress.status === 'running'
        ? 'failed'
        : progress.status;
  }
}
