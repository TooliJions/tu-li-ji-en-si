import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  StyleFingerprinter,
  type StyleFingerprintInput,
  type StyleFingerprintOutput,
} from './style-fingerprint';
import type { LLMProvider } from '../llm/provider';

function createMockProvider(): LLMProvider & {
  generate: ReturnType<typeof vi.fn>;
  generateJSON: ReturnType<typeof vi.fn>;
} {
  return {
    generate: vi.fn(),
    generateJSON: vi.fn(),
  } as unknown as LLMProvider & {
    generate: ReturnType<typeof vi.fn>;
    generateJSON: ReturnType<typeof vi.fn>;
  };
}

describe('StyleFingerprinter', () => {
  let mockProvider: ReturnType<typeof createMockProvider>;
  let fingerprinter: StyleFingerprinter;

  beforeEach(() => {
    mockProvider = createMockProvider();
    fingerprinter = new StyleFingerprinter(mockProvider);
  });

  // ── Properties ────────────────────────────────────────────

  describe('abstract properties', () => {
    it('has correct agent name', () => {
      expect(fingerprinter.name).toBe('StyleFingerprinter');
    });

    it('uses low temperature (0.2 for analytical fingerprinting)', () => {
      expect(fingerprinter.temperature).toBe(0.2);
    });
  });

  // ── execute() — happy path ────────────────────────────────

  describe('execute()', () => {
    const validInput: StyleFingerprintInput = {
      referenceText:
        '林风走进大厅，只见人头攒动，觥筹交错。他微微一怔，心中暗道："此地不宜久留。"于是他转身离开，不再回头。大厅外月光如水，洒在青石板上。',
      genre: 'xianxia',
    };

    it('returns structured style fingerprint JSON', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        avgSentenceLength: 12,
        dialogueRatio: 0.3,
        descriptionRatio: 0.4,
        actionRatio: 0.3,
        commonPhrases: ['只见', '微微', '心中暗道'],
        sentencePatternPreference: '长短交替，对话用引号标注',
        wordUsageHabit: '偏好四字成语和古风用词',
        rhetoricTendency: '比喻、暗示、留白',
      });

      const result = await fingerprinter.execute({
        promptContext: { input: validInput },
      });

      expect(result.success).toBe(true);
      const data = result.data as StyleFingerprintOutput;
      expect(data.fingerprint).toBeDefined();
      expect(typeof data.fingerprint.avgSentenceLength).toBe('number');
      expect(Array.isArray(data.fingerprint.commonPhrases)).toBe(true);
    });

    it('includes sentence pattern preference in output', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        avgSentenceLength: 10,
        dialogueRatio: 0.5,
        descriptionRatio: 0.3,
        actionRatio: 0.2,
        commonPhrases: ['于是', '然而'],
        sentencePatternPreference: '多用短句',
        wordUsageHabit: '口语化',
        rhetoricTendency: '直白叙述',
      });

      const result = await fingerprinter.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as StyleFingerprintOutput;
      expect(data.fingerprint.sentencePatternPreference).toBeTruthy();
    });

    it('includes word usage habit in output', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        avgSentenceLength: 15,
        dialogueRatio: 0.2,
        descriptionRatio: 0.6,
        actionRatio: 0.2,
        commonPhrases: ['只见', '不禁'],
        sentencePatternPreference: '长句为主',
        wordUsageHabit: '善用典故',
        rhetoricTendency: '比喻丰富',
      });

      const result = await fingerprinter.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as StyleFingerprintOutput;
      expect(data.fingerprint.wordUsageHabit).toBeTruthy();
    });

    it('includes rhetoric tendency in output', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        avgSentenceLength: 8,
        dialogueRatio: 0.4,
        descriptionRatio: 0.3,
        actionRatio: 0.3,
        commonPhrases: ['突然', '瞬间'],
        sentencePatternPreference: '短句制造紧张感',
        wordUsageHabit: '动词丰富',
        rhetoricTendency: '留白和暗示',
      });

      const result = await fingerprinter.execute({
        promptContext: { input: validInput },
      });

      const data = result.data as StyleFingerprintOutput;
      expect(data.fingerprint.rhetoricTendency).toBeTruthy();
    });
  });

  // ── execute() — genre context ─────────────────────────────

  describe('execute() — genre context', () => {
    it('includes genre-specific analysis guidance for xianxia', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        avgSentenceLength: 12,
        dialogueRatio: 0.3,
        descriptionRatio: 0.4,
        actionRatio: 0.3,
        commonPhrases: ['只见'],
        sentencePatternPreference: '长短交替',
        wordUsageHabit: '古风',
        rhetoricTendency: '暗示',
      });

      await fingerprinter.execute({
        promptContext: {
          input: {
            referenceText:
              '林风走进大厅，只见人头攒动，觥筹交错。他微微一怔，心中暗道："此地不宜久留。"于是他转身离开，不再回头。大厅外月光如水，洒在青石板上。',
            genre: 'xianxia',
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('仙侠');
    });

    it('includes genre-specific analysis guidance for urban', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        avgSentenceLength: 10,
        dialogueRatio: 0.4,
        descriptionRatio: 0.3,
        actionRatio: 0.3,
        commonPhrases: ['然后'],
        sentencePatternPreference: '口语化短句',
        wordUsageHabit: '现代用语',
        rhetoricTendency: '直白',
      });

      await fingerprinter.execute({
        promptContext: {
          input: {
            referenceText:
              '林风走进大厅，只见人头攒动，觥筹交错。他微微一怔，心中暗道："此地不宜久留。"于是他转身离开，不再回头。大厅外月光如水，洒在青石板上。',
            genre: 'urban',
          },
        },
      });

      const callArgs = mockProvider.generateJSON.mock.calls[0][0];
      expect(callArgs.prompt).toContain('都市');
    });

    it('handles unknown genre gracefully', async () => {
      mockProvider.generateJSON.mockResolvedValue({
        avgSentenceLength: 10,
        dialogueRatio: 0.3,
        descriptionRatio: 0.4,
        actionRatio: 0.3,
        commonPhrases: [],
        sentencePatternPreference: '混合',
        wordUsageHabit: '通用',
        rhetoricTendency: '多样',
      });

      const result = await fingerprinter.execute({
        promptContext: {
          input: {
            referenceText:
              '林风走进大厅，只见人头攒动，觥筹交错。他微微一怔，心中暗道："此地不宜久留。"于是他转身离开，不再回头。大厅外月光如水，洒在青石板上。',
            genre: 'litrpg',
          },
        },
      });

      expect(result.success).toBe(true);
    });
  });

  // ── execute() — validation ────────────────────────────────

  describe('execute() — validation', () => {
    it('returns error when input is missing', async () => {
      const result = await fingerprinter.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('输入');
    });

    it('returns error when reference text is missing', async () => {
      const result = await fingerprinter.execute({
        promptContext: {
          input: { genre: 'xianxia' } as StyleFingerprintInput,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('参考文本');
    });

    it('returns error when reference text is empty', async () => {
      const result = await fingerprinter.execute({
        promptContext: {
          input: { referenceText: '', genre: 'xianxia' },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('参考文本');
    });

    it('returns error when genre is missing', async () => {
      const result = await fingerprinter.execute({
        promptContext: {
          input: {
            referenceText:
              '这是一段足够长的参考文本，用来测试风格指纹提取功能。林风走进大厅，只见人头攒动，觥筹交错。他微微一怔，心中暗道："此地不宜久留。"于是他转身离开。',
          } as StyleFingerprintInput,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('题材');
    });

    it('returns error when reference text is too short', async () => {
      const result = await fingerprinter.execute({
        promptContext: {
          input: { referenceText: '短句', genre: 'xianxia' },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('过短');
    });
  });

  // ── execute() — LLM errors ────────────────────────────────

  describe('execute() — LLM errors', () => {
    it('returns error when LLM call fails', async () => {
      mockProvider.generateJSON.mockRejectedValue(new Error('API timeout'));

      const result = await fingerprinter.execute({
        promptContext: {
          input: {
            referenceText:
              '林风走进大厅，只见人头攒动，觥筹交错。他微微一怔，心中暗道："此地不宜久留。"于是他转身离开，不再回头。',
            genre: 'xianxia',
          },
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('API timeout');
    });
  });

  // ── analyze() — heuristic fallback ────────────────────────

  describe('analyze() — heuristic fallback', () => {
    it('computes avgSentenceLength from text', () => {
      const text = '你好。世界很大。今天天气不错，适合出去散步。';
      const fingerprint = fingerprinter.analyze(text);

      expect(fingerprint.avgSentenceLength).toBeGreaterThan(0);
    });

    it('computes dialogueRatio from text with quotes', () => {
      const text = '他说："你好。"然后走了。她问："去哪？"';
      const fingerprint = fingerprinter.analyze(text);

      expect(fingerprint.dialogueRatio).toBeGreaterThanOrEqual(0);
      expect(fingerprint.dialogueRatio).toBeLessThanOrEqual(1);
    });

    it('extracts commonPhrases from text', () => {
      const text = '只见那人走来，只见大门打开，只见月光洒下';
      const fingerprint = fingerprinter.analyze(text);

      expect(fingerprint.commonPhrases.length).toBeGreaterThan(0);
      expect(fingerprint.commonPhrases).toContain('只见');
    });

    it('handles empty text gracefully', () => {
      const fingerprint = fingerprinter.analyze('');

      expect(fingerprint.avgSentenceLength).toBe(0);
      expect(fingerprint.dialogueRatio).toBe(0);
      expect(fingerprint.commonPhrases).toEqual([]);
    });
  });
});
