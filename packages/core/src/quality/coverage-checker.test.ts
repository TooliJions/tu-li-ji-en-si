import { describe, it, expect } from 'vitest';
import { CoverageChecker, DEFAULT_COVERAGE_THRESHOLDS } from './coverage-checker';
import type { ChapterPlan } from '../agents/chapter-planner';

function buildPlan(overrides: Partial<ChapterPlan> = {}): ChapterPlan {
  return {
    chapterNumber: 1,
    title: '测试章节',
    intention: '测试意图',
    wordCountTarget: 3000,
    characters: ['林风', '老猎人'],
    keyEvents: ['林风发现玉佩', '老猎人讲述修仙'],
    hooks: [{ description: '神秘玉佩的来历', type: 'narrative', priority: 'critical' }],
    worldRules: ['修炼分为炼气、筑基、金丹三个阶段'],
    emotionalBeat: '平静→好奇→向往',
    sceneTransition: '从山村到修仙',
    sceneBreakdown: [
      {
        title: '山中猎行',
        description: '林风独自进山打猎',
        characters: ['林风'],
        mood: '平静',
        wordCount: 800,
      },
      {
        title: '洞穴奇遇',
        description: '发现玉佩发光',
        characters: ['林风'],
        mood: '惊奇',
        wordCount: 1000,
      },
    ],
    hookActions: [{ action: 'plant', description: '玉佩首次展露异常' }],
    ...overrides,
  };
}

describe('CoverageChecker', () => {
  it('全要素覆盖时应通过', () => {
    const checker = new CoverageChecker();
    const content = `
      林风独自进山打猎，在山中发现了一枚玉佩。
      老猎人讲述修仙世界的奥秘，提到修炼分为炼气、筑基、金丹三个阶段。
      林风心中充满了好奇和向往。
      这枚神秘玉佩的来历似乎并不简单，它首次展露异常的光芒。
      林风进入洞穴，发现玉佩在发光。
    `;

    const report = checker.check(content, buildPlan());
    expect(report.pass).toBe(true);
    expect(report.dimensions.every((d) => d.pass)).toBe(true);
  });

  it('缺失角色时应未通过角色覆盖', () => {
    const checker = new CoverageChecker();
    const content = '林风独自在山中行走，发现了一枚玉佩。';

    const report = checker.check(content, buildPlan());
    const charDim = report.dimensions.find((d) => d.name === '角色覆盖');
    expect(charDim?.pass).toBe(false);
    expect(charDim?.missed).toContain('老猎人');
    expect(report.pass).toBe(false);
  });

  it('缺失关键事件时应未通过事件覆盖', () => {
    const checker = new CoverageChecker();
    // 只包含一个关键事件，另一个故意缺失；注意避免 "老猎人" 被分词命中
    const content = '林风独自在山里行走，忽然发现了一枚玉佩。';

    const report = checker.check(content, buildPlan());
    const eventDim = report.dimensions.find((d) => d.name === '关键事件覆盖');
    expect(eventDim?.pass).toBe(false);
    expect(eventDim?.missed).toContain('老猎人讲述修仙');
  });

  it('缺失伏笔时应未通过伏笔覆盖', () => {
    const checker = new CoverageChecker();
    const content = '林风和老猎人在山中行走，讨论修炼的境界。';

    const report = checker.check(content, buildPlan());
    const hookDim = report.dimensions.find((d) => d.name === '伏笔覆盖');
    expect(hookDim?.pass).toBe(false);
    expect(hookDim?.missed).toContain('神秘玉佩的来历');
  });

  it('缺失场景时应未通过场景分解覆盖', () => {
    const checker = new CoverageChecker();
    // 只命中 "山中猎行"，避免命中 "洞穴奇遇"
    const content = 'This is completely unrelated content in English.';

    const report = checker.check(content, buildPlan());
    const sceneDim = report.dimensions.find((d) => d.name === '场景分解覆盖');
    expect(sceneDim?.pass).toBe(false);
    expect(sceneDim?.missed).toContain('洞穴奇遇');
    expect(sceneDim?.missed).toContain('山中猎行');
  });

  it('缺失情感节拍时应未通过情感节拍覆盖', () => {
    const checker = new CoverageChecker();
    // 完全避免出现 "平静""好奇""向往" 等情感词
    const content = '林风在山中行走，天色渐暗，他加快了脚步。';

    const report = checker.check(content, buildPlan());
    const beatDim = report.dimensions.find((d) => d.name === '情感节拍覆盖');
    expect(beatDim?.pass).toBe(false);
    expect(beatDim?.missed.length).toBeGreaterThan(0);
  });

  it('情感节拍支持中文顿号分隔写法', () => {
    const checker = new CoverageChecker();
    const content = '林尘心里紧张，却很快稳住呼吸，下定决心以智慧破局。';

    const report = checker.check(
      content,
      buildPlan({
        emotionalBeat: '紧张、决心、智慧',
      }),
    );

    const beatDim = report.dimensions.find((d) => d.name === '情感节拍覆盖');
    expect(beatDim?.total).toBe(3);
    expect(beatDim?.covered).toBe(3);
    expect(beatDim?.pass).toBe(true);
  });

  it('空 plan 时应全部通过', () => {
    const checker = new CoverageChecker();
    const content = '这是一段任意内容。';
    const plan = buildPlan({
      characters: [],
      keyEvents: [],
      hooks: [],
      worldRules: [],
      sceneBreakdown: [],
      emotionalBeat: '',
    });

    const report = checker.check(content, plan);
    expect(report.pass).toBe(true);
    expect(report.dimensions.every((d) => d.pass)).toBe(true);
  });

  it('summary 应包含未通过项', () => {
    const checker = new CoverageChecker();
    const content = '一段与计划无关的内容。';

    const report = checker.check(content, buildPlan());
    expect(report.summary).toContain('未通过');
    expect(report.summary).toContain('角色覆盖');
  });

  it('自定义阈值应生效', () => {
    const checker = new CoverageChecker({
      ...DEFAULT_COVERAGE_THRESHOLDS,
      characterCoverageMin: 1.0, // 要求 100% 角色覆盖
    });
    // 只出现一位角色，故意缺失 "老猎人"
    const content = '林风独自在山中行走。';

    const report = checker.check(content, buildPlan());
    const charDim = report.dimensions.find((d) => d.name === '角色覆盖');
    expect(charDim?.pass).toBe(false);
  });

  it('字数统计应准确', () => {
    const checker = new CoverageChecker();
    const content = '林风发现玉佩，老猎人讲述修仙世界。';

    const report = checker.check(content, buildPlan({ wordCountTarget: 10 }));
    expect(report.wordCount).toBe(15); // 15 汉字 + 0 英文词
    expect(report.wordCountRatio).toBe(1.5);
  });

  it('事件顺序检测：关键事件应按大纲顺序出现', () => {
    // 当前 CoverageChecker 不直接检测顺序，但 keyEvents 覆盖检测会使用 earliest match
    // 这里测试的是：如果内容中同时包含两个事件，它们都被检测到
    const checker = new CoverageChecker();
    const content = '林风发现玉佩后，老猎人讲述修仙。';

    const report = checker.check(content, buildPlan());
    const eventDim = report.dimensions.find((d) => d.name === '关键事件覆盖');
    expect(eventDim?.covered).toBe(2);
    expect(eventDim?.pass).toBe(true);
  });
});
