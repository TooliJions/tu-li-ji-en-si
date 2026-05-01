import type { Hook } from '../models/state';

// ─── Types ─────────────────────────────────────────────────────────

export interface IntentResult {
  success: boolean;
  hookId: string;
  reason?: string;
}

export interface WakeResult {
  success: boolean;
  hookId: string;
  newStatus: string;
  reason?: string;
}

export interface DormantResult {
  success: boolean;
  hookId: string;
  newStatus: string;
  reason?: string;
}

// ─── IntentDeclaration ─────────────────────────────────────────────
/**
 * 人工意图声明模块。
 * 负责：
 *   - declareIntent: 设置预期回收窗口，可选择同时标记为休眠
 *   - markDormant: 人工标记伏笔为休眠状态
 *   - wakeUp: 唤醒休眠伏笔
 */
export class IntentDeclaration {
  /**
   * 人工意图声明：设置预期回收窗口，可选择同时标记为休眠。
   * 与 markDormant 的区别：
   *   - declareIntent 侧重设置窗口（不一定休眠）
   *   - markDormant 侧重标记休眠（窗口可选）
   * resolved/abandoned 伏笔只允许更新窗口，不允许标记休眠。
   */
  declareIntent(
    hook: Hook,
    options: {
      min?: number;
      max?: number;
      setDormant?: boolean;
    },
  ): IntentResult {
    const { min, max, setDormant } = options;

    // Validation
    if (min !== undefined && max !== undefined && min > max) {
      return { success: false, hookId: hook.id, reason: '预期回收窗口最小值不能大于最大值' };
    }
    if (min !== undefined && min <= 0) {
      return { success: false, hookId: hook.id, reason: '预期回收窗口最小值必须大于 0' };
    }
    if (max !== undefined && max <= 0) {
      return { success: false, hookId: hook.id, reason: '预期回收窗口最大值必须大于 0' };
    }

    // resolved/abandoned hooks can only update window, not status
    const isTerminal = hook.status === 'resolved' || hook.status === 'abandoned';
    if (isTerminal && setDormant) {
      return {
        success: false,
        hookId: hook.id,
        reason: `伏笔状态「${hook.status}」无法标记为休眠`,
      };
    }

    // Apply changes
    if (min !== undefined) hook.expectedResolutionMin = min;
    if (max !== undefined) hook.expectedResolutionMax = max;
    if (setDormant && !isTerminal) {
      hook.status = 'dormant';
    }
    hook.updatedAt = new Date().toISOString();

    return { success: true, hookId: hook.id };
  }

  /**
   * 人工标记伏笔为休眠状态。
   * 休眠伏笔不参与排班和逾期检测，直到被唤醒。
   */
  markDormant(
    hook: Hook,
    options?: {
      expectedResolutionMin?: number;
      expectedResolutionMax?: number;
    },
  ): DormantResult {
    if (hook.status === 'resolved' || hook.status === 'abandoned') {
      return {
        success: false,
        hookId: hook.id,
        newStatus: hook.status,
        reason: `伏笔状态「${hook.status}」无法标记为休眠`,
      };
    }

    // Update hook fields
    hook.status = 'dormant';
    if (options?.expectedResolutionMin !== undefined) {
      hook.expectedResolutionMin = options.expectedResolutionMin;
    }
    if (options?.expectedResolutionMax !== undefined) {
      hook.expectedResolutionMax = options.expectedResolutionMax;
    }
    hook.updatedAt = new Date().toISOString();

    return {
      success: true,
      hookId: hook.id,
      newStatus: 'dormant',
    };
  }

  /**
   * 唤醒休眠伏笔。
   * 从 dormant 状态恢复到 open 或 progressing。
   * 可同时设置预期回收窗口。
   */
  wakeUp(
    hook: Hook,
    targetStatus: 'open' | 'progressing' = 'open',
    options?: { min?: number; max?: number },
  ): WakeResult {
    if (hook.status !== 'dormant') {
      return {
        success: false,
        hookId: hook.id,
        newStatus: hook.status,
        reason: `只有休眠状态的伏笔才能唤醒，当前状态：${hook.status}`,
      };
    }

    hook.status = targetStatus;
    if (options?.min !== undefined) hook.expectedResolutionMin = options.min;
    if (options?.max !== undefined) hook.expectedResolutionMax = options.max;
    hook.updatedAt = new Date().toISOString();

    return { success: true, hookId: hook.id, newStatus: targetStatus };
  }
}
