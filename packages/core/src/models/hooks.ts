// hooks.ts — 伏笔模型已迁移至 state.ts 中的 HookSchema
// 此文件保留作为向后兼容的 re-export

export { HookStatusSchema, HookPrioritySchema, HookSchema } from './state';

export type { Hook } from './state';
