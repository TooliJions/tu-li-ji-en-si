import { describe, it, expect } from 'vitest';
import {
  PlatformAdapter,
  type PlatformChapter,
  type PlatformInput,
  type PlatformConfig,
} from './platform-adapter';

describe('PlatformAdapter', () => {
  const mockChapters: PlatformChapter[] = [
    { number: 1, title: '第一章 起点', content: '林晨走进了教室。\n今天是新学期第一天。' },
    { number: 2, title: '第二章 相遇', content: '苏小雨坐在窗边。\n她转过头看着林晨。' },
    { number: 3, title: '第三章 谜团', content: '档案室的门锁着。\n钥匙在哪里？' },
  ];

  const mockInput: PlatformInput = {
    title: '测试小说',
    author: '测试作者',
    description: '这是一本测试小说',
    chapters: mockChapters,
  };

  describe('Qidian (起点中文网) format', () => {
    const qidianConfig: PlatformConfig = { platform: 'qidian' };

    it('generates a single combined text file', async () => {
      const adapter = new PlatformAdapter();
      const result = await adapter.generate(mockInput, qidianConfig);

      expect(result.files).toBeTruthy();
      expect(result.files.length).toBeGreaterThan(0);
    });

    it('includes metadata header', async () => {
      const adapter = new PlatformAdapter();
      const result = await adapter.generate(mockInput, qidianConfig);
      const mainFile = result.files.find((f) => f.name.endsWith('.txt'));

      expect(mainFile).toBeTruthy();
      expect(mainFile!.content).toContain('书名：测试小说');
      expect(mainFile!.content).toContain('作者：测试作者');
      expect(mainFile!.content).toContain('简介：这是一本测试小说');
    });

    it('uses chapter separators with chapter number and title', async () => {
      const adapter = new PlatformAdapter();
      const result = await adapter.generate(mockInput, qidianConfig);
      const content = result.files[0].content;

      expect(content).toContain('第一章 起点');
      expect(content).toContain('第二章 相遇');
      expect(content).toContain('第三章 谜团');
    });

    it('separates chapters with dashed line', async () => {
      const adapter = new PlatformAdapter();
      const result = await adapter.generate(mockInput, qidianConfig);
      const content = result.files[0].content;

      // Qidian uses long dashed separator between chapters
      expect(content).toMatch(/-+\n/);
    });

    it('preserves chapter content with newlines', async () => {
      const adapter = new PlatformAdapter();
      const result = await adapter.generate(mockInput, qidianConfig);
      const content = result.files[0].content;

      expect(content).toContain('林晨走进了教室。');
      expect(content).toContain('今天是新学期第一天。');
      expect(content).toContain('苏小雨坐在窗边');
    });

    it('handles missing description gracefully', async () => {
      const adapter = new PlatformAdapter();
      const result = await adapter.generate({ ...mockInput, description: undefined }, qidianConfig);
      const content = result.files[0].content;

      expect(content).toContain('书名：测试小说');
      expect(content).toContain('作者：测试作者');
    });

    it('handles empty chapters', async () => {
      const adapter = new PlatformAdapter();
      const result = await adapter.generate({ ...mockInput, chapters: [] }, qidianConfig);

      expect(result.files).toBeTruthy();
      expect(result.files.length).toBe(1);
    });
  });

  describe('Fanqiao (番茄小说) format', () => {
    const fanqiaoConfig: PlatformConfig = { platform: 'fanqiao' };

    it('generates separate chapter files', async () => {
      const adapter = new PlatformAdapter();
      const result = await adapter.generate(mockInput, fanqiaoConfig);

      expect(result.files.length).toBe(4); // 3 chapters + 1 metadata
    });

    it('includes metadata.json file', async () => {
      const adapter = new PlatformAdapter();
      const result = await adapter.generate(mockInput, fanqiaoConfig);
      const metaFile = result.files.find((f) => f.name === 'metadata.json');

      expect(metaFile).toBeTruthy();
      const meta = JSON.parse(metaFile!.content);
      expect(meta.title).toBe('测试小说');
      expect(meta.author).toBe('测试作者');
      expect(meta.description).toBe('这是一本测试小说');
      expect(meta.chapterCount).toBe(3);
    });

    it('generates numbered chapter files', async () => {
      const adapter = new PlatformAdapter();
      const result = await adapter.generate(mockInput, fanqiaoConfig);

      const chapterFiles = result.files
        .filter((f) => f.name.startsWith('chapter_'))
        .sort((a, b) => a.name.localeCompare(b.name));

      expect(chapterFiles.length).toBe(3);
      expect(chapterFiles[0].name).toBe('chapter_001.txt');
      expect(chapterFiles[1].name).toBe('chapter_002.txt');
      expect(chapterFiles[2].name).toBe('chapter_003.txt');
    });

    it('includes chapter title as heading in each file', async () => {
      const adapter = new PlatformAdapter();
      const result = await adapter.generate(mockInput, fanqiaoConfig);
      const ch1 = result.files.find((f) => f.name === 'chapter_001.txt');

      expect(ch1).toBeTruthy();
      expect(ch1!.content).toContain('第一章 起点');
      expect(ch1!.content).toContain('林晨走进了教室。');
    });

    it('separates title and content with blank line', async () => {
      const adapter = new PlatformAdapter();
      const result = await adapter.generate(mockInput, fanqiaoConfig);
      const ch1 = result.files.find((f) => f.name === 'chapter_001.txt');

      expect(ch1).toBeTruthy();
      // Title followed by blank line then content
      expect(ch1!.content).toMatch(/第一章 起点\n\n/);
    });

    it('metadata includes chapter list', async () => {
      const adapter = new PlatformAdapter();
      const result = await adapter.generate(mockInput, fanqiaoConfig);
      const metaFile = result.files.find((f) => f.name === 'metadata.json');
      const meta = JSON.parse(metaFile!.content);

      expect(meta.chapters).toBeTruthy();
      expect(meta.chapters.length).toBe(3);
      expect(meta.chapters[0]).toEqual({
        number: 1,
        title: '第一章 起点',
        file: 'chapter_001.txt',
      });
    });
  });

  describe('generic/text-only format', () => {
    const genericConfig: PlatformConfig = { platform: 'text' };

    it('generates plain text with simple chapter separation', async () => {
      const adapter = new PlatformAdapter();
      const result = await adapter.generate(mockInput, genericConfig);
      const content = result.files[0].content;

      expect(content).toContain('测试小说');
      expect(content).toContain('测试作者');
      expect(content).toContain('第一章 起点');
      expect(content).toContain('第二章 相遇');
    });
  });

  describe('output format', () => {
    it('returns file list with name and content', async () => {
      const adapter = new PlatformAdapter();
      const result = await adapter.generate(mockInput, { platform: 'qidian' });

      expect(result.files).toBeInstanceOf(Array);
      expect(result.files[0]).toHaveProperty('name');
      expect(result.files[0]).toHaveProperty('content');
      expect(result.files[0].name).toMatch(/\.txt$/);
    });

    it('supports custom filename', async () => {
      const adapter = new PlatformAdapter();
      const result = await adapter.generate(mockInput, {
        platform: 'qidian',
        filename: 'my-novel.txt',
      });

      expect(result.files[0].name).toBe('my-novel.txt');
    });
  });
});
