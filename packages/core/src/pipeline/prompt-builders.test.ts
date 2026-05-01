import { describe, it, expect } from 'vitest';
import { buildDraftPrompt, buildAgentDraftPrompt } from './prompt-builders';
import type { WriteNextChapterInput } from './types';
import type { ChapterPlan } from '../agents/chapter-planner';

describe('prompt-builders', () => {
  // ── buildDraftPrompt ──────────────────────────────────────────

  describe('buildDraftPrompt', () => {
    it('生成包含基本信息的 prompt', () => {
      const prompt = buildDraftPrompt({
        bookId: 'book-1',
        chapterNumber: 1,
        title: '第一章',
        genre: 'xianxia',
        sceneDescription: '主角登场',
      });
      expect(prompt).toContain('第一章');
      expect(prompt).toContain('xianxia');
      expect(prompt).toContain('主角登场');
    });

    it('包含上一章内容参考', () => {
      const prompt = buildDraftPrompt({
        bookId: 'book-1',
        chapterNumber: 2,
        title: '第二章',
        genre: 'xianxia',
        sceneDescription: '继续冒险',
        previousChapterContent: '上一章的内容很长很长...',
      });
      expect(prompt).toContain('上一章内容参考');
    });

    it('不包含上一章内容参考当未提供时', () => {
      const prompt = buildDraftPrompt({
        bookId: 'book-1',
        chapterNumber: 1,
        title: '第一章',
        genre: 'xianxia',
        sceneDescription: '主角登场',
      });
      expect(prompt).not.toContain('上一章内容参考');
    });
  });

  // ── buildAgentDraftPrompt ─────────────────────────────────────

  describe('buildAgentDraftPrompt', () => {
    const baseInput: WriteNextChapterInput = {
      bookId: 'book-1',
      chapterNumber: 1,
      genre: 'xianxia',
      userIntent: '写一场精彩的战斗',
    };

    const basePlan: ChapterPlan = {
      title: '初试锋芒',
      intention: '展示主角实力',
      wordCountTarget: 3000,
      characters: ['林风', '反派A'],
      keyEvents: ['主角展示实力'],
      hooks: [],
      worldRules: [],
      emotionalBeat: '紧张',
      sceneTransition: '直接切换',
    };

    it('生成包含章节计划的 prompt', () => {
      const prompt = buildAgentDraftPrompt(baseInput, basePlan, '上下文', '简介');
      expect(prompt).toContain('初试锋芒');
      expect(prompt).toContain('林风');
      expect(prompt).toContain('3000');
    });

    it('包含场景分解指令', () => {
      const plan: ChapterPlan = {
        ...basePlan,
        sceneBreakdown: [
          {
            title: '开场',
            description: '主角登场',
            wordCount: 1000,
            characters: ['林风'],
            mood: '平静',
          },
        ],
      };
      const prompt = buildAgentDraftPrompt(baseInput, plan, '上下文', '简介');
      expect(prompt).toContain('场景分解');
      expect(prompt).toContain('开场');
    });

    it('包含伏笔动作指令', () => {
      const plan: ChapterPlan = {
        ...basePlan,
        hookActions: [{ action: 'plant', description: '埋下神秘玉佩的伏笔', priority: 'major' }],
      };
      const prompt = buildAgentDraftPrompt(baseInput, plan, '上下文', '简介');
      expect(prompt).toContain('伏笔动作');
      expect(prompt).toContain('埋设');
    });

    it('处理空角色列表', () => {
      const plan: ChapterPlan = {
        ...basePlan,
        characters: [],
      };
      const prompt = buildAgentDraftPrompt(baseInput, plan, '上下文', '简介');
      expect(prompt).toContain('无');
    });

    it('包含开篇钩子和结尾悬念', () => {
      const plan: ChapterPlan = {
        ...basePlan,
        openingHook: '以悬念开头',
        closingHook: '以危机结束',
      };
      const prompt = buildAgentDraftPrompt(baseInput, plan, '上下文', '简介');
      expect(prompt).toContain('开篇钩子');
      expect(prompt).toContain('结尾悬念');
    });
  });
});
