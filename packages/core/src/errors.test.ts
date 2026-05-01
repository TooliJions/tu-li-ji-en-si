import { describe, it, expect } from 'vitest';
import {
  CyberNovelistError,
  StateError,
  ChapterError,
  AgentError,
  PipelineError,
  SecurityError,
} from './errors';

describe('CyberNovelistError', () => {
  it('stores message, code and context', () => {
    const err = new CyberNovelistError('测试错误', 'TEST_CODE', { key: 'value' });
    expect(err.message).toBe('测试错误');
    expect(err.code).toBe('TEST_CODE');
    expect(err.context).toEqual({ key: 'value' });
    expect(err.name).toBe('CyberNovelistError');
  });

  it('works without context', () => {
    const err = new CyberNovelistError('无上下文', 'NO_CTX');
    expect(err.context).toBeUndefined();
  });

  it('is instance of Error', () => {
    const err = new CyberNovelistError('测试', 'TEST');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('StateError', () => {
  it('has correct code and name', () => {
    const err = new StateError('状态错误', { bookId: 'b1' });
    expect(err.code).toBe('STATE_ERROR');
    expect(err.name).toBe('StateError');
    expect(err.context).toEqual({ bookId: 'b1' });
  });
});

describe('ChapterError', () => {
  it('has correct code and name', () => {
    const err = new ChapterError('章节错误', { chapter: 3 });
    expect(err.code).toBe('CHAPTER_ERROR');
    expect(err.name).toBe('ChapterError');
  });
});

describe('AgentError', () => {
  it('has correct code and name', () => {
    const err = new AgentError('Agent 错误');
    expect(err.code).toBe('AGENT_ERROR');
    expect(err.name).toBe('AgentError');
  });
});

describe('PipelineError', () => {
  it('has correct code and name', () => {
    const err = new PipelineError('流水线错误');
    expect(err.code).toBe('PIPELINE_ERROR');
    expect(err.name).toBe('PipelineError');
  });
});

describe('SecurityError', () => {
  it('has correct code and name', () => {
    const err = new SecurityError('安全错误');
    expect(err.code).toBe('SECURITY_ERROR');
    expect(err.name).toBe('SecurityError');
  });
});
