import { describe, expect, it } from 'vitest';
import { DefaultOutlineService, OutlineValidationError } from './outline-service';
import type { CreateStoryBlueprintInput } from '../contracts/outline';

function buildValidInput(): CreateStoryBlueprintInput {
  return {
    planningBriefId: 'brief_test',
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
          hook: '万众瞩目下的异象',
          mustAchieve: ['暴露血脉'],
          wordCountTarget: '3500',
          firstHook: '雷霆破空',
        },
        chapter2: {
          summary: '导师私下传授',
          hook: '神秘传承启动',
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
        prose: {
          tone: ['紧凑'],
          forbiddenTones: [],
          sentenceRhythm: '短句切割',
          descriptionDensity: '中等',
        },
        scene: { sceneStructure: '动作-反应', povRules: '主角第三人称', sensoryPriority: ['视觉'] },
        dialogue: {
          dialogueToNarrationRatio: '4:6',
          monologueHandling: '点到为止',
          subtextGuidelines: '留白',
        },
        chapterWordCountTarget: '3500',
      },
      characters: [
        {
          id: 'mc',
          name: '林辰',
          role: 'protagonist',
          traits: ['坚韧', '隐忍'],
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
        {
          id: 'mentor',
          name: '玄风长老',
          role: 'mentor',
          traits: ['深邃'],
          background: '隐世长老',
          motivation: '寻找血脉传承者',
          arc: '从观察到全力相助',
          age: '300',
          gender: '男',
          appearance: '鹤发童颜',
          socialStatus: '宗门长老',
          internalConflict: '',
          abilities: ['剑道'],
          weaknesses: [],
          keyQuotes: [],
          speechPattern: {
            sentenceLength: '中',
            vocabularyLevel: '雅致',
            catchphrases: [],
            speechQuirks: '',
          },
        },
      ],
      relationships: [
        {
          fromId: 'mentor',
          toId: 'mc',
          relationType: '师徒',
          evolution: '从观察到全力相助',
          keyEvents: ['第一次传授', '危急时救援'],
        },
      ],
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
          petals: [
            {
              petalId: 'p1',
              name: '宗门外门',
              arcSummary: '主角觉醒并立足',
              keyConflict: '与同门竞争',
              newFactions: [],
              worldExpansion: '',
              lotusCoreConnection: '导师从天宫秘传',
              satisfactionType: 'face_slap',
            },
          ],
          historyLayers: [],
          ultimateTheme: '血脉传承与个人选择',
        },
      },
      foreshadowingSeed: {
        entries: [
          { id: 'f1', content: '主角胸口的远古印记', category: '血脉', importance: 'high' },
        ],
        resolutionChecklist: ['印记真相'],
      },
      completionDesign: {
        endingType: 'HE',
        finalBoss: '上古魔尊',
        finalConflict: '血脉本源之战',
        epilogueHint: '新秩序建立',
        looseEndsResolution: ['印记之谜', '导师下落'],
      },
    },
    typeSpecific: {
      kind: 'fantasy',
      powerSystem: {
        systemName: '剑道修炼',
        cultivationType: '剑修',
        levels: ['炼体', '凝气', '筑基', '金丹', '元婴'],
        resourceCategories: ['灵石', '剑诀'],
        combatSystem: '招式+灵气',
      },
      goldenFinger: {
        name: '远古剑魂',
        abilityType: '血脉',
        origin: '上古天宫传承',
        growthPath: '与境界同步觉醒',
        limitations: ['过度使用反噬'],
        keyAbilities: ['剑魂共鸣'],
      },
    },
  };
}

describe('DefaultOutlineService', () => {
  it('creates a valid three-layer story blueprint', () => {
    const service = new DefaultOutlineService({
      idGenerator: () => 'outline_test',
      now: () => '2026-05-02T03:00:00.000Z',
    });

    const blueprint = service.createBlueprint(buildValidInput());

    expect(blueprint.id).toBe('outline_test');
    expect(blueprint.planningBriefId).toBe('brief_test');
    expect(blueprint.meta.novelType).toBe('xianxia');
    expect(blueprint.meta.architectureMode).toBe('lotus_map');
    expect(blueprint.base.characters).toHaveLength(2);
    expect(blueprint.typeSpecific.kind).toBe('fantasy');
    expect(blueprint.updatedAt).toBe('2026-05-02T03:00:00.000Z');
  });

  it('updates blueprint and refreshes updatedAt', () => {
    const service = new DefaultOutlineService({
      idGenerator: () => 'outline_test',
      now: () => '2026-05-02T03:00:00.000Z',
    });

    const blueprint = service.createBlueprint(buildValidInput());

    const updatedService = new DefaultOutlineService({
      idGenerator: () => 'outline_test',
      now: () => '2026-05-02T04:00:00.000Z',
    });

    const updated = updatedService.updateBlueprint(blueprint, {
      meta: { oneLineSynopsis: '少年血脉觉醒一路逆袭。' },
    });

    expect(updated.meta.oneLineSynopsis).toBe('少年血脉觉醒一路逆袭。');
    expect(updated.updatedAt).toBe('2026-05-02T04:00:00.000Z');
  });

  it('rejects R-01 violation: architectureMode mismatched with novelType', () => {
    const service = new DefaultOutlineService();
    const input = buildValidInput();
    input.meta.architectureMode = 'multiverse';
    input.base.outlineArchitecture.mode = 'multiverse';
    input.base.outlineArchitecture.data = {
      kind: 'multiverse',
      hubWorld: '主世界',
      worlds: [{ worldId: 'w1', name: '副世界', rules: '', conflict: '', transferMechanism: '' }],
      progressionLogic: '',
    };

    expect(() => service.createBlueprint(input)).toThrow(OutlineValidationError);
  });

  it('rejects R-04 violation: missing protagonist', () => {
    const service = new DefaultOutlineService();
    const input = buildValidInput();
    input.base.characters = input.base.characters.map((c) =>
      c.role === 'protagonist' ? { ...c, role: 'supporting' as const } : c,
    );

    expect(() => service.createBlueprint(input)).toThrow(OutlineValidationError);
  });

  it('reports R-03 warning: relationship references unknown character', () => {
    const service = new DefaultOutlineService({
      idGenerator: () => 'outline_test',
      now: () => '2026-05-02T03:00:00.000Z',
    });

    const input = buildValidInput();
    input.base.relationships.push({
      fromId: 'ghost',
      toId: 'mc',
      relationType: '宿敌',
      evolution: '',
      keyEvents: [],
    });

    const blueprint = service.createBlueprint(input);
    const issues = service.validateBlueprint(blueprint);
    const r03 = issues.filter((i) => i.rule === 'R-03');
    expect(r03.length).toBeGreaterThan(0);
    expect(r03[0].severity).toBe('warning');
  });

  it('reports R-05 warning: endingType mismatch between meta and completionDesign', () => {
    const service = new DefaultOutlineService({
      idGenerator: () => 'outline_test',
      now: () => '2026-05-02T03:00:00.000Z',
    });

    const input = buildValidInput();
    input.base.completionDesign.endingType = 'BE';

    const blueprint = service.createBlueprint(input);
    const issues = service.validateBlueprint(blueprint);
    const r05 = issues.filter((i) => i.rule === 'R-05');
    expect(r05.length).toBe(1);
    expect(r05[0].severity).toBe('warning');
  });
});
