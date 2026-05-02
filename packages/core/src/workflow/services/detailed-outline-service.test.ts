import { describe, expect, it } from 'vitest';
import { DefaultDetailedOutlineService } from './detailed-outline-service';
import type { CreateDetailedOutlineInput } from '../contracts/detailed-outline';

function buildValidInput(): CreateDetailedOutlineInput {
  return {
    storyBlueprintId: 'outline_test',
    totalChapters: 3,
    estimatedTotalWords: '20 万字',
    volumes: [
      {
        volumeNumber: 1,
        title: '启程立势',
        arcSummary: '主角从外门弟子觉醒血脉,初步立足。',
        chapterCount: 3,
        startChapter: 1,
        endChapter: 3,
        chapters: [
          {
            chapterNumber: 1,
            title: '考核日',
            wordCountTarget: '3500',
            sceneSetup: '宗门外门考核现场',
            charactersPresent: ['林辰'],
            coreEvents: ['血脉觉醒'],
            emotionArc: '紧张到爆发',
            chapterEndHook: '黑影浮现',
            foreshadowingOps: [],
            keyDialogueHints: [],
            writingNotes: '',
            contextForWriter: {
              storyProgress: '故事开端,主角即将参加宗门考核。',
              chapterPositionNote: '本卷第 1/3 章',
              characterStates: [],
              activeWorldRules: [],
              activeForeshadowingStatus: [],
              precedingChapterBridge: {
                cliffhanger: '',
                emotionalCarry: '',
                unresolvedTension: '',
              },
              nextChapterSetup: { seedForNext: '', expectedDevelopment: '' },
            },
          },
          {
            chapterNumber: 2,
            title: '导师传授',
            wordCountTarget: '3500',
            sceneSetup: '后山秘境',
            charactersPresent: ['林辰', '玄风长老'],
            coreEvents: ['获得指引'],
            emotionArc: '激动',
            chapterEndHook: '',
            foreshadowingOps: [],
            keyDialogueHints: [],
            writingNotes: '',
            contextForWriter: {
              storyProgress: '主角获得宗门长老的暗中传授。',
              chapterPositionNote: '本卷第 2/3 章',
              characterStates: [],
              activeWorldRules: [],
              activeForeshadowingStatus: [],
              precedingChapterBridge: {
                cliffhanger: '',
                emotionalCarry: '',
                unresolvedTension: '',
              },
              nextChapterSetup: { seedForNext: '', expectedDevelopment: '' },
            },
          },
          {
            chapterNumber: 3,
            title: '亡命突围',
            wordCountTarget: '3500',
            sceneSetup: '林间小径',
            charactersPresent: ['林辰'],
            coreEvents: ['首次胜利'],
            emotionArc: '危机到爆发',
            chapterEndHook: '黑影逼近',
            foreshadowingOps: [],
            keyDialogueHints: [],
            writingNotes: '',
            contextForWriter: {
              storyProgress: '主角面对宗门追杀,初次展示血脉力量。',
              chapterPositionNote: '本卷第 3/3 章',
              characterStates: [],
              activeWorldRules: [],
              activeForeshadowingStatus: [],
              precedingChapterBridge: {
                cliffhanger: '',
                emotionalCarry: '',
                unresolvedTension: '',
              },
              nextChapterSetup: { seedForNext: '', expectedDevelopment: '' },
            },
          },
        ],
      },
    ],
  };
}

describe('DefaultDetailedOutlineService', () => {
  it('creates a valid detailed outline', () => {
    const service = new DefaultDetailedOutlineService({
      idGenerator: () => 'detailed_test',
      now: () => '2026-05-02T03:00:00.000Z',
    });

    const outline = service.createOutline(buildValidInput());

    expect(outline.id).toBe('detailed_test');
    expect(outline.storyBlueprintId).toBe('outline_test');
    expect(outline.totalChapters).toBe(3);
    expect(outline.volumes).toHaveLength(1);
    expect(outline.volumes[0].chapters).toHaveLength(3);
    expect(outline.volumes[0].chapters[0].contextForWriter.storyProgress).toContain('故事开端');
  });

  it('returns chapter context by chapter number', () => {
    const service = new DefaultDetailedOutlineService({
      idGenerator: () => 'detailed_test',
      now: () => '2026-05-02T03:00:00.000Z',
    });

    const outline = service.createOutline(buildValidInput());
    const context2 = service.getChapterContext(outline, 2);

    expect(context2).not.toBeNull();
    expect(context2?.storyProgress).toContain('暗中传授');
  });

  it('returns null for chapter context when chapter does not exist', () => {
    const service = new DefaultDetailedOutlineService({
      idGenerator: () => 'detailed_test',
      now: () => '2026-05-02T03:00:00.000Z',
    });

    const outline = service.createOutline(buildValidInput());
    const context99 = service.getChapterContext(outline, 99);

    expect(context99).toBeNull();
  });

  it('updates outline volumes and refreshes timestamps', () => {
    const service = new DefaultDetailedOutlineService({
      idGenerator: () => 'detailed_test',
      now: () => '2026-05-02T03:00:00.000Z',
    });
    const outline = service.createOutline(buildValidInput());

    const updatedService = new DefaultDetailedOutlineService({
      idGenerator: () => 'detailed_test',
      now: () => '2026-05-02T04:00:00.000Z',
    });

    const updated = updatedService.updateOutline(outline, {
      estimatedTotalWords: '30 万字',
    });

    expect(updated.estimatedTotalWords).toBe('30 万字');
    expect(updated.updatedAt).toBe('2026-05-02T04:00:00.000Z');
  });
});
