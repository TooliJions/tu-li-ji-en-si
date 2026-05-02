import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import StoryOutlinePage from './story-outline';
import * as api from '../lib/api';
import type { StoryBlueprintDocument } from '../lib/api';

vi.mock('../lib/api', () => ({
  fetchBook: vi.fn(),
  fetchPlanningBrief: vi.fn(),
  fetchStoryOutline: vi.fn(),
  generateStoryOutline: vi.fn(),
}));

function buildBlueprint(): StoryBlueprintDocument {
  return {
    id: 'outline-1',
    planningBriefId: 'brief-1',
    meta: {
      novelType: 'xianxia',
      novelSubgenre: '宗门修仙',
      typeConfidence: 0.92,
      typeIsAuto: true,
      genderTarget: 'male',
      architectureMode: 'lotus_map',
      titleSuggestions: ['星辰剑帝', '逆天剑路'],
      estimatedWordCount: '200 万字',
      endingType: 'HE',
      oneLineSynopsis: '少年觉醒上古血脉,从外门一路逆袭。',
    },
    base: {
      sellingPoints: {
        coreSellingPoint: '逆袭+血脉觉醒',
        hookSentence: '宗门最弱外门弟子身藏远古血脉。',
        auxiliarySellingPoints: [{ point: '热血对决', category: '情节爽感' }],
        differentiation: '血脉代价机制',
        readerAppeal: '热血+爽快',
      },
      theme: {
        coreTheme: '逆袭与代价',
        proposition: '强大须付代价',
        narrativeArc: {
          opening: '外门考核暴露血脉',
          development: '宗门博弈步步为营',
          climax: '与上古势力对决',
          resolution: '建立新秩序',
        },
        toneKeywords: ['热血', '燃', '坚韧'],
        subthemes: [],
        forbiddenTones: [],
        emotionBaseline: {
          openingPhase: '',
          developmentPhase: '',
          climaxPhase: '',
          resolutionPhase: '',
        },
        writingAtmosphere: '紧张',
      },
      goldenOpening: {
        openingHookType: 'high_burn',
        chapter1: {
          summary: '考核日血脉觉醒',
          hook: '万众瞩目',
          mustAchieve: ['暴露血脉'],
          wordCountTarget: '3500',
          firstHook: '雷霆破空',
        },
        chapter2: {
          summary: '导师私下传授',
          hook: '神秘传承',
          mustAchieve: ['获得指引'],
          wordCountTarget: '3500',
        },
        chapter3: {
          summary: '面对宗门追杀',
          hook: '亡命突围',
          mustAchieve: ['第一次胜利'],
          wordCountTarget: '3500',
          signingHook: '黑影逼近',
        },
        openingForbidden: [],
      },
      writingStyle: {
        prose: { tone: ['紧凑'], forbiddenTones: [], sentenceRhythm: '', descriptionDensity: '' },
        scene: { sceneStructure: '', povRules: '', sensoryPriority: [] },
        dialogue: { dialogueToNarrationRatio: '', monologueHandling: '', subtextGuidelines: '' },
        chapterWordCountTarget: '3500',
      },
      characters: [
        {
          id: 'mc',
          name: '林辰',
          role: 'protagonist',
          traits: ['坚韧'],
          background: '宗门外门弟子',
          motivation: '揭开血脉之谜',
          arc: '从隐忍自保到主动反击',
          age: '17',
          gender: '男',
          appearance: '清瘦',
          socialStatus: '外门弟子',
          internalConflict: '善良与决绝',
          abilities: ['剑法'],
          weaknesses: ['血脉反噬'],
          keyQuotes: [],
          speechPattern: {
            sentenceLength: '短',
            vocabularyLevel: '日常',
            catchphrases: [],
            speechQuirks: '',
          },
        },
      ],
      relationships: [],
      outlineArchitecture: {
        mode: 'lotus_map',
        modeReason: '修仙世界存在层层秘境',
        satisfactionPacing: {
          earlyGame: ['打脸'],
          midGame: ['揭秘'],
          lateGame: ['碾压'],
          climax: ['反转'],
        },
        data: {
          kind: 'lotus_map',
          lotusCore: {
            name: '远古天宫',
            setting: '隐于云海的上古遗迹',
            protagonistInitialRelation: '血脉与天宫共鸣',
            secretLayers: [],
            guardianCharacters: [],
            returnTriggerDesign: '血脉觉醒达到第三阶',
          },
          petals: [],
          historyLayers: [],
          ultimateTheme: '血脉传承与个人选择',
        },
      },
      foreshadowingSeed: { entries: [], resolutionChecklist: [] },
      completionDesign: {
        endingType: 'HE',
        finalBoss: '上古魔尊',
        finalConflict: '血脉本源之战',
        epilogueHint: '',
        looseEndsResolution: [],
      },
    },
    typeSpecific: {
      kind: 'fantasy',
      powerSystem: {
        systemName: '剑道修炼',
        cultivationType: '剑修',
        levels: ['炼体', '凝气', '筑基'],
        resourceCategories: [],
        combatSystem: '',
      },
      goldenFinger: null,
    },
    createdAt: '2026-04-30T00:00:00.000Z',
    updatedAt: '2026-04-30T00:00:00.000Z',
  };
}

function renderWithRouter(entry = '/story-outline?bookId=book-1') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/story-outline" element={<StoryOutlinePage />} />
        <Route path="/chapter-plans" element={<div>chapter plans</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('StoryOutline Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchBook).mockResolvedValue({ id: 'book-1', title: '测试书籍' });
    vi.mocked(api.fetchPlanningBrief).mockResolvedValue({
      id: 'brief-1',
      seedId: 'seed-1',
      audience: '男频玄幻读者',
      genreStrategy: '高开高走',
      styleTarget: '爽点密集',
      lengthTarget: '300 万字',
      tabooRules: [],
      marketGoals: [],
      creativeConstraints: [],
      status: 'ready',
      createdAt: '2026-04-30T00:00:00.000Z',
      updatedAt: '2026-04-30T00:00:00.000Z',
    });
    vi.mocked(api.fetchStoryOutline).mockResolvedValue(null);
    vi.mocked(api.generateStoryOutline).mockResolvedValue(buildBlueprint());
  });

  it('renders empty state with AI generate button when no outline exists', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('故事总纲')).toBeTruthy();
    });

    expect(screen.getByText('尚未生成故事总纲')).toBeTruthy();
    expect(screen.getByText('AI 自动生成')).toBeTruthy();
    expect(screen.getByText('进入细纲')).toBeTruthy();
  });

  it('calls generateStoryOutline when clicking the AI generate button', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('AI 自动生成')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('AI 自动生成'));

    await waitFor(() => {
      expect(api.generateStoryOutline).toHaveBeenCalledWith('book-1');
    });

    await waitFor(() => {
      expect(screen.getByText('AI 已生成故事总纲')).toBeTruthy();
    });
  });

  it('renders blueprint viewer when outline exists', async () => {
    vi.mocked(api.fetchStoryOutline).mockResolvedValue(buildBlueprint());
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('故事总纲')).toBeTruthy();
    });

    expect(screen.getByText('林辰')).toBeTruthy();
    expect(screen.getByText('下一步:细纲')).toBeTruthy();
  });
});
