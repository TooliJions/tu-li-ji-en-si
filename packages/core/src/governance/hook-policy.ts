import * as fs from 'fs';

// ─── Types ─────────────────────────────────────────────────────────

export interface WakePolicy {
  maxWakePerChapter: number;
  wakeBatchSize: number;
  wakeInterval: number;
  autoWakeEnabled: boolean;
}

export interface ResolutionWindow {
  min: number;
  max: number;
}

export interface HookPolicyConfig {
  maxActiveHooks?: number;
  overdueThreshold?: number;
  expectedResolutionWindow?: ResolutionWindow;
  wakePolicy?: Partial<WakePolicy>;
}

export interface HookPolicyStatus {
  maxActiveHooks: number;
  overdueThreshold: number;
  expectedResolutionWindow: ResolutionWindow;
  wakePolicy: WakePolicy;
}

interface WakeCandidate {
  id: string;
  priority: 'critical' | 'major' | 'minor';
  plantedChapter: number;
}

// ─── Defaults ──────────────────────────────────────────────────────

const DEFAULT_MAX_ACTIVE_HOOKS = 10;
const DEFAULT_OVERDUE_THRESHOLD = 5;
const DEFAULT_RESOLUTION_WINDOW: ResolutionWindow = { min: 3, max: 15 };
const DEFAULT_WAKE_POLICY: WakePolicy = {
  maxWakePerChapter: 3,
  wakeBatchSize: 2,
  wakeInterval: 1,
  autoWakeEnabled: true,
};

const PRIORITY_ORDER: Record<string, number> = { critical: 0, major: 1, minor: 2 };

// ─── HookPolicy ──────────────────────────────────────────────────
/**
 * 伏笔策略配置层。
 * 提供：
 *   - 最大活跃伏笔数
 *   - 逾期阈值
 *   - 预期回收窗口
 *   - 唤醒策略（WakePolicy）
 * 影响 HookAgenda、HookGovernance、HookArbiter 的行为。
 */
export class HookPolicy {
  private config: HookPolicyStatus;

  constructor(config?: HookPolicyConfig) {
    this.config = HookPolicy.#buildConfig(config ?? {});
    HookPolicy.#validate(this.config);
  }

  // ── Getters ───────────────────────────────────────────────────

  get maxActiveHooks(): number {
    return this.config.maxActiveHooks;
  }

  get overdueThreshold(): number {
    return this.config.overdueThreshold;
  }

  get expectedResolutionWindow(): ResolutionWindow {
    return this.config.expectedResolutionWindow;
  }

  get wakePolicy(): WakePolicy {
    return { ...this.config.wakePolicy };
  }

  // ── Behavioral Methods ────────────────────────────────────────

  /**
   * 检查是否可以接纳新伏笔（基于当前活跃伏笔数）。
   */
  canAdmitHook({ activeCount }: { activeCount: number }): boolean {
    return activeCount < this.config.maxActiveHooks;
  }

  /**
   * 判断伏笔是否逾期（自埋设以来的章节数超过阈值）。
   */
  isOverdue({ chaptersSincePlanted }: { chaptersSincePlanted: number }): boolean {
    return chaptersSincePlanted > this.config.overdueThreshold;
  }

  /**
   * 判断当前章节是否在预期回收窗口内。
   * 窗口计算：plantedChapter + min <= currentChapter <= plantedChapter + max
   */
  isWithinResolutionWindow({
    currentChapter,
    plantedChapter,
  }: {
    currentChapter: number;
    plantedChapter: number;
  }): boolean {
    const { min, max } = this.config.expectedResolutionWindow;
    const distance = currentChapter - plantedChapter;
    return distance >= min && distance <= max;
  }

  /**
   * 从休眠伏笔中获取当前章节的唤醒候选列表。
   * 按优先级降序 + 埋设章号升序排序，限制为 maxWakePerChapter 个。
   */
  getWakeCandidates(
    dormantHooks: Array<{
      id: string;
      priority: 'critical' | 'major' | 'minor';
      plantedChapter: number;
    }>,
    currentChapter: number
  ): WakeCandidate[] {
    if (dormantHooks.length === 0) return [];

    const sorted = [...dormantHooks].sort((a, b) => {
      const pDiff = (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99);
      if (pDiff !== 0) return pDiff;
      return a.plantedChapter - b.plantedChapter;
    });

    const limit = this.config.wakePolicy.maxWakePerChapter;
    return sorted.slice(0, limit);
  }

  // ── Load / Save ───────────────────────────────────────────────

  /**
   * 保存策略到 JSON 文件。
   */
  save(filePath: string): void {
    const dir =
      filePath.substring(0, filePath.lastIndexOf('/')) ||
      filePath.substring(0, filePath.lastIndexOf('\\'));
    if (dir) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(this.config, null, 2), 'utf-8');
  }

  /**
   * 从 JSON 文件加载策略。
   */
  static load(filePath: string): HookPolicy {
    if (!fs.existsSync(filePath)) {
      throw new Error(`无法读取策略文件: ${filePath}`);
    }

    let parsed: Record<string, unknown>;
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`策略文件格式无效: ${filePath}`);
    }

    const config: HookPolicyConfig = {};
    if (typeof parsed.maxActiveHooks === 'number') config.maxActiveHooks = parsed.maxActiveHooks;
    if (typeof parsed.overdueThreshold === 'number')
      config.overdueThreshold = parsed.overdueThreshold;
    if (parsed.expectedResolutionWindow && typeof parsed.expectedResolutionWindow === 'object') {
      const w = parsed.expectedResolutionWindow as Record<string, number>;
      config.expectedResolutionWindow = { min: w.min, max: w.max };
    }
    if (parsed.wakePolicy && typeof parsed.wakePolicy === 'object') {
      const wp = parsed.wakePolicy as Record<string, unknown>;
      config.wakePolicy = {};
      if (typeof wp.maxWakePerChapter === 'number')
        config.wakePolicy.maxWakePerChapter = wp.maxWakePerChapter;
      if (typeof wp.wakeBatchSize === 'number') config.wakePolicy.wakeBatchSize = wp.wakeBatchSize;
      if (typeof wp.wakeInterval === 'number') config.wakePolicy.wakeInterval = wp.wakeInterval;
      if (typeof wp.autoWakeEnabled === 'boolean')
        config.wakePolicy.autoWakeEnabled = wp.autoWakeEnabled;
    }

    return new HookPolicy(config);
  }

  // ── Status / Update ───────────────────────────────────────────

  /**
   * 获取当前策略状态的快照。
   */
  getStatus(): HookPolicyStatus {
    return { ...this.config, wakePolicy: { ...this.config.wakePolicy } };
  }

  /**
   * 更新部分配置。
   */
  update(partial: HookPolicyConfig): void {
    const merged: HookPolicyStatus = {
      maxActiveHooks: partial.maxActiveHooks ?? this.config.maxActiveHooks,
      overdueThreshold: partial.overdueThreshold ?? this.config.overdueThreshold,
      expectedResolutionWindow:
        partial.expectedResolutionWindow ?? this.config.expectedResolutionWindow,
      wakePolicy: partial.wakePolicy
        ? { ...this.config.wakePolicy, ...partial.wakePolicy }
        : { ...this.config.wakePolicy },
    };
    HookPolicy.#validate(merged);
    this.config = merged;
  }

  // ── Internal ──────────────────────────────────────────────────

  static #buildConfig(partial: HookPolicyConfig): HookPolicyStatus {
    return {
      maxActiveHooks: partial.maxActiveHooks ?? DEFAULT_MAX_ACTIVE_HOOKS,
      overdueThreshold: partial.overdueThreshold ?? DEFAULT_OVERDUE_THRESHOLD,
      expectedResolutionWindow: partial.expectedResolutionWindow ?? {
        ...DEFAULT_RESOLUTION_WINDOW,
      },
      wakePolicy: partial.wakePolicy
        ? { ...DEFAULT_WAKE_POLICY, ...partial.wakePolicy }
        : { ...DEFAULT_WAKE_POLICY },
    };
  }

  static #validate(config: HookPolicyStatus): void {
    if (config.maxActiveHooks <= 0) {
      throw new Error(`maxActiveHooks 必须大于 0，当前值: ${config.maxActiveHooks}`);
    }
    if (config.overdueThreshold < 0) {
      throw new Error(`overdueThreshold 不能为负数，当前值: ${config.overdueThreshold}`);
    }
    if (config.expectedResolutionWindow.min > config.expectedResolutionWindow.max) {
      throw new Error(
        `expectedResolutionWindow.min (${config.expectedResolutionWindow.min}) 不能大于 max (${config.expectedResolutionWindow.max})`
      );
    }
    if (config.wakePolicy.maxWakePerChapter <= 0) {
      throw new Error(
        `wakePolicy.maxWakePerChapter 必须大于 0，当前值: ${config.wakePolicy.maxWakePerChapter}`
      );
    }
    if (config.wakePolicy.wakeBatchSize <= 0) {
      throw new Error(
        `wakePolicy.wakeBatchSize 必须大于 0，当前值: ${config.wakePolicy.wakeBatchSize}`
      );
    }
    if (config.wakePolicy.wakeInterval <= 0) {
      throw new Error(
        `wakePolicy.wakeInterval 必须大于 0，当前值: ${config.wakePolicy.wakeInterval}`
      );
    }
  }
}
