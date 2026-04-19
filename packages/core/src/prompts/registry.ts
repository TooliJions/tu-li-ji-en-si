import * as fs from 'fs';
import * as path from 'path';

// ── Types ────────────────────────────────────────────────────────────

export interface VersionMeta {
  createdAt: string;
  description?: string;
  deprecated?: boolean;
}

export interface RegistryManifest {
  /** 当前默认 / "latest" 指向的具体版本号（如 "v2"）。 */
  latest: string;
  /** 已注册版本列表 → 元数据。 */
  versions: Record<string, VersionMeta>;
}

export interface PromptTemplate {
  name: string;
  version: string;
  template: string;
}

export interface PromptRegistryConfig {
  baseDir: string;
}

const LATEST_ALIAS = 'latest';

// ── PromptRegistry ───────────────────────────────────────────────────

export class PromptRegistry {
  readonly #baseDir: string;
  #manifestCache: RegistryManifest | null = null;
  readonly #promptCache = new Map<string, PromptTemplate>();

  constructor(config: PromptRegistryConfig) {
    this.#baseDir = config.baseDir;
  }

  loadManifest(): RegistryManifest {
    if (this.#manifestCache) return this.#manifestCache;

    const manifestPath = path.join(this.#baseDir, 'registry.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`registry.json not found at ${manifestPath}`);
    }

    const raw = fs.readFileSync(manifestPath, 'utf-8');
    let parsed: RegistryManifest;
    try {
      parsed = JSON.parse(raw) as RegistryManifest;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to parse registry.json: ${msg}`);
    }

    if (parsed.latest && !(parsed.latest in parsed.versions)) {
      throw new Error(
        `registry.json: latest="${parsed.latest}" does not match any registered version`
      );
    }

    this.#manifestCache = parsed;
    return parsed;
  }

  resolveVersion(version: string): string {
    const manifest = this.loadManifest();
    const concrete = version === LATEST_ALIAS ? manifest.latest : version;
    if (!(concrete in manifest.versions)) {
      throw new Error(`Unknown prompt version: ${version}`);
    }
    return concrete;
  }

  listVersions(): string[] {
    const manifest = this.loadManifest();
    return Object.keys(manifest.versions).sort();
  }

  hasPrompt(name: string, version: string): boolean {
    let concrete: string;
    try {
      concrete = this.resolveVersion(version);
    } catch {
      return false;
    }
    return fs.existsSync(this.#promptPath(name, concrete));
  }

  loadPrompt(name: string, version: string = LATEST_ALIAS): PromptTemplate {
    const concrete = this.resolveVersion(version);
    const cacheKey = `${concrete}/${name}`;
    const cached = this.#promptCache.get(cacheKey);
    if (cached) return cached;

    const filePath = this.#promptPath(name, concrete);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Prompt "${name}" not found in version "${concrete}" (${filePath})`);
    }

    const template = fs.readFileSync(filePath, 'utf-8');
    const prompt: PromptTemplate = { name, version: concrete, template };
    this.#promptCache.set(cacheKey, prompt);
    return prompt;
  }

  render(name: string, vars: Record<string, string>, version: string = LATEST_ALIAS): string {
    const { template } = this.loadPrompt(name, version);
    return interpolate(template, vars);
  }

  #promptPath(name: string, version: string): string {
    return path.join(this.#baseDir, version, `${name}.md`);
  }
}

// ── Utils ────────────────────────────────────────────────────────────

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match;
  });
}
