// ─── Types ─────────────────────────────────────────────────────────

/** Stage execution status. */
export enum StageStatus {
  Pending = 'pending',
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
  Skipped = 'skipped',
}

/** A single pipeline stage. */
export interface PipelineStage {
  id: string;
  name: string;
  dependencies: string[];
  /** Main execution function. Receives and may mutate context.data. */
  execute: (ctx: PipelineContext) => Promise<void>;
  /** If present and returns true, the stage is skipped. */
  precondition?: (ctx: PipelineContext) => boolean;
}

/** Shared context passed through the pipeline. */
export interface PipelineContext {
  bookId: string;
  chapterNumber: number;
  data: Record<string, unknown>;
}

/** Result of a single stage execution. */
export interface StageExecutionResult {
  id: string;
  name: string;
  status: StageStatus;
  durationMs: number;
  error?: string;
}

/** Overall pipeline execution result. */
export interface PipelineExecutionResult {
  success: boolean;
  stages: StageExecutionResult[];
  failedStage?: string;
  totalDurationMs: number;
}

/** Pipeline configuration from a preset. */
export interface PipelineConfig {
  name: string;
  stages: PipelineStage[];
  disabledStages: string[];
}

// ─── PipelineScheduler ─────────────────────────────────────────────
/**
 * 流水线阶段调度器。
 * 负责：
 *   - 注册 / 管理阶段定义
 *   - 依赖解析（拓扑排序）
 *   - 动态启用 / 禁用阶段
 *   - 前置条件检查
 *   - 按序执行并收集结果
 */
export class PipelineScheduler {
  private stages = new Map<string, PipelineStage>();
  private disabledStages = new Set<string>();

  // ── Registration ──────────────────────────────────────────

  /**
   * 注册一个流水线阶段。
   */
  registerStage(stage: PipelineStage): void {
    if (this.stages.has(stage.id)) {
      throw new Error(`阶段「${stage.id}」已存在`);
    }
    this.stages.set(stage.id, stage);
  }

  /**
   * 获取已注册阶段。
   */
  getStage(id: string): PipelineStage | undefined {
    return this.stages.get(id);
  }

  // ── Enable / Disable ──────────────────────────────────────

  /**
   * 禁用指定阶段。该阶段及其依赖它的下游阶段将在执行时被跳过。
   */
  disableStage(id: string): void {
    this.disabledStages.add(id);
  }

  /**
   * 重新启用指定阶段。
   */
  enableStage(id: string): void {
    this.disabledStages.delete(id);
  }

  /**
   * 获取所有阶段的信息。
   */
  getStageInfo(): Array<{ id: string; name: string; enabled: boolean; dependencies: string[] }> {
    const result: Array<{ id: string; name: string; enabled: boolean; dependencies: string[] }> =
      [];
    for (const [id, stage] of this.stages) {
      result.push({
        id,
        name: stage.name,
        enabled: !this.disabledStages.has(id),
        dependencies: stage.dependencies,
      });
    }
    return result;
  }

  // ── Dependency Resolution ─────────────────────────────────

  /**
   * 解析执行顺序：从目标阶段出发，拓扑排序所有可达的前置阶段。
   * 自动排除已禁用阶段和前置条件不满足的阶段。
   */
  resolveOrder(targetStageIds: string[], _ctx?: PipelineContext): PipelineStage[] {
    const reachable = new Set<string>();
    const disabledInPath = new Set<string>();

    // BFS to find all reachable stages
    const queue = [...targetStageIds];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const stage = this.stages.get(current);
      if (!stage) {
        throw new Error(`阶段「${current}」不存在`);
      }

      // Check if disabled
      if (this.disabledStages.has(current)) {
        disabledInPath.add(current);
        // Still follow dependencies so we get their reachable stages
        for (const dep of stage.dependencies) {
          if (!this.stages.has(dep)) {
            throw new Error(`阶段「${current}」的依赖「${dep}」不存在`);
          }
          if (!visited.has(dep)) {
            queue.push(dep);
          }
        }
        continue;
      }

      reachable.add(current);

      for (const dep of stage.dependencies) {
        if (!this.stages.has(dep)) {
          throw new Error(`阶段「${current}」的依赖「${dep}」不存在`);
        }
        if (!visited.has(dep)) {
          queue.push(dep);
        }
      }
    }

    // Filter out stages whose dependencies include a disabled stage
    const validStages = [...reachable].filter((id) => {
      const stage = this.stages.get(id)!;
      return stage.dependencies.every((dep) => !disabledInPath.has(dep));
    });

    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    for (const id of validStages) {
      inDegree.set(id, 0);
      adjList.set(id, []);
    }

    for (const id of validStages) {
      const stage = this.stages.get(id)!;
      for (const dep of stage.dependencies) {
        if (validStages.includes(dep)) {
          adjList.get(dep)!.push(id);
          inDegree.set(id, inDegree.get(id)! + 1);
        }
      }
    }

    // Check for circular dependencies
    const queue2: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue2.push(id);
    }

    const sorted: string[] = [];
    while (queue2.length > 0) {
      const current = queue2.shift()!;
      sorted.push(current);
      for (const next of adjList.get(current) ?? []) {
        inDegree.set(next, inDegree.get(next)! - 1);
        if (inDegree.get(next) === 0) {
          queue2.push(next);
        }
      }
    }

    if (sorted.length !== validStages.length) {
      throw new Error('检测到循环依赖');
    }

    return sorted.map((id) => this.stages.get(id)!);
  }

  // ── Execute ───────────────────────────────────────────────

  /**
   * 执行流水线。
   * @param targetStageIds 目标阶段 ID 列表
   * @param ctx 共享上下文
   */
  async execute(targetStageIds: string[], ctx: PipelineContext): Promise<PipelineExecutionResult> {
    const stages = this.resolveOrder(targetStageIds, ctx);
    const results: StageExecutionResult[] = [];
    const startTime = Date.now();

    // Track which stages were disabled or had unmet dependencies
    const allReachable = this.#getAllReachableIds(targetStageIds);
    const disabledInPath = allReachable.filter((id) => this.disabledStages.has(id));

    // Add disabled stages as skipped
    for (const id of disabledInPath) {
      const stage = this.stages.get(id)!;
      results.push({
        id,
        name: stage.name,
        status: StageStatus.Skipped,
        durationMs: 0,
      });
    }

    for (const stage of stages) {
      // Check precondition
      if (stage.precondition?.(ctx)) {
        results.push({
          id: stage.id,
          name: stage.name,
          status: StageStatus.Skipped,
          durationMs: 0,
        });
        continue;
      }

      const stageStart = Date.now();

      try {
        await stage.execute(ctx);
        results.push({
          id: stage.id,
          name: stage.name,
          status: StageStatus.Completed,
          durationMs: Date.now() - stageStart,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          id: stage.id,
          name: stage.name,
          status: StageStatus.Failed,
          durationMs: Date.now() - stageStart,
          error: message,
        });

        return {
          success: false,
          stages: results,
          failedStage: stage.id,
          totalDurationMs: Date.now() - startTime,
        };
      }
    }

    // Add stages that were skipped due to disabled dependencies
    for (const id of allReachable) {
      if (!this.disabledStages.has(id) && !results.some((r) => r.id === id)) {
        const stage = this.stages.get(id)!;
        results.push({
          id,
          name: stage.name,
          status: StageStatus.Skipped,
          durationMs: 0,
        });
      }
    }

    return {
      success: true,
      stages: results,
      totalDurationMs: Date.now() - startTime,
    };
  }

  // ── Presets ───────────────────────────────────────────────

  /**
   * 完整流水线配置（writeNextChapter）。
   * 注意：execute 函数需要具体实现，preset 仅提供阶段定义骨架。
   */
  static createFullPipeline(): PipelineConfig {
    const noOp = async () => {};
    return {
      name: 'full',
      stages: [
        { id: 'context_card', name: '上下文卡片', dependencies: [], execute: noOp },
        { id: 'intent', name: '意图定向', dependencies: ['context_card'], execute: noOp },
        { id: 'draft', name: '草稿生成', dependencies: ['intent'], execute: noOp },
        { id: 'polish', name: '场景润色', dependencies: ['draft'], execute: noOp },
        { id: 'audit', name: '质量审计', dependencies: ['polish'], execute: noOp },
        { id: 'memory', name: '记忆提取', dependencies: ['audit'], execute: noOp },
        { id: 'persist', name: '持久化', dependencies: ['memory'], execute: noOp },
      ],
      disabledStages: [],
    };
  }

  /**
   * 草稿流水线配置（writeDraft）。
   * 跳过审计和记忆提取。
   */
  static createDraftPipeline(): PipelineConfig {
    const noOp = async () => {};
    return {
      name: 'draft',
      stages: [
        { id: 'draft', name: '草稿生成', dependencies: [], execute: noOp },
        { id: 'audit', name: '质量审计', dependencies: ['draft'], execute: noOp },
        { id: 'persist', name: '持久化', dependencies: ['audit'], execute: noOp },
      ],
      disabledStages: ['audit'],
    };
  }

  /**
   * 快速草稿流水线（writeFastDraft）。
   * 仅生成草稿，不持久化。
   */
  static createFastDraftPipeline(): PipelineConfig {
    const noOp = async () => {};
    return {
      name: 'fast_draft',
      stages: [
        { id: 'context_card', name: '上下文卡片', dependencies: [], execute: noOp },
        { id: 'draft', name: '草稿生成', dependencies: ['context_card'], execute: noOp },
        { id: 'audit', name: '质量审计', dependencies: ['draft'], execute: noOp },
        { id: 'persist', name: '持久化', dependencies: ['audit'], execute: noOp },
      ],
      disabledStages: ['audit', 'persist'],
    };
  }

  // ── Internal ──────────────────────────────────────────────

  #getAllReachableIds(targetIds: string[]): string[] {
    const reachable = new Set<string>();
    const queue = [...targetIds];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      reachable.add(current);

      const stage = this.stages.get(current);
      if (!stage) continue;

      // Follow dependencies even if current is disabled
      for (const dep of stage.dependencies) {
        if (!visited.has(dep)) {
          queue.push(dep);
        }
      }
    }

    return [...reachable];
  }
}
