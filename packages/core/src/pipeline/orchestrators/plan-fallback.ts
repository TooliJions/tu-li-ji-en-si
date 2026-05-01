import type { BaseAgent } from '../../agents/base';
import type {
  ChapterPlan,
  ChapterPlanResult,
  ChapterPlanBrief,
} from '../../agents/chapter-planner';
import type { PlanChapterInput } from '../types';

export async function fallbackSinglePlan(
  chapterPlanner: BaseAgent,
  promptContextBase: Record<string, unknown>,
  input: PlanChapterInput,
): Promise<ChapterPlan> {
  const result = await chapterPlanner.execute({
    bookId: input.bookId,
    chapterId: input.chapterNumber,
    promptContext: promptContextBase,
  });

  if (result.success && result.data) {
    const data = result.data as Record<string, unknown>;
    if ('plan' in data) {
      return (data as unknown as ChapterPlanResult).plan;
    }
  }

  return {
    chapterNumber: input.chapterNumber,
    title: `第${input.chapterNumber}章`,
    intention: '推进主线情节',
    wordCountTarget: (promptContextBase.brief as ChapterPlanBrief).wordCountTarget ?? 3000,
    characters: [],
    keyEvents: ['情节推进'],
    hooks: [],
    worldRules: [],
    emotionalBeat: '平稳推进',
    sceneTransition: '自然过渡',
    openingHook: '以动作或悬念开篇',
    closingHook: '留下悬念引向下一章',
    sceneBreakdown: [
      {
        title: '主场景',
        description: '推进情节发展',
        characters: [],
        mood: '平稳',
        wordCount: (promptContextBase.brief as ChapterPlanBrief).wordCountTarget ?? 3000,
      },
    ],
    characterGrowthBeat: '',
    hookActions: [],
    pacingTag: 'slow_build',
  };
}
