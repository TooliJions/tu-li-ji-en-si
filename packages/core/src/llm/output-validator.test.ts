import { describe, it, expect, vi } from 'vitest';
import {
  validateLLMOutput,
  generateJSONWithValidation,
  fillDefaults,
  type LLMOutputRule,
} from './output-validator';
import type { LLMProvider } from './provider';

describe('output-validator', () => {
  describe('validateLLMOutput', () => {
    it('passes validation when all rules are satisfied', () => {
      const data = {
        title: '测试标题',
        characters: ['角色1', '角色2'],
        keyEvents: ['事件1', '事件2', '事件3'],
      };
      const rules: LLMOutputRule[] = [
        { field: 'title', type: 'min_string_length', min: 2 },
        { field: 'characters', type: 'non_empty_array' },
        { field: 'keyEvents', type: 'min_array_length', min: 3 },
      ];

      const result = validateLLMOutput(data, rules);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('reports errors for missing required fields', () => {
      const data = { title: '', plan: null };
      const rules: LLMOutputRule[] = [
        { field: 'title', type: 'required' },
        { field: 'plan', type: 'required' },
      ];

      const result = validateLLMOutput(data, rules);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });

    it('reports errors for empty arrays', () => {
      const data = { characters: [], hooks: undefined };
      const rules: LLMOutputRule[] = [
        { field: 'characters', type: 'non_empty_array' },
        { field: 'hooks', type: 'non_empty_array' },
      ];

      const result = validateLLMOutput(data, rules);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });

    it('validates nested field paths', () => {
      const data = { plan: { keyEvents: [] } };
      const rules: LLMOutputRule[] = [
        { field: 'plan.keyEvents', type: 'min_array_length', min: 2 },
      ];

      const result = validateLLMOutput(data, rules);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('plan.keyEvents');
    });

    it('validates min_string_length', () => {
      const data = { title: '短' };
      const rules: LLMOutputRule[] = [{ field: 'title', type: 'min_string_length', min: 5 }];

      const result = validateLLMOutput(data, rules);
      expect(result.valid).toBe(false);
    });
  });

  describe('generateJSONWithValidation', () => {
    it('returns data on first attempt when validation passes', async () => {
      const mockProvider = {
        generateJSON: vi.fn().mockResolvedValue({
          title: '完整标题',
          characters: ['角色1'],
          keyEvents: ['事件1', '事件2'],
        }),
      } as unknown as LLMProvider;

      const rules: LLMOutputRule[] = [
        { field: 'title', type: 'min_string_length', min: 2 },
        { field: 'characters', type: 'non_empty_array' },
      ];

      const result = await generateJSONWithValidation(mockProvider, 'test prompt', rules);
      expect(result.title).toBe('完整标题');
      expect(mockProvider.generateJSON).toHaveBeenCalledTimes(1);
    });

    it('retries when validation fails and succeeds on retry', async () => {
      const badData = { title: '', characters: [] };
      const goodData = { title: '完整标题', characters: ['角色1'] };
      const mockProvider = {
        generateJSON: vi.fn().mockResolvedValueOnce(badData).mockResolvedValueOnce(goodData),
      } as unknown as LLMProvider;

      const rules: LLMOutputRule[] = [
        { field: 'title', type: 'min_string_length', min: 2 },
        { field: 'characters', type: 'non_empty_array' },
      ];

      const result = await generateJSONWithValidation(mockProvider, 'test prompt', rules, {
        retry: { maxRetries: 2, retryDelayMs: 100 },
      });
      expect(result.title).toBe('完整标题');
      expect(mockProvider.generateJSON).toHaveBeenCalledTimes(2);
    });

    it('returns last data after all retries exhausted', async () => {
      const badData = { title: '', characters: [] };
      const mockProvider = {
        generateJSON: vi.fn().mockResolvedValue(badData),
      } as unknown as LLMProvider;

      const rules: LLMOutputRule[] = [{ field: 'title', type: 'min_string_length', min: 2 }];

      const result = await generateJSONWithValidation(mockProvider, 'test prompt', rules, {
        retry: { maxRetries: 1, retryDelayMs: 100 },
      });
      expect(result.title).toBe('');
      expect(mockProvider.generateJSON).toHaveBeenCalledTimes(2); // initial + 1 retry
    });
  });

  describe('fillDefaults', () => {
    it('fills missing string fields with defaults', () => {
      const data = { title: '', description: 'existing' };
      const result = fillDefaults(data, { title: '默认标题' });
      expect(result.title).toBe('默认标题');
      expect(result.description).toBe('existing');
    });

    it('fills null fields with defaults', () => {
      const data = { title: null as unknown as string };
      const result = fillDefaults(data, { title: '默认标题' });
      expect(result.title).toBe('默认标题');
    });

    it('fills empty arrays with default arrays', () => {
      const data = { rules: [], hooks: ['existing'] };
      const result = fillDefaults(data, { rules: ['默认规则1', '默认规则2'] });
      expect(result.rules).toEqual(['默认规则1', '默认规则2']);
      expect(result.hooks).toEqual(['existing']);
    });

    it('preserves existing valid values', () => {
      const data = { title: '有效标题', rules: ['有效规则'] };
      const result = fillDefaults(data, { title: '默认标题', rules: ['默认规则'] });
      expect(result.title).toBe('有效标题');
      expect(result.rules).toEqual(['有效规则']);
    });
  });
});
