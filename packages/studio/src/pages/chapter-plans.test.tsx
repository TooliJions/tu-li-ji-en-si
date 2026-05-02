import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ChapterPlansPage from './chapter-plans';
import * as api from '../lib/api';
import type { DetailedOutlineDocument, StoryBlueprintDocument } from '../lib/api';

vi.mock('../lib/api', () => ({
  fetchBook: vi.fn(),
  fetchStoryOutline: vi.fn(),
  fetchDetailedOutline: vi.fn(),
  generateDetailedOutline: vi.fn(),
}));

function buildMinimalBlueprint(): StoryBlueprintDocument {
  return {
    id: 'outline-1',
    planningBriefId: 'brief-1',
    meta: {
      novelType: 'xianxia',
      novelSubgenre: '',
      typeConfidence: 0.9,
      typeIsAuto: true,
      genderTarget: 'male',
      architectureMode: 'lotus_map',
      titleSuggestions: ['星辰剑帝'],
      estimatedWordCount: '200 万字',
      endingType: 'HE',
      oneLineSynopsis: '少年觉醒上古血脉。',
    },
    base: {
      sellingPoints: {
        coreSellingPoint: '逆袭',
        hookSentence: '宗门最弱的弟子身藏远古血脉。',
        auxiliarySellingPoints: [{ point: '热血对决', category: '情节爽感' }],
        differentiation: '',
        readerAppeal: '',
      },
      theme: {
        coreTheme: '逆袭与代价',
        proposition: '',
        narrativeArc: { opening: 'a', development: 'b', climax: 'c', resolution: 'd' },
        toneKeywords: ['热血', '燃', '坚韧'],
        subthemes: [],
        forbiddenTones: [],
        emotionBaseline: {
          openingPhase: '',
          developmentPhase: '',
          climaxPhase: '',
          resolutionPhase: '',
        },
        writingAtmosphere: '',
      },
      goldenOpening: {
        openingHookType: 'high_burn',
        chapter1: { summary: 'a', hook: '', mustAchieve: [], wordCountTarget: '', firstHook: '' },
        chapter2: { summary: 'b', hook: '', mustAchieve: [], wordCountTarget: '' },
        chapter3: { summary: 'c', hook: '', mustAchieve: [], wordCountTarget: '', signingHook: '' },
        openingForbidden: [],
      },
      writingStyle: {
        prose: { tone: [], forbiddenTones: [], sentenceRhythm: '', descriptionDensity: '' },
        scene: { sceneStructure: '', povRules: '', sensoryPriority: [] },
        dialogue: { dialogueToNarrationRatio: '', monologueHandling: '', subtextGuidelines: '' },
        chapterWordCountTarget: '3500',
      },
      characters: [
        {
          id: 'mc',
          name: '林辰',
          role: 'protagonist',
          traits: [],
          background: '',
          motivation: '',
          arc: '',
          age: '',
          gender: '',
          appearance: '',
          socialStatus: '',
          internalConflict: '',
          abilities: [],
          weaknesses: [],
          keyQuotes: [],
          speechPattern: {
            sentenceLength: '',
            vocabularyLevel: '',
            catchphrases: [],
            speechQuirks: '',
          },
        },
      ],
      relationships: [],
      outlineArchitecture: {
        mode: 'lotus_map',
        modeReason: 'reason',
        satisfactionPacing: { earlyGame: [], midGame: [], lateGame: [], climax: [] },
        data: {
          kind: 'lotus_map',
          lotusCore: {
            name: '远古天宫',
            setting: '隐于云海',
            protagonistInitialRelation: '',
            secretLayers: [],
            guardianCharacters: [],
            returnTriggerDesign: '',
          },
          petals: [],
          historyLayers: [],
          ultimateTheme: '',
        },
      },
      foreshadowingSeed: { entries: [], resolutionChecklist: [] },
      completionDesign: {
        endingType: 'HE',
        finalBoss: '',
        finalConflict: '',
        epilogueHint: '',
        looseEndsResolution: [],
      },
    },
    typeSpecific: {
      kind: 'fantasy',
      powerSystem: {
        systemName: '剑道修炼',
        cultivationType: '',
        levels: ['炼体'],
        resourceCategories: [],
        combatSystem: '',
      },
      goldenFinger: null,
    },
    createdAt: '2026-04-30T00:00:00.000Z',
    updatedAt: '2026-04-30T00:00:00.000Z',
  };
}

function buildDetailedOutline(): DetailedOutlineDocument {
  return {
    id: 'detailed-1',
    storyBlueprintId: 'outline-1',
    totalChapters: 3,
    estimatedTotalWords: '200 万字',
    volumes: [
      {
        volumeNumber: 1,
        title: '启程立势',
        arcSummary: '主角觉醒并立足。',
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
              storyProgress: '故事开端,主角刚到外门考核现场。',
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
    createdAt: '2026-04-30T00:00:00.000Z',
    updatedAt: '2026-04-30T00:00:00.000Z',
  };
}

function renderWithRouter(entry = '/chapter-plans?bookId=book-1') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/chapter-plans" element={<ChapterPlansPage />} />
        <Route path="/writing" element={<div>writing</div>} />
        <Route path="/story-outline" element={<div>story outline</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ChapterPlans Page (DetailedOutline)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchBook).mockResolvedValue({ id: 'book-1', title: '测试书籍' });
    vi.mocked(api.fetchStoryOutline).mockResolvedValue(buildMinimalBlueprint());
    vi.mocked(api.fetchDetailedOutline).mockResolvedValue(null);
    vi.mocked(api.generateDetailedOutline).mockResolvedValue(buildDetailedOutline());
  });

  it('renders empty state with AI generate button when no detailed outline exists', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('细纲规划')).toBeTruthy();
    });

    expect(screen.getByText('尚未生成全书细纲')).toBeTruthy();
    expect(screen.getByText(/AI 自动生成全书细纲/)).toBeTruthy();
  });

  it('calls generateDetailedOutline when clicking the AI generate button', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText(/AI 自动生成全书细纲/)).toBeTruthy();
    });

    fireEvent.click(screen.getByText(/AI 自动生成全书细纲/));

    await waitFor(() => {
      expect(api.generateDetailedOutline).toHaveBeenCalledWith('book-1');
    });

    await waitFor(() => {
      expect(screen.getByText('AI 已生成全书细纲')).toBeTruthy();
    });
  });

  it('renders the volume + chapter map when outline exists', async () => {
    vi.mocked(api.fetchDetailedOutline).mockResolvedValue(buildDetailedOutline());
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('细纲规划')).toBeTruthy();
    });

    expect(screen.getByText(/第 1 卷.*启程立势/)).toBeTruthy();
    expect(screen.getByText('考核日')).toBeTruthy();
    expect(screen.getByText('导师传授')).toBeTruthy();
    expect(screen.getByText('亡命突围')).toBeTruthy();
  });

  it('switches the right panel when clicking a chapter', async () => {
    vi.mocked(api.fetchDetailedOutline).mockResolvedValue(buildDetailedOutline());
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('考核日')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('导师传授'));

    await waitFor(() => {
      expect(screen.getByText(/第 2 章 · 导师传授/)).toBeTruthy();
    });

    expect(screen.getByText(/主角获得宗门长老的暗中传授/)).toBeTruthy();
  });
});
