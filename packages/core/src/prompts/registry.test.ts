import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PromptRegistry, type RegistryManifest } from './registry';

// ── Fixture helpers ──────────────────────────────────────────────

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-registry-'));
}

function writeManifest(dir: string, manifest: RegistryManifest): void {
  fs.writeFileSync(path.join(dir, 'registry.json'), JSON.stringify(manifest, null, 2));
}

function writePrompt(dir: string, version: string, name: string, content: string): void {
  const versionDir = path.join(dir, version);
  if (!fs.existsSync(versionDir)) fs.mkdirSync(versionDir, { recursive: true });
  fs.writeFileSync(path.join(versionDir, `${name}.md`), content);
}

// ── Tests ────────────────────────────────────────────────────────

describe('PromptRegistry', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // ── Constructor ────────────────────────────────────────────────

  describe('constructor', () => {
    it('initializes with base directory', () => {
      const registry = new PromptRegistry({ baseDir: tmpDir });
      expect(registry).toBeDefined();
    });
  });

  // ── loadManifest ───────────────────────────────────────────────

  describe('loadManifest()', () => {
    it('reads registry.json', () => {
      writeManifest(tmpDir, {
        latest: 'v2',
        versions: {
          v1: { createdAt: '2025-01-01T00:00:00.000Z' },
          v2: { createdAt: '2025-06-01T00:00:00.000Z' },
        },
      });
      const registry = new PromptRegistry({ baseDir: tmpDir });
      const manifest = registry.loadManifest();
      expect(manifest.latest).toBe('v2');
      expect(Object.keys(manifest.versions)).toEqual(['v1', 'v2']);
    });

    it('throws when registry.json is missing', () => {
      const registry = new PromptRegistry({ baseDir: tmpDir });
      expect(() => registry.loadManifest()).toThrow(/registry\.json/);
    });

    it('throws when registry.json is malformed', () => {
      fs.writeFileSync(path.join(tmpDir, 'registry.json'), 'not-json');
      const registry = new PromptRegistry({ baseDir: tmpDir });
      expect(() => registry.loadManifest()).toThrow();
    });

    it('throws when latest points to missing version', () => {
      writeManifest(tmpDir, {
        latest: 'v3',
        versions: { v1: { createdAt: '2025-01-01T00:00:00.000Z' } },
      });
      const registry = new PromptRegistry({ baseDir: tmpDir });
      expect(() => registry.loadManifest()).toThrow(/latest.*v3/);
    });
  });

  // ── resolveVersion ─────────────────────────────────────────────

  describe('resolveVersion()', () => {
    beforeEach(() => {
      writeManifest(tmpDir, {
        latest: 'v2',
        versions: {
          v1: { createdAt: '2025-01-01T00:00:00.000Z' },
          v2: { createdAt: '2025-06-01T00:00:00.000Z' },
        },
      });
    });

    it('returns concrete version for "latest"', () => {
      const registry = new PromptRegistry({ baseDir: tmpDir });
      expect(registry.resolveVersion('latest')).toBe('v2');
    });

    it('returns concrete version unchanged', () => {
      const registry = new PromptRegistry({ baseDir: tmpDir });
      expect(registry.resolveVersion('v1')).toBe('v1');
      expect(registry.resolveVersion('v2')).toBe('v2');
    });

    it('throws when version does not exist', () => {
      const registry = new PromptRegistry({ baseDir: tmpDir });
      expect(() => registry.resolveVersion('v9')).toThrow(/v9/);
    });
  });

  // ── listVersions ───────────────────────────────────────────────

  describe('listVersions()', () => {
    it('returns sorted version list', () => {
      writeManifest(tmpDir, {
        latest: 'v2',
        versions: {
          v2: { createdAt: '2025-06-01T00:00:00.000Z' },
          v1: { createdAt: '2025-01-01T00:00:00.000Z' },
        },
      });
      const registry = new PromptRegistry({ baseDir: tmpDir });
      expect(registry.listVersions()).toEqual(['v1', 'v2']);
    });

    it('returns empty array when no versions defined', () => {
      writeManifest(tmpDir, { latest: '', versions: {} });
      const registry = new PromptRegistry({ baseDir: tmpDir });
      expect(registry.listVersions()).toEqual([]);
    });
  });

  // ── loadPrompt ─────────────────────────────────────────────────

  describe('loadPrompt()', () => {
    beforeEach(() => {
      writeManifest(tmpDir, {
        latest: 'v2',
        versions: {
          v1: { createdAt: '2025-01-01T00:00:00.000Z' },
          v2: { createdAt: '2025-06-01T00:00:00.000Z' },
        },
      });
      writePrompt(tmpDir, 'v1', 'outline-planner', '# v1 大纲规划提示词\n旧版本内容');
      writePrompt(tmpDir, 'v2', 'outline-planner', '# v2 大纲规划提示词\n新版本内容');
      writePrompt(tmpDir, 'v2', 'chapter-executor', '# v2 章节执行提示词');
    });

    it('loads prompt by explicit version', () => {
      const registry = new PromptRegistry({ baseDir: tmpDir });
      const prompt = registry.loadPrompt('outline-planner', 'v1');
      expect(prompt.template).toContain('v1 大纲规划提示词');
      expect(prompt.version).toBe('v1');
      expect(prompt.name).toBe('outline-planner');
    });

    it('loads prompt with version="latest"', () => {
      const registry = new PromptRegistry({ baseDir: tmpDir });
      const prompt = registry.loadPrompt('outline-planner', 'latest');
      expect(prompt.template).toContain('v2 大纲规划提示词');
      expect(prompt.version).toBe('v2');
    });

    it('uses latest by default when version omitted', () => {
      const registry = new PromptRegistry({ baseDir: tmpDir });
      const prompt = registry.loadPrompt('outline-planner');
      expect(prompt.version).toBe('v2');
    });

    it('throws when prompt file does not exist in version', () => {
      const registry = new PromptRegistry({ baseDir: tmpDir });
      expect(() => registry.loadPrompt('chapter-executor', 'v1')).toThrow(/chapter-executor/);
    });

    it('throws when version does not exist', () => {
      const registry = new PromptRegistry({ baseDir: tmpDir });
      expect(() => registry.loadPrompt('outline-planner', 'v9')).toThrow(/v9/);
    });

    it('caches loaded prompts', () => {
      const registry = new PromptRegistry({ baseDir: tmpDir });
      const first = registry.loadPrompt('outline-planner', 'v1');
      // Mutate the file after first load
      writePrompt(tmpDir, 'v1', 'outline-planner', '# 已修改');
      const second = registry.loadPrompt('outline-planner', 'v1');
      expect(second.template).toBe(first.template);
    });
  });

  // ── render() ───────────────────────────────────────────────────

  describe('render()', () => {
    beforeEach(() => {
      writeManifest(tmpDir, {
        latest: 'v2',
        versions: {
          v2: { createdAt: '2025-06-01T00:00:00.000Z' },
        },
      });
      writePrompt(
        tmpDir,
        'v2',
        'chapter-executor',
        '题材: {{genre}}\n字数: {{wordCount}}\n章节: {{chapterNumber}}'
      );
    });

    it('interpolates template variables', () => {
      const registry = new PromptRegistry({ baseDir: tmpDir });
      const result = registry.render('chapter-executor', {
        genre: '玄幻',
        wordCount: '3000',
        chapterNumber: '5',
      });
      expect(result).toBe('题材: 玄幻\n字数: 3000\n章节: 5');
    });

    it('leaves unmatched placeholders intact', () => {
      const registry = new PromptRegistry({ baseDir: tmpDir });
      const result = registry.render('chapter-executor', { genre: '玄幻' });
      expect(result).toContain('题材: 玄幻');
      expect(result).toContain('{{wordCount}}');
    });

    it('supports explicit version param', () => {
      writePrompt(tmpDir, 'v2', 'simple', 'Hello {{name}}');
      const registry = new PromptRegistry({ baseDir: tmpDir });
      const result = registry.render('simple', { name: '世界' }, 'v2');
      expect(result).toBe('Hello 世界');
    });

    it('handles repeated placeholders', () => {
      writePrompt(tmpDir, 'v2', 'repeat', '{{x}} 和 {{x}}');
      const registry = new PromptRegistry({ baseDir: tmpDir });
      expect(registry.render('repeat', { x: 'A' })).toBe('A 和 A');
    });

    it('does not interpret regex special chars in values', () => {
      writePrompt(tmpDir, 'v2', 'regex', '内容: {{val}}');
      const registry = new PromptRegistry({ baseDir: tmpDir });
      expect(registry.render('regex', { val: '$1 \\n' })).toBe('内容: $1 \\n');
    });
  });

  // ── hasPrompt ──────────────────────────────────────────────────

  describe('hasPrompt()', () => {
    beforeEach(() => {
      writeManifest(tmpDir, {
        latest: 'v2',
        versions: {
          v1: { createdAt: '2025-01-01T00:00:00.000Z' },
          v2: { createdAt: '2025-06-01T00:00:00.000Z' },
        },
      });
      writePrompt(tmpDir, 'v2', 'outline-planner', 'content');
    });

    it('returns true when prompt exists', () => {
      const registry = new PromptRegistry({ baseDir: tmpDir });
      expect(registry.hasPrompt('outline-planner', 'v2')).toBe(true);
    });

    it('returns false when prompt missing in version', () => {
      const registry = new PromptRegistry({ baseDir: tmpDir });
      expect(registry.hasPrompt('outline-planner', 'v1')).toBe(false);
    });

    it('returns false when version missing', () => {
      const registry = new PromptRegistry({ baseDir: tmpDir });
      expect(registry.hasPrompt('outline-planner', 'v9')).toBe(false);
    });

    it('resolves "latest" alias', () => {
      const registry = new PromptRegistry({ baseDir: tmpDir });
      expect(registry.hasPrompt('outline-planner', 'latest')).toBe(true);
    });
  });

  // ── Acceptance: 按版本加载提示词 + latest 软链接 ────────────────

  describe('acceptance: 可按版本加载提示词，latest 软链接生效', () => {
    it('loads v1 and v2 separately and latest resolves to v2', () => {
      writeManifest(tmpDir, {
        latest: 'v2',
        versions: {
          v1: { createdAt: '2025-01-01T00:00:00.000Z' },
          v2: { createdAt: '2025-06-01T00:00:00.000Z' },
        },
      });
      writePrompt(tmpDir, 'v1', 'outline-planner', 'V1 模板');
      writePrompt(tmpDir, 'v2', 'outline-planner', 'V2 模板');

      const registry = new PromptRegistry({ baseDir: tmpDir });

      const v1 = registry.loadPrompt('outline-planner', 'v1');
      const v2 = registry.loadPrompt('outline-planner', 'v2');
      const latest = registry.loadPrompt('outline-planner', 'latest');
      const def = registry.loadPrompt('outline-planner');

      expect(v1.template).toBe('V1 模板');
      expect(v2.template).toBe('V2 模板');
      expect(latest.template).toBe('V2 模板');
      expect(latest.version).toBe('v2');
      expect(def.template).toBe('V2 模板');
    });
  });
});
