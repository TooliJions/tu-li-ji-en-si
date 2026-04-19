import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { TelemetryLogger } from './logger';

describe('TelemetryLogger', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'cn-telemetry-'));
    fs.mkdirSync(path.join(root, 'book-001', 'story', 'state'), { recursive: true });
  });

  it('record() 首次写入时创建文件并返回累计结果', () => {
    const logger = new TelemetryLogger(root);
    const result = logger.record('book-001', 1, 'writer', {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });

    expect(result.bookId).toBe('book-001');
    expect(result.chapterNumber).toBe(1);
    expect(result.channels.writer.totalTokens).toBe(150);
    expect(result.channels.writer.calls).toBe(1);
    expect(result.totalTokens).toBe(150);

    const filePath = path.join(root, 'book-001', 'story', 'state', 'telemetry', 'chapter-0001.json');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('record() 多次累加同一通道', () => {
    const logger = new TelemetryLogger(root);
    logger.record('book-001', 1, 'writer', { promptTokens: 100, completionTokens: 50, totalTokens: 150 });
    const result = logger.record('book-001', 1, 'writer', {
      promptTokens: 200,
      completionTokens: 80,
      totalTokens: 280,
    });

    expect(result.channels.writer.totalTokens).toBe(430);
    expect(result.channels.writer.calls).toBe(2);
    expect(result.totalTokens).toBe(430);
  });

  it('record() 多通道累加独立', () => {
    const logger = new TelemetryLogger(root);
    logger.record('book-001', 1, 'writer', { promptTokens: 100, completionTokens: 50, totalTokens: 150 });
    logger.record('book-001', 1, 'auditor', { promptTokens: 60, completionTokens: 30, totalTokens: 90 });
    const result = logger.record('book-001', 1, 'reviser', {
      promptTokens: 40,
      completionTokens: 20,
      totalTokens: 60,
    });

    expect(result.channels.writer.totalTokens).toBe(150);
    expect(result.channels.auditor.totalTokens).toBe(90);
    expect(result.channels.reviser.totalTokens).toBe(60);
    expect(result.channels.planner.totalTokens).toBe(0);
    expect(result.totalTokens).toBe(300);
  });

  it('read() 对不存在章节返回 null', () => {
    const logger = new TelemetryLogger(root);
    expect(logger.read('book-001', 99)).toBeNull();
  });

  it('read() 返回已写入章节', () => {
    const logger = new TelemetryLogger(root);
    logger.record('book-001', 2, 'planner', { promptTokens: 30, completionTokens: 10, totalTokens: 40 });
    const got = logger.read('book-001', 2);
    expect(got).not.toBeNull();
    expect(got!.channels.planner.totalTokens).toBe(40);
  });

  it('listBookTelemetry() 返回该书所有章节遥测', () => {
    const logger = new TelemetryLogger(root);
    logger.record('book-001', 1, 'writer', { promptTokens: 10, completionTokens: 5, totalTokens: 15 });
    logger.record('book-001', 2, 'writer', { promptTokens: 20, completionTokens: 10, totalTokens: 30 });
    logger.record('book-001', 3, 'writer', { promptTokens: 30, completionTokens: 15, totalTokens: 45 });

    const all = logger.listBookTelemetry('book-001');
    expect(all.length).toBe(3);
    expect(all.map((x) => x.chapterNumber)).toEqual([1, 2, 3]);
  });

  it('listBookTelemetry() 对空 book 返回 []', () => {
    const logger = new TelemetryLogger(root);
    expect(logger.listBookTelemetry('book-empty')).toEqual([]);
  });

  it('read() 对损坏 JSON 返回 null 而不抛出', () => {
    const logger = new TelemetryLogger(root);
    const dir = path.join(root, 'book-001', 'story', 'state', 'telemetry');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'chapter-0001.json'), '{ not valid json', 'utf-8');
    expect(logger.read('book-001', 1)).toBeNull();
  });

  it('listBookTelemetry() 跳过损坏 JSON 不中断其他章节', () => {
    const logger = new TelemetryLogger(root);
    logger.record('book-001', 1, 'writer', { promptTokens: 10, completionTokens: 5, totalTokens: 15 });
    const dir = path.join(root, 'book-001', 'story', 'state', 'telemetry');
    fs.writeFileSync(path.join(dir, 'chapter-0002.json'), '{ broken', 'utf-8');
    logger.record('book-001', 3, 'writer', { promptTokens: 20, completionTokens: 10, totalTokens: 30 });

    const all = logger.listBookTelemetry('book-001');
    expect(all.length).toBe(2);
    expect(all.map((x) => x.chapterNumber)).toEqual([1, 3]);
  });
});
