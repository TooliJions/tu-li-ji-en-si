import { describe, it, expect } from 'vitest';
import {
  PipelineStepSchema,
  PipelineStateSchema,
  PipelineConfigSchema,
  PipelineConfigSchemaType,
  PipelineStepRecordSchema,
  FallbackActionEnumSchema,
} from './pipeline';

describe('Pipeline Schemas', () => {
  describe('PipelineStepSchema', () => {
    it('should accept valid step values', () => {
      expect(PipelineStepSchema.parse('intent')).toBe('intent');
      expect(PipelineStepSchema.parse('draft')).toBe('draft');
      expect(PipelineStepSchema.parse('persist')).toBe('persist');
    });

    it('should reject invalid step', () => {
      expect(() => PipelineStepSchema.parse('invalid')).toThrow();
    });
  });

  describe('PipelineStateSchema', () => {
    it('should accept valid state values', () => {
      expect(PipelineStateSchema.parse('running')).toBe('running');
    });

    it('should reject invalid state', () => {
      expect(() => PipelineStateSchema.parse('executing')).toThrow();
    });
  });

  describe('PipelineConfigSchema', () => {
    it('should use defaults', () => {
      const config: PipelineConfigSchemaType = PipelineConfigSchema.parse({});
      expect(config.maxRevisionRetries).toBe(2);
      expect(config.fallbackAction).toBe('accept_with_warnings');
      expect(config.enableAudit).toBe(true);
      expect(config.enableRevision).toBe(true);
    });

    it('should accept custom values', () => {
      const config: PipelineConfigSchemaType = PipelineConfigSchema.parse({
        maxRevisionRetries: 5,
        fallbackAction: 'pause' as any,
        enableAudit: false,
      });
      expect(config.maxRevisionRetries).toBe(5);
      expect(config.fallbackAction).toBe('pause');
      expect(config.enableAudit).toBe(false);
    });
  });

  describe('PipelineStepRecordSchema', () => {
    it('should validate a valid step record', () => {
      const entry = PipelineStepRecordSchema.parse({
        step: 'draft',
        timestamp: '2026-04-21T00:00:00Z',
        success: true,
      });
      expect(entry.step).toBe('draft');
      expect(entry.success).toBe(true);
    });
  });

  describe('FallbackActionEnumSchema', () => {
    it('should accept valid actions', () => {
      expect(FallbackActionEnumSchema.parse('accept_with_warnings')).toBe('accept_with_warnings');
      expect(FallbackActionEnumSchema.parse('pause')).toBe('pause');
    });
  });
});
