import { describe, it, expect } from 'vitest';
import { BookSchema, BookCreateSchema, BookGenreSchema } from './book';
import { ChapterSchema } from './chapter';
import { ManifestSchema, HookSchema, FactSchema, BookLockSchema } from './state';

describe('Book schemas', () => {
  it('should validate a valid book', () => {
    const book = {
      id: 'book-001',
      title: 'Test Book',
      genre: 'urban' as const,
      targetWords: 1000000,
      currentWords: 0,
      chapterCount: 0,
      status: 'active' as const,
      language: 'zh-CN' as const,
      promptVersion: 'v2',
      fanficMode: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = BookSchema.safeParse(book);
    expect(result.success).toBe(true);
  });

  it('should reject invalid genre', () => {
    const result = BookGenreSchema.safeParse('invalid-genre');
    expect(result.success).toBe(false);
  });

  it('should reject negative targetWords', () => {
    const result = BookCreateSchema.safeParse({
      title: 'Test',
      genre: 'urban',
      targetWords: -1,
      language: 'zh-CN',
    });
    expect(result.success).toBe(false);
  });
});

describe('Chapter schemas', () => {
  it('should validate a published chapter', () => {
    const chapter = {
      number: 1,
      title: 'First Chapter',
      status: 'published' as const,
      wordCount: 3200,
      qualityScore: 85,
      aiTraceScore: 0.15,
      auditStatus: 'passed' as const,
      metadata: {
        status: 'published' as const,
        flags: [],
        revisionHistory: [],
        requiresManualReview: false,
        confidence: 'high' as const,
        excludeFromBaseline: false,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = ChapterSchema.safeParse(chapter);
    expect(result.success).toBe(true);
  });

  it('should validate a draft chapter with null title', () => {
    const chapter = {
      number: 2,
      title: null,
      status: 'draft' as const,
      wordCount: 0,
      qualityScore: null,
      aiTraceScore: null,
      auditStatus: 'pending' as const,
      metadata: {
        status: 'draft' as const,
        flags: [],
        revisionHistory: [],
        requiresManualReview: false,
        confidence: 'high' as const,
        excludeFromBaseline: false,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = ChapterSchema.safeParse(chapter);
    expect(result.success).toBe(true);
  });
});

describe('State schemas', () => {
  it('should validate a hook', () => {
    const hook = {
      id: 'hook-001',
      description: 'The mysterious stranger',
      type: 'character',
      status: 'open' as const,
      priority: 'major' as const,
      plantedChapter: 1,
      relatedCharacters: [],
      relatedChapters: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = HookSchema.safeParse(hook);
    expect(result.success).toBe(true);
  });

  it('should validate a fact', () => {
    const fact = {
      id: 'fact-001',
      content: 'The protagonist has a scar on their left hand',
      chapterNumber: 3,
      confidence: 'high' as const,
      category: 'character' as const,
      createdAt: new Date().toISOString(),
    };

    const result = FactSchema.safeParse(fact);
    expect(result.success).toBe(true);
  });

  it('should validate a manifest', () => {
    const manifest = {
      bookId: 'book-001',
      versionToken: 1,
      lastChapterWritten: 0,
      hooks: [],
      facts: [],
      characters: [],
      worldRules: [],
      updatedAt: new Date().toISOString(),
    };

    const result = ManifestSchema.safeParse(manifest);
    expect(result.success).toBe(true);
  });

  it('should validate a book lock', () => {
    const lock = {
      bookId: 'book-001',
      pid: 12345,
      createdAt: new Date().toISOString(),
      operation: 'write',
    };

    const result = BookLockSchema.safeParse(lock);
    expect(result.success).toBe(true);
  });
});
