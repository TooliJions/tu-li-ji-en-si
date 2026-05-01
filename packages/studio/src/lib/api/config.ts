import type {
  CreateInspirationSeedInput,
  CreatePlanningBriefInput,
  UpdatePlanningBriefPatch,
  CreateStoryBlueprintInput,
  UpdateStoryBlueprintPatch,
  StoryBlueprint,
} from '@cybernovelist/core';

export async function fetchConfig() {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error('获取配置失败');
  const data = await res.json();
  return data.data;
}

export async function updateConfig(config: object) {
  const res = await fetch('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error('更新配置失败');
  const data = await res.json();
  return data.data;
}

export async function testProvider(provider: {
  name: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}) {
  const res = await fetch('/api/config/test-provider', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(provider),
  });
  const data = await res.json();
  return data.data;
}

export async function testNotification(config: { telegramToken: string; chatId: string }) {
  const res = await fetch('/api/config/test-notification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  const data = await res.json();
  return data.data;
}

export async function fetchAvailableModels() {
  const res = await fetch('/api/config/available-models');
  if (!res.ok) throw new Error('获取可用模型列表失败');
  const data = await res.json();
  return data.data;
}

export async function fetchModelsFromProvider(provider: {
  name: string;
  apiKey: string;
  baseUrl: string;
}) {
  const res = await fetch('/api/config/fetch-models', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(provider),
  });
  if (!res.ok) throw new Error('获取模型列表失败');
  const data = await res.json();
  return data.data;
}

export async function fetchDoctorStatus() {
  const res = await fetch('/api/system/doctor');
  if (!res.ok) throw new Error('获取诊断信息失败');
  const data = await res.json();
  return data.data;
}

export async function fixLocks() {
  const res = await fetch('/api/system/doctor/fix-locks', { method: 'POST' });
  const data = await res.json();
  return data.data;
}

export async function reorgRecovery(bookId?: string) {
  const res = await fetch('/api/system/doctor/reorg-recovery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bookId ? { bookId } : {}),
  });
  const data = await res.json();
  return data.data;
}

export async function fetchStateDiff(file: string) {
  const res = await fetch(`/api/system/state-diff?file=${file}`);
  if (!res.ok) throw new Error('获取状态差异失败');
  const data = await res.json();
  return data.data;
}

export async function fetchEnvInfo() {
  const res = await fetch('/api/system/doctor/env');
  if (!res.ok) throw new Error('获取环境信息失败');
  const data = await res.json();
  return data.data;
}

export async function fixAllIssues() {
  const res = await fetch('/api/system/doctor/fix-all', { method: 'POST' });
  const data = await res.json();
  return data.data;
}

export async function fetchTruthFiles(bookId: string) {
  const res = await fetch(`/api/books/${bookId}/state`);
  if (!res.ok) throw new Error('获取真相文件列表失败');
  const data = await res.json();
  return data.data;
}

export async function fetchTruthFile(bookId: string, fileName: string) {
  const res = await fetch(`/api/books/${bookId}/state/${fileName}`);
  if (!res.ok) throw new Error('获取真相文件失败');
  const data = await res.json();
  return data.data;
}

export async function updateTruthFile(
  bookId: string,
  fileName: string,
  content: string,
  versionToken: number,
) {
  const res = await fetch(`/api/books/${bookId}/state/${fileName}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, versionToken }),
  });
  if (!res.ok) throw new Error('更新真相文件失败');
  const data = await res.json();
  return data.data;
}

export async function fetchProjectionStatus(bookId: string) {
  const res = await fetch(`/api/books/${bookId}/state/projection-status`);
  if (!res.ok) throw new Error('获取投影状态失败');
  const data = await res.json();
  return data.data;
}

export async function importMarkdown(bookId: string, fileName: string, markdownContent: string) {
  const res = await fetch(`/api/books/${bookId}/state/import-markdown`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, markdownContent }),
  });
  if (!res.ok) throw new Error('导入 Markdown 失败');
  const data = await res.json();
  return data.data;
}

export type InspirationSeedDocument = import('@cybernovelist/core').InspirationSeed;
export type PlanningBriefDocument = import('@cybernovelist/core').PlanningBrief;

export async function fetchInspirationSeed(bookId: string) {
  const res = await fetch(`/api/books/${bookId}/inspiration`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.data as InspirationSeedDocument | null;
}

export async function createInspirationSeed(bookId: string, payload: CreateInspirationSeedInput) {
  const res = await fetch(`/api/books/${bookId}/inspiration`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('创建灵感输入失败');
  const data = await res.json();
  return data.data as InspirationSeedDocument;
}

export async function updateInspirationSeed(
  bookId: string,
  payload: Partial<CreateInspirationSeedInput>,
) {
  const res = await fetch(`/api/books/${bookId}/inspiration`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('更新灵感输入失败');
  const data = await res.json();
  return data.data as InspirationSeedDocument;
}

export async function fetchPlanningBrief(bookId: string) {
  const res = await fetch(`/api/books/${bookId}/planning-brief`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.data as PlanningBriefDocument | null;
}

export async function createPlanningBrief(
  bookId: string,
  payload: Omit<CreatePlanningBriefInput, 'seedId'>,
) {
  const res = await fetch(`/api/books/${bookId}/planning-brief`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('创建规划简报失败');
  const data = await res.json();
  return data.data as PlanningBriefDocument;
}

export async function updatePlanningBrief(bookId: string, payload: UpdatePlanningBriefPatch) {
  const res = await fetch(`/api/books/${bookId}/planning-brief`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('更新规划简报失败');
  const data = await res.json();
  return data.data as PlanningBriefDocument;
}

export async function fetchStoryOutline(bookId: string) {
  const res = await fetch(`/api/books/${bookId}/story-outline`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.data as StoryBlueprint | null;
}

export async function createStoryOutline(
  bookId: string,
  payload: Omit<CreateStoryBlueprintInput, 'planningBriefId'>,
) {
  const res = await fetch(`/api/books/${bookId}/story-outline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('创建故事总纲失败');
  const data = await res.json();
  return data.data as StoryBlueprint;
}

export async function updateStoryOutline(bookId: string, payload: UpdateStoryBlueprintPatch) {
  const res = await fetch(`/api/books/${bookId}/story-outline`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('更新故事总纲失败');
  const data = await res.json();
  return data.data as StoryBlueprint;
}
