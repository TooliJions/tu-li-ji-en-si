import { z } from 'zod';

// ─── 顶层枚举 ─────────────────────────────────────────────

export const NovelTypeSchema = z.enum([
  'xuanhuan',
  'xianxia',
  'qihuan',
  'kehuan',
  'youxi',
  'moshi',
  'dushi',
  'xuanyi',
  'yanqing',
  'lishi',
]);

export const GenderTargetSchema = z.enum(['male', 'female', 'universal']);

export const EndingTypeSchema = z.enum(['HE', 'BE', 'open', 'angst_HE']);

export const ArchitectureModeSchema = z.enum([
  'lotus_map',
  'multiverse',
  'org_ensemble',
  'map_upgrade',
]);

export const CharacterRoleSchema = z.enum([
  'protagonist',
  'antagonist',
  'supporting',
  'minor',
  'mentor',
  'love_interest',
]);

export const OpeningHookTypeSchema = z.enum([
  'high_burn',
  'suspense',
  'emotional',
  'world_shock',
  'reversal',
  'instant_payoff',
]);

export const SatisfactionTypeSchema = z.enum([
  'face_slap',
  'level_up',
  'revelation',
  'emotional_burst',
  'power_display',
  'reversal',
  'harvest',
]);

export const ImportanceSchema = z.enum(['high', 'medium', 'low']);

// ─── meta 层 ─────────────────────────────────────────────

export const OutlineMetaSchema = z.object({
  novelType: NovelTypeSchema,
  novelSubgenre: z.string().trim().optional(),
  typeConfidence: z.number().min(0).max(1).default(0.5),
  typeIsAuto: z.boolean().default(true),
  genderTarget: GenderTargetSchema.default('universal'),
  architectureMode: ArchitectureModeSchema,
  titleSuggestions: z.array(z.string().trim().min(1)).min(1),
  estimatedWordCount: z.string().trim().min(1),
  endingType: EndingTypeSchema,
  oneLineSynopsis: z.string().trim().max(200),
});

// ─── base 层:卖点、主题、风格、黄金三章 ─────────────────────

export const AuxiliarySellingPointSchema = z.object({
  point: z.string().trim().min(1),
  category: z.string().trim().min(1),
});

export const SellingPointsSchema = z.object({
  coreSellingPoint: z.string().trim().min(1).max(50),
  hookSentence: z.string().trim().min(1).max(150),
  auxiliarySellingPoints: z.array(AuxiliarySellingPointSchema).min(1),
  differentiation: z.string().trim().default(''),
  readerAppeal: z.string().trim().default(''),
});

export const NarrativeArcSchema = z.object({
  opening: z.string().trim().min(1),
  development: z.string().trim().min(1),
  climax: z.string().trim().min(1),
  resolution: z.string().trim().min(1),
});

export const EmotionBaselineSchema = z.object({
  openingPhase: z.string().trim().default(''),
  developmentPhase: z.string().trim().default(''),
  climaxPhase: z.string().trim().default(''),
  resolutionPhase: z.string().trim().default(''),
});

export const ThemeSchema = z.object({
  coreTheme: z.string().trim().min(1),
  proposition: z.string().trim().default(''),
  narrativeArc: NarrativeArcSchema,
  toneKeywords: z.array(z.string().trim().min(1)).min(3),
  subthemes: z.array(z.string().trim().min(1)).default([]),
  forbiddenTones: z.array(z.string().trim().min(1)).default([]),
  emotionBaseline: EmotionBaselineSchema.default({
    openingPhase: '',
    developmentPhase: '',
    climaxPhase: '',
    resolutionPhase: '',
  }),
  writingAtmosphere: z.string().trim().default(''),
});

export const GoldenChapterSchema = z.object({
  summary: z.string().trim().min(1),
  hook: z.string().trim().default(''),
  mustAchieve: z.array(z.string().trim().min(1)).default([]),
  wordCountTarget: z.string().trim().default(''),
});

export const GoldenChapter1Schema = GoldenChapterSchema.extend({
  firstHook: z.string().trim().default(''),
});

export const GoldenChapter3Schema = GoldenChapterSchema.extend({
  signingHook: z.string().trim().default(''),
});

export const GoldenOpeningSchema = z.object({
  openingHookType: OpeningHookTypeSchema.default('high_burn'),
  chapter1: GoldenChapter1Schema,
  chapter2: GoldenChapterSchema,
  chapter3: GoldenChapter3Schema,
  openingForbidden: z.array(z.string().trim().min(1)).default([]),
});

export const ProseGuidelinesSchema = z.object({
  tone: z.array(z.string().trim().min(1)).default([]),
  forbiddenTones: z.array(z.string().trim().min(1)).default([]),
  sentenceRhythm: z.string().trim().default(''),
  descriptionDensity: z.string().trim().default(''),
});

export const SceneWritingRulesSchema = z.object({
  sceneStructure: z.string().trim().default(''),
  povRules: z.string().trim().default(''),
  sensoryPriority: z.array(z.string().trim().min(1)).default([]),
});

export const DialogueRulesSchema = z.object({
  dialogueToNarrationRatio: z.string().trim().default(''),
  monologueHandling: z.string().trim().default(''),
  subtextGuidelines: z.string().trim().default(''),
});

export const WritingStyleSchema = z.object({
  prose: ProseGuidelinesSchema.default({
    tone: [],
    forbiddenTones: [],
    sentenceRhythm: '',
    descriptionDensity: '',
  }),
  scene: SceneWritingRulesSchema.default({
    sceneStructure: '',
    povRules: '',
    sensoryPriority: [],
  }),
  dialogue: DialogueRulesSchema.default({
    dialogueToNarrationRatio: '',
    monologueHandling: '',
    subtextGuidelines: '',
  }),
  chapterWordCountTarget: z.string().trim().min(1),
});

// ─── base 层:角色与关系 ─────────────────────────────

export const SpeechPatternSchema = z.object({
  sentenceLength: z.string().trim().default(''),
  vocabularyLevel: z.string().trim().default(''),
  catchphrases: z.array(z.string().trim().min(1)).default([]),
  speechQuirks: z.string().trim().default(''),
});

export const OutlineCharacterSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  role: CharacterRoleSchema,
  traits: z.array(z.string().trim().min(1)).default([]),
  background: z.string().trim().default(''),
  motivation: z.string().trim().default(''),
  arc: z.string().trim().default(''),
  age: z.string().trim().default(''),
  gender: z.string().trim().default(''),
  appearance: z.string().trim().default(''),
  socialStatus: z.string().trim().default(''),
  internalConflict: z.string().trim().default(''),
  abilities: z.array(z.string().trim().min(1)).default([]),
  weaknesses: z.array(z.string().trim().min(1)).default([]),
  keyQuotes: z.array(z.string().trim().min(1)).default([]),
  speechPattern: SpeechPatternSchema.default({
    sentenceLength: '',
    vocabularyLevel: '',
    catchphrases: [],
    speechQuirks: '',
  }),
});

export const RelationshipSchema = z.object({
  fromId: z.string().trim().min(1),
  toId: z.string().trim().min(1),
  relationType: z.string().trim().min(1),
  evolution: z.string().trim().default(''),
  keyEvents: z.array(z.string().trim().min(1)).default([]),
});

// ─── base 层:架构模式(4 选 1)─────────────────────────

export const SatisfactionPacingSchema = z.object({
  earlyGame: z.array(z.string().trim().min(1)).default([]),
  midGame: z.array(z.string().trim().min(1)).default([]),
  lateGame: z.array(z.string().trim().min(1)).default([]),
  climax: z.array(z.string().trim().min(1)).default([]),
});

export const SecretLayerSchema = z.object({
  layerId: z.string().trim().min(1),
  depth: z.string().trim().default(''),
  secretContent: z.string().trim().min(1),
  unlockTrigger: z.string().trim().default(''),
  unlockTiming: z.string().trim().default(''),
});

export const PetalUnitSchema = z.object({
  petalId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  arcSummary: z.string().trim().min(1),
  keyConflict: z.string().trim().default(''),
  newFactions: z.array(z.string().trim().min(1)).default([]),
  worldExpansion: z.string().trim().default(''),
  lotusCoreConnection: z.string().trim().default(''),
  satisfactionType: SatisfactionTypeSchema.optional(),
});

export const LotusMapStructureSchema = z.object({
  kind: z.literal('lotus_map'),
  lotusCore: z.object({
    name: z.string().trim().min(1),
    setting: z.string().trim().min(1),
    protagonistInitialRelation: z.string().trim().default(''),
    secretLayers: z.array(SecretLayerSchema).default([]),
    guardianCharacters: z.array(z.string().trim().min(1)).default([]),
    returnTriggerDesign: z.string().trim().default(''),
  }),
  petals: z.array(PetalUnitSchema).default([]),
  historyLayers: z.array(z.string().trim().min(1)).default([]),
  ultimateTheme: z.string().trim().default(''),
});

export const MultiverseStructureSchema = z.object({
  kind: z.literal('multiverse'),
  hubWorld: z.string().trim().min(1),
  worlds: z
    .array(
      z.object({
        worldId: z.string().trim().min(1),
        name: z.string().trim().min(1),
        rules: z.string().trim().default(''),
        conflict: z.string().trim().default(''),
        transferMechanism: z.string().trim().default(''),
      }),
    )
    .min(1),
  progressionLogic: z.string().trim().default(''),
});

export const OrgEnsembleStructureSchema = z.object({
  kind: z.literal('org_ensemble'),
  coreOrg: z.string().trim().min(1),
  factions: z
    .array(
      z.object({
        factionId: z.string().trim().min(1),
        name: z.string().trim().min(1),
        ideology: z.string().trim().default(''),
        leader: z.string().trim().default(''),
        stance: z.string().trim().default(''),
      }),
    )
    .min(1),
  powerBalance: z.string().trim().default(''),
  protagonistEntryPoint: z.string().trim().default(''),
});

export const MapUpgradeStructureSchema = z.object({
  kind: z.literal('map_upgrade'),
  startingZone: z.string().trim().min(1),
  zones: z
    .array(
      z.object({
        zoneId: z.string().trim().min(1),
        name: z.string().trim().min(1),
        levelRange: z.string().trim().default(''),
        resources: z.string().trim().default(''),
        dangers: z.string().trim().default(''),
      }),
    )
    .min(1),
  upgradeTriggers: z.array(z.string().trim().min(1)).default([]),
  zoneTransitionLogic: z.string().trim().default(''),
});

export const ArchitectureDataSchema = z.discriminatedUnion('kind', [
  LotusMapStructureSchema,
  MultiverseStructureSchema,
  OrgEnsembleStructureSchema,
  MapUpgradeStructureSchema,
]);

export const OutlineArchitectureSchema = z.object({
  mode: ArchitectureModeSchema,
  modeReason: z.string().trim().min(1),
  satisfactionPacing: SatisfactionPacingSchema.default({
    earlyGame: [],
    midGame: [],
    lateGame: [],
    climax: [],
  }),
  data: ArchitectureDataSchema,
});

// ─── base 层:伏笔种子 + 完本设计 ─────────────────────

export const ForeshadowingEntrySchema = z.object({
  id: z.string().trim().min(1),
  content: z.string().trim().min(1),
  category: z.string().trim().default(''),
  importance: ImportanceSchema.default('medium'),
});

export const ForeshadowingSeedSchema = z.object({
  entries: z.array(ForeshadowingEntrySchema).default([]),
  resolutionChecklist: z.array(z.string().trim().min(1)).default([]),
});

export const CompletionDesignSchema = z.object({
  endingType: EndingTypeSchema,
  finalBoss: z.string().trim().default(''),
  finalConflict: z.string().trim().default(''),
  epilogueHint: z.string().trim().default(''),
  looseEndsResolution: z.array(z.string().trim().min(1)).default([]),
});

// ─── base 顶层 ─────────────────────────────────────────

export const OutlineBaseSchema = z.object({
  sellingPoints: SellingPointsSchema,
  theme: ThemeSchema,
  goldenOpening: GoldenOpeningSchema,
  writingStyle: WritingStyleSchema,
  characters: z.array(OutlineCharacterSchema).min(1),
  relationships: z.array(RelationshipSchema).default([]),
  outlineArchitecture: OutlineArchitectureSchema,
  foreshadowingSeed: ForeshadowingSeedSchema.default({
    entries: [],
    resolutionChecklist: [],
  }),
  completionDesign: CompletionDesignSchema,
});

// ─── typeSpecific 层(5 选 1) ─────────────────────────

export const FantasyTypeSpecificSchema = z.object({
  kind: z.literal('fantasy'),
  powerSystem: z.object({
    systemName: z.string().trim().min(1),
    cultivationType: z.string().trim().default(''),
    levels: z.array(z.string().trim().min(1)).min(1),
    resourceCategories: z.array(z.string().trim().min(1)).default([]),
    combatSystem: z.string().trim().default(''),
  }),
  goldenFinger: z
    .object({
      name: z.string().trim().min(1),
      abilityType: z.string().trim().default(''),
      origin: z.string().trim().default(''),
      growthPath: z.string().trim().default(''),
      limitations: z.array(z.string().trim().min(1)).default([]),
      keyAbilities: z.array(z.string().trim().min(1)).default([]),
    })
    .nullable()
    .default(null),
});

export const MysteryTypeSpecificSchema = z.object({
  kind: z.literal('mystery'),
  mysteryDesign: z
    .array(
      z.object({
        mysteryId: z.string().trim().min(1),
        mysteryContent: z.string().trim().min(1),
        clues: z.array(z.string().trim().min(1)).default([]),
        redHerrings: z.array(z.string().trim().min(1)).default([]),
        revealChapter: z.string().trim().default(''),
        impact: z.string().trim().default(''),
      }),
    )
    .min(1),
  revelationSchedule: z
    .array(
      z.object({
        entryId: z.string().trim().min(1),
        targetMysteryId: z.string().trim().min(1),
        revealTiming: z.string().trim().default(''),
        revealMethod: z.string().trim().default(''),
        readerPreparation: z.string().trim().default(''),
      }),
    )
    .default([]),
  suspenseRhythm: z.string().trim().default(''),
});

export const UrbanTypeSpecificSchema = z.object({
  kind: z.literal('urban'),
  systemPanel: z
    .object({
      panelName: z.string().trim().min(1),
      mainFunctions: z.array(z.string().trim().min(1)).default([]),
      bindingMechanism: z.string().trim().default(''),
    })
    .nullable()
    .default(null),
  worldBuilding: z.object({
    socialHierarchy: z.string().trim().default(''),
    economicSystem: z.string().trim().default(''),
    technologyLevel: z.string().trim().default(''),
    locationCards: z
      .array(
        z.object({
          name: z.string().trim().min(1),
          purpose: z.string().trim().default(''),
        }),
      )
      .default([]),
  }),
});

export const RomanceTypeSpecificSchema = z.object({
  kind: z.literal('romance'),
  emotionalArc: z
    .array(
      z.object({
        phase: z.string().trim().min(1),
        emotion: z.string().trim().min(1),
        trigger: z.string().trim().default(''),
        readerSatisfactionType: z.string().trim().default(''),
      }),
    )
    .min(1),
  relationshipSystem: z.object({
    coreRelationshipType: z.string().trim().min(1),
    tensionSources: z.array(z.string().trim().min(1)).default([]),
    milestoneEvents: z.array(z.string().trim().min(1)).default([]),
  }),
});

export const SciFiTypeSpecificSchema = z.object({
  kind: z.literal('scifi'),
  techLevels: z
    .array(
      z.object({
        levelId: z.string().trim().min(1),
        name: z.string().trim().min(1),
        capabilities: z.array(z.string().trim().min(1)).default([]),
        limitations: z.array(z.string().trim().min(1)).default([]),
      }),
    )
    .min(1),
  interstellarPolitics: z.string().trim().default(''),
  worldBuilding: z
    .object({
      socialHierarchy: z.string().trim().default(''),
      economicSystem: z.string().trim().default(''),
      technologyLevel: z.string().trim().default(''),
    })
    .default({
      socialHierarchy: '',
      economicSystem: '',
      technologyLevel: '',
    }),
});

export const TypeSpecificSchema = z.discriminatedUnion('kind', [
  FantasyTypeSpecificSchema,
  MysteryTypeSpecificSchema,
  UrbanTypeSpecificSchema,
  RomanceTypeSpecificSchema,
  SciFiTypeSpecificSchema,
]);

// ─── 顶层 StoryBlueprint ─────────────────────────────────

export const StoryBlueprintSchema = z.object({
  id: z.string().min(1),
  planningBriefId: z.string().min(1),
  meta: OutlineMetaSchema,
  base: OutlineBaseSchema,
  typeSpecific: TypeSpecificSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CreateStoryBlueprintInputSchema = z.object({
  planningBriefId: z.string().min(1),
  meta: OutlineMetaSchema,
  base: OutlineBaseSchema,
  typeSpecific: TypeSpecificSchema,
});

// ─── 类型导出 ─────────────────────────────────────────

export type NovelType = z.infer<typeof NovelTypeSchema>;
export type GenderTarget = z.infer<typeof GenderTargetSchema>;
export type EndingType = z.infer<typeof EndingTypeSchema>;
export type ArchitectureMode = z.infer<typeof ArchitectureModeSchema>;
export type CharacterRole = z.infer<typeof CharacterRoleSchema>;
export type SatisfactionType = z.infer<typeof SatisfactionTypeSchema>;
export type Importance = z.infer<typeof ImportanceSchema>;

export type OutlineMeta = z.infer<typeof OutlineMetaSchema>;
export type SellingPoints = z.infer<typeof SellingPointsSchema>;
export type Theme = z.infer<typeof ThemeSchema>;
export type GoldenOpening = z.infer<typeof GoldenOpeningSchema>;
export type WritingStyle = z.infer<typeof WritingStyleSchema>;
export type OutlineCharacter = z.infer<typeof OutlineCharacterSchema>;
export type Relationship = z.infer<typeof RelationshipSchema>;
export type SatisfactionPacing = z.infer<typeof SatisfactionPacingSchema>;
export type ArchitectureData = z.infer<typeof ArchitectureDataSchema>;
export type OutlineArchitecture = z.infer<typeof OutlineArchitectureSchema>;
export type ForeshadowingSeed = z.infer<typeof ForeshadowingSeedSchema>;
export type CompletionDesign = z.infer<typeof CompletionDesignSchema>;
export type OutlineBase = z.infer<typeof OutlineBaseSchema>;
export type TypeSpecific = z.infer<typeof TypeSpecificSchema>;
export type StoryBlueprint = z.infer<typeof StoryBlueprintSchema>;
export type CreateStoryBlueprintInput = z.infer<typeof CreateStoryBlueprintInputSchema>;
