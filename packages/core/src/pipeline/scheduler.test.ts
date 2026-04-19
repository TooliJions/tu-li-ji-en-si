import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PipelineScheduler,
  type PipelineStage,
  type PipelineConfig,
  type PipelineContext,
  type PipelineExecutionResult,
  StageStatus,
} from './scheduler';

// ── Helpers ────────────────────────────────────────────────────────

function makeStage(id: string, deps: string[] = [], fn?: () => Promise<void>): PipelineStage {
  return {
    id,
    name: id,
    dependencies: deps,
    execute: fn ?? vi.fn().mockResolvedValue(undefined),
  };
}

function makeContext(data: Record<string, unknown> = {}): PipelineContext {
  return {
    bookId: 'book1',
    chapterNumber: 1,
    data: { ...data },
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('PipelineScheduler', () => {
  let scheduler: PipelineScheduler;

  beforeEach(() => {
    scheduler = new PipelineScheduler();
  });

  // ── Stage Registration ──────────────────────────────────────

  describe('registerStage', () => {
    it('registers a stage and returns it', () => {
      const stage = makeStage('draft');
      scheduler.registerStage(stage);

      const resolved = scheduler.getStage('draft');
      expect(resolved).toBeDefined();
      expect(resolved!.id).toBe('draft');
    });

    it('throws when registering duplicate stage', () => {
      scheduler.registerStage(makeStage('draft'));

      expect(() => scheduler.registerStage(makeStage('draft'))).toThrow(/已存在/);
    });
  });

  // ── Dependency Resolution ───────────────────────────────────

  describe('resolveOrder', () => {
    it('resolves stages in topological order', () => {
      scheduler.registerStage(makeStage('persist', ['audit']));
      scheduler.registerStage(makeStage('audit', ['draft']));
      scheduler.registerStage(makeStage('draft', []));

      const order = scheduler.resolveOrder(['persist']);

      // draft → audit → persist
      expect(order.map((s) => s.id)).toEqual(['draft', 'audit', 'persist']);
    });

    it('resolves multiple roots', () => {
      scheduler.registerStage(makeStage('a', []));
      scheduler.registerStage(makeStage('b', []));
      scheduler.registerStage(makeStage('c', ['a', 'b']));

      const order = scheduler.resolveOrder(['c']);

      expect(order.map((s) => s.id)).toContain('a');
      expect(order.map((s) => s.id)).toContain('b');
      expect(order.map((s) => s.id)).toContain('c');
      // a and b should come before c
      const cIdx = order.findIndex((s) => s.id === 'c');
      const aIdx = order.findIndex((s) => s.id === 'a');
      const bIdx = order.findIndex((s) => s.id === 'b');
      expect(aIdx).toBeLessThan(cIdx);
      expect(bIdx).toBeLessThan(cIdx);
    });

    it('throws on circular dependency', () => {
      scheduler.registerStage(makeStage('a', ['c']));
      scheduler.registerStage(makeStage('b', ['a']));
      scheduler.registerStage(makeStage('c', ['b']));

      expect(() => scheduler.resolveOrder(['a'])).toThrow(/循环依赖/);
    });

    it('throws on missing dependency', () => {
      scheduler.registerStage(makeStage('a', ['nonexistent']));

      expect(() => scheduler.resolveOrder(['a'])).toThrow(/不存在/);
    });

    it('returns only reachable stages', () => {
      scheduler.registerStage(makeStage('a', []));
      scheduler.registerStage(makeStage('b', []));
      scheduler.registerStage(makeStage('c', ['a']));

      const order = scheduler.resolveOrder(['c']);
      const ids = order.map((s) => s.id);
      expect(ids).toContain('a');
      expect(ids).toContain('c');
      expect(ids).not.toContain('b');
    });
  });

  // ── Stage Enable/Disable ────────────────────────────────────

  describe('enableStage / disableStage', () => {
    it('disables a stage and skips it during execution', () => {
      const execFn = vi.fn().mockResolvedValue(undefined);
      scheduler.registerStage(makeStage('audit', [], execFn));
      scheduler.registerStage(makeStage('persist', ['audit']));

      scheduler.disableStage('audit');

      const order = scheduler.resolveOrder(['persist']);
      const auditStage = order.find((s) => s.id === 'audit');
      expect(auditStage).toBeUndefined();
    });

    it('re-enables a previously disabled stage', () => {
      scheduler.registerStage(makeStage('audit', []));

      scheduler.disableStage('audit');
      let order = scheduler.resolveOrder(['audit']);
      expect(order.length).toBe(0);

      scheduler.enableStage('audit');
      order = scheduler.resolveOrder(['audit']);
      expect(order.length).toBe(1);
      expect(order[0].id).toBe('audit');
    });

    it('skips disabled stage and its dependents that require it', () => {
      scheduler.registerStage(makeStage('draft', []));
      scheduler.registerStage(makeStage('audit', ['draft']));
      scheduler.registerStage(makeStage('polish', ['audit']));

      scheduler.disableStage('audit');

      const order = scheduler.resolveOrder(['polish']);
      const ids = order.map((s) => s.id);
      // polish depends on audit (disabled) → polish should also be excluded
      expect(ids).toContain('draft');
      expect(ids).not.toContain('audit');
      // polish's dependency on audit is unmet, so it shouldn't be included
      expect(ids).not.toContain('polish');
    });
  });

  // ── Preconditions ───────────────────────────────────────────

  describe('preconditions', () => {
    it('skips stage when precondition returns true', async () => {
      const execFn = vi.fn().mockResolvedValue(undefined);
      scheduler.registerStage({
        id: 'audit',
        name: 'Audit',
        dependencies: [],
        execute: execFn,
        precondition: (ctx) => ctx.data.skipAudit === true,
      });

      // resolveOrder doesn't check preconditions; execute does
      const ctx = makeContext({ skipAudit: true });
      const result = await scheduler.execute(['audit'], ctx);

      expect(result.success).toBe(true);
      expect(result.stages.some((s) => s.id === 'audit' && s.status === StageStatus.Skipped)).toBe(
        true
      );
      expect(execFn).not.toHaveBeenCalled();
    });

    it('includes stage when precondition returns true', () => {
      const execFn = vi.fn().mockResolvedValue(undefined);
      scheduler.registerStage({
        id: 'audit',
        name: 'Audit',
        dependencies: [],
        execute: execFn,
        precondition: (ctx) => ctx.data.skipAudit === true,
      });

      const ctx = makeContext({ skipAudit: false });
      const order = scheduler.resolveOrder(['audit']);
      expect(order.length).toBe(1);
    });
  });

  // ── Execute Pipeline ────────────────────────────────────────

  describe('execute', () => {
    it('executes stages in correct order', async () => {
      const calls: string[] = [];
      scheduler.registerStage(
        makeStage('draft', [], async () => {
          calls.push('draft');
        })
      );
      scheduler.registerStage(
        makeStage('audit', ['draft'], async () => {
          calls.push('audit');
        })
      );
      scheduler.registerStage(
        makeStage('persist', ['audit'], async () => {
          calls.push('persist');
        })
      );

      const result = await scheduler.execute(['persist'], makeContext());

      expect(result.success).toBe(true);
      expect(calls).toEqual(['draft', 'audit', 'persist']);
    });

    it('stops execution on stage failure', async () => {
      const calls: string[] = [];
      scheduler.registerStage(
        makeStage('draft', [], async () => {
          calls.push('draft');
        })
      );
      scheduler.registerStage(
        makeStage('audit', ['draft'], async () => {
          calls.push('audit');
          throw new Error('Audit failed');
        })
      );
      scheduler.registerStage(
        makeStage('persist', ['audit'], async () => {
          calls.push('persist');
        })
      );

      const result = await scheduler.execute(['persist'], makeContext());

      expect(result.success).toBe(false);
      expect(result.failedStage).toBe('audit');
      expect(calls).toEqual(['draft', 'audit']);
      expect(calls).not.toContain('persist');
    });

    it('shares data between stages via context', async () => {
      scheduler.registerStage(
        makeStage('draft', [], async (ctx) => {
          ctx.data.draftContent = 'Hello world';
        })
      );
      scheduler.registerStage(
        makeStage('persist', ['draft'], async (ctx) => {
          ctx.data.persistedContent = ctx.data.draftContent + ' (persisted)';
        })
      );

      const ctx = makeContext();
      await scheduler.execute(['persist'], ctx);

      expect(ctx.data.draftContent).toBe('Hello world');
      expect(ctx.data.persistedContent).toBe('Hello world (persisted)');
    });

    it('respects disabled stages during execution', async () => {
      const calls: string[] = [];
      scheduler.registerStage(
        makeStage('draft', [], async () => {
          calls.push('draft');
        })
      );
      scheduler.registerStage(
        makeStage('audit', ['draft'], async () => {
          calls.push('audit');
        })
      );
      scheduler.registerStage(
        makeStage('persist', ['audit'], async () => {
          calls.push('persist');
        })
      );

      scheduler.disableStage('audit');

      const result = await scheduler.execute(['persist'], makeContext());
      // persist depends on audit (disabled) → persist should not run
      // draft should still run (it's reachable and has no disabled deps)
      expect(calls).toEqual(['draft']);
      expect(result.success).toBe(true);
      // persist should be skipped
      expect(
        result.stages.some((s) => s.id === 'persist' && s.status === StageStatus.Skipped)
      ).toBe(true);
      // audit should be skipped
      expect(result.stages.some((s) => s.id === 'audit' && s.status === StageStatus.Skipped)).toBe(
        true
      );
    });

    it('returns timing information', async () => {
      scheduler.registerStage(makeStage('fast', [], async () => {}));

      const result = await scheduler.execute(['fast'], makeContext());

      expect(result.success).toBe(true);
      expect(result.stages.length).toBe(1);
      expect(result.stages[0].id).toBe('fast');
      expect(result.stages[0].status).toBe(StageStatus.Completed);
      expect(result.stages[0].durationMs).toBeGreaterThanOrEqual(0);
    });

    it('returns skipped stages in result', async () => {
      scheduler.registerStage(makeStage('draft', []));
      scheduler.registerStage(makeStage('audit', ['draft']));
      scheduler.registerStage(makeStage('persist', ['audit']));

      scheduler.disableStage('audit');

      const result = await scheduler.execute(['persist'], makeContext());

      const skippedIds = result.stages
        .filter((s) => s.status === StageStatus.Skipped)
        .map((s) => s.id);
      // persist should be skipped since its dependency is disabled
      expect(skippedIds).toContain('persist');
      expect(skippedIds).toContain('audit');
    });
  });

  // ── Pipeline Presets ────────────────────────────────────────

  describe('presets', () => {
    it('full pipeline includes all stages', () => {
      const config = PipelineScheduler.createFullPipeline();

      expect(config.stages.length).toBeGreaterThan(0);
      expect(config.stages.map((s) => s.id)).toContain('context_card');
      expect(config.stages.map((s) => s.id)).toContain('draft');
      expect(config.stages.map((s) => s.id)).toContain('audit');
      expect(config.stages.map((s) => s.id)).toContain('persist');
    });

    it('draft pipeline skips audit', () => {
      const config = PipelineScheduler.createDraftPipeline();

      expect(config.stages.map((s) => s.id)).toContain('draft');
      expect(config.stages.map((s) => s.id)).toContain('persist');
      // Audit should be disabled
      expect(config.disabledStages).toContain('audit');
    });

    it('fast draft pipeline has minimal stages', () => {
      const config = PipelineScheduler.createFastDraftPipeline();

      // Fast draft: only context + draft, no audit, no persist
      expect(config.stages.map((s) => s.id)).toContain('draft');
      expect(config.disabledStages).toContain('audit');
      expect(config.disabledStages).toContain('persist');
    });

    it('can load preset config and execute', async () => {
      const config = PipelineScheduler.createDraftPipeline();
      const scheduler = new PipelineScheduler();

      for (const stage of config.stages) {
        scheduler.registerStage(stage);
      }
      for (const id of config.disabledStages) {
        scheduler.disableStage(id);
      }

      const result = await scheduler.execute(['persist'], makeContext());
      expect(result.success).toBe(true);
    });
  });

  // ── getStageInfo ────────────────────────────────────────────

  describe('getStageInfo', () => {
    it('returns all registered stages with status', () => {
      scheduler.registerStage(makeStage('draft'));
      scheduler.registerStage(makeStage('audit', ['draft']));

      const info = scheduler.getStageInfo();

      expect(info.length).toBe(2);
      expect(info.find((s) => s.id === 'draft')?.enabled).toBe(true);
      expect(info.find((s) => s.id === 'audit')?.enabled).toBe(true);
    });

    it('shows disabled stages as disabled', () => {
      scheduler.registerStage(makeStage('draft'));
      scheduler.registerStage(makeStage('audit', ['draft']));

      scheduler.disableStage('audit');

      const info = scheduler.getStageInfo();
      expect(info.find((s) => s.id === 'audit')?.enabled).toBe(false);
    });
  });
});
