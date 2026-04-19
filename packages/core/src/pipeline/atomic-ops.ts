import * as fs from 'fs';
import { StateManager } from '../state/manager';
import { RuntimeStateStore } from '../state/runtime-store';
import { LLMProvider, type LLMResponse } from '../llm/provider';

// ─── Config ──────────────────────────────────────────────────────

export interface AtomicOpsConfig {
  rootDir: string;
  provider: LLMProvider;
}

// ─── Operation Result ────────────────────────────────────────────

export interface AtomicOperationResult {
  success: boolean;
  operation: string;
  bookId: string;
  chapterNumber: number;
  content?: string;
  issues?: Array<{ severity: string; description: string }>;
  overallScore?: number;
  status?: 'pass' | 'fail';
  persisted?: boolean;
  error?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// ─── Input Types ─────────────────────────────────────────────────

export interface DraftChapterInput {
  bookId: string;
  chapterNumber: number;
  title: string;
  genre: string;
  sceneDescription: string;
  previousChapterContent?: string;
}

export interface AuditChapterInput {
  bookId: string;
  chapterNumber: number;
  content: string;
  genre: string;
}

export interface ReviseChapterInput {
  bookId: string;
  chapterNumber: number;
  content: string;
  genre: string;
  issues: Array<{ severity: string; description: string }>;
}

export interface PersistChapterInput {
  bookId: string;
  chapterNumber: number;
  title: string;
  content: string;
  status: 'draft' | 'final';
}

// ─── AtomicPipelineOps ──────────────────────────────────────────

export class AtomicPipelineOps {
  private stateManager: StateManager;
  private stateStore: RuntimeStateStore;
  private provider: LLMProvider;

  constructor(config: AtomicOpsConfig) {
    this.stateManager = new StateManager(config.rootDir);
    this.stateStore = new RuntimeStateStore(this.stateManager);
    this.provider = config.provider;
  }

  /**
   * draft_chapter：生成章节草稿，不持久化。
   */
  async draftChapter(input: DraftChapterInput): Promise<AtomicOperationResult> {
    try {
      const prompt = this.#buildDraftPrompt(input);
      const result = await this.provider.generate(prompt);

      return {
        success: true,
        operation: 'draft_chapter',
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        content: result.text,
        usage: result.usage,
      };
    } catch (error) {
      return {
        success: false,
        operation: 'draft_chapter',
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * audit_chapter：对章节内容进行质量审计。
   */
  async auditChapter(input: AuditChapterInput): Promise<AtomicOperationResult> {
    try {
      const prompt = this.#buildAuditPrompt(input);
      const auditResult = await this.provider.generateJSON<{
        issues: Array<{ severity: string; description: string }>;
        overallScore: number;
        status: 'pass' | 'fail';
        summary: string;
      }>(prompt);

      return {
        success: true,
        operation: 'audit_chapter',
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        issues: auditResult.issues,
        overallScore: auditResult.overallScore,
        status: auditResult.status,
      };
    } catch (error) {
      return {
        success: false,
        operation: 'audit_chapter',
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * revise_chapter：根据审计问题修订章节。
   */
  async reviseChapter(input: ReviseChapterInput): Promise<AtomicOperationResult> {
    try {
      const prompt = this.#buildRevisePrompt(input);
      const result = await this.provider.generate(prompt);

      return {
        success: true,
        operation: 'revise_chapter',
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        content: result.text,
        usage: result.usage,
      };
    } catch (error) {
      return {
        success: false,
        operation: 'revise_chapter',
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * persist_chapter：将章节持久化到文件系统并更新索引。
   */
  async persistChapter(input: PersistChapterInput): Promise<AtomicOperationResult> {
    try {
      const filePath = this.stateManager.getChapterFilePath(input.bookId, input.chapterNumber);

      const chapterMeta = `---
title: ${input.title}
chapter: ${input.chapterNumber}
status: ${input.status}
createdAt: ${new Date().toISOString()}
---

`;

      fs.writeFileSync(filePath, chapterMeta + input.content, 'utf-8');

      // 更新索引
      this.#updateIndex(input);

      return {
        success: true,
        operation: 'persist_chapter',
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        persisted: true,
      };
    } catch (error) {
      return {
        success: false,
        operation: 'persist_chapter',
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ── Internal: Prompts ─────────────────────────────────────────

  #buildDraftPrompt(input: DraftChapterInput): string {
    return `你是一位专业的网络小说作家。请根据以下信息撰写章节内容。

## 基本信息
- **章节**: 第 ${input.chapterNumber} 章 — ${input.title}
- **题材**: ${input.genre}
- **场景描述**: ${input.sceneDescription}
${input.previousChapterContent ? `\n## 上一章内容参考\n${input.previousChapterContent.substring(0, 500)}` : ''}

## 要求
1. 保持情节连贯性
2. 角色对话自然生动
3. 场景描写具体有画面感
4. 注意段落节奏，张弛有度
5. 保持题材风格统一

请直接输出正文内容。`;
  }

  #buildAuditPrompt(input: AuditChapterInput): string {
    return `你是一位专业的网络小说质量审计师。请对以下章节进行质量检测。

## 基本信息
- **章节**: 第 ${input.chapterNumber} 章
- **题材**: ${input.genre}

## 章节内容
${input.content.substring(0, 5000)}

## 检测要求
1. 检测逻辑连贯性
2. 检测角色一致性
3. 检测文风问题
4. 检测冗余和重复

请以 JSON 格式输出：
{
  "issues": [
    { "severity": "blocking|warning|suggestion", "description": "问题描述" }
  ],
  "overallScore": 85,
  "status": "pass|fail",
  "summary": "审计总结"
}`;
  }

  #buildRevisePrompt(input: ReviseChapterInput): string {
    return `请根据以下审计问题修订章节内容：

## 审计问题
${input.issues.map((i) => `- [${i.severity}] ${i.description}`).join('\n')}

## 题材
${input.genre}

## 当前内容
${input.content}

请修订后输出完整正文。`;
  }

  // ── Internal: Helpers ─────────────────────────────────────────

  #updateIndex(input: PersistChapterInput): void {
    const index = this.stateManager.readIndex(input.bookId);
    const existingChapter = index.chapters.find((c) => c.chapterNumber === input.chapterNumber);
    if (existingChapter) {
      existingChapter.status = input.status === 'final' ? 'written' : 'draft';
      existingChapter.writtenAt = new Date().toISOString();
    } else {
      index.chapters.push({
        chapterNumber: input.chapterNumber,
        title: input.title,
        status: input.status === 'final' ? 'written' : 'draft',
        writtenAt: new Date().toISOString(),
      });
    }
    index.totalChapters = index.chapters.length;
    index.updatedAt = new Date().toISOString();
    this.stateManager.writeIndex(input.bookId, index);

    // 更新 manifest
    const manifest = this.stateStore.loadManifest(input.bookId);
    if (input.chapterNumber > manifest.lastChapterWritten) {
      manifest.lastChapterWritten = input.chapterNumber;
    }
    this.stateStore.saveRuntimeStateSnapshot(input.bookId, manifest);
  }
}
