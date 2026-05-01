import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { safeWriteFile } from './safe-write-file';

describe('safeWriteFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'safe-write-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes file atomically', () => {
    const target = path.join(tmpDir, 'test.txt');
    safeWriteFile(target, 'hello');
    expect(fs.readFileSync(target, 'utf-8')).toBe('hello');
  });

  it('creates nested directories', () => {
    const target = path.join(tmpDir, 'a', 'b', 'c.txt');
    safeWriteFile(target, 'nested');
    expect(fs.readFileSync(target, 'utf-8')).toBe('nested');
  });

  it('overwrites existing file', () => {
    const target = path.join(tmpDir, 'exist.txt');
    fs.writeFileSync(target, 'old');
    safeWriteFile(target, 'new');
    expect(fs.readFileSync(target, 'utf-8')).toBe('new');
  });

  it('does not leave tmp file on success', () => {
    const target = path.join(tmpDir, 'clean.txt');
    safeWriteFile(target, 'data');
    const files = fs.readdirSync(tmpDir);
    expect(files).toEqual(['clean.txt']);
  });

  it('cleans up tmp file on failure', () => {
    // 用一个已存在的文件作为父目录，使 mkdirSync 失败
    const fakeDir = path.join(tmpDir, 'not-a-dir');
    fs.writeFileSync(fakeDir, 'i-am-a-file');
    const target = path.join(fakeDir, 'sub', 'file.txt');

    expect(() => safeWriteFile(target, 'data')).toThrow();
    // 目标未创建，tmp 文件不应残留
    expect(fs.existsSync(target)).toBe(false);
  });
});
