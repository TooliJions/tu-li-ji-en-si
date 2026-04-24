import * as fs from 'node:fs';
import * as path from 'node:path';

const TEMP_RUNTIME_PREFIX = 'cybernovelist-studio-';

let runtimeRootDir = resolveDefaultRuntimeRoot();

export function resolveDefaultRuntimeRoot(): string {
  const cwd = process.cwd();
  let dir = cwd;
  const fsRoot = path.parse(dir).root;
  while (dir !== fsRoot) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { name?: string };
        if (pkg.name === '@cybernovelist/studio') {
          return path.join(dir, '.runtime');
        }
      } catch (err) {
        console.warn(
          `[runtime-config] Malformed package.json at ${pkgPath}:`,
          err instanceof Error ? err.message : String(err)
        );
      }
    }
    dir = path.dirname(dir);
  }
  return path.join(cwd, 'packages', 'studio', '.runtime');
}

function ensureRuntimeRoot(): void {
  fs.mkdirSync(runtimeRootDir, { recursive: true });
}

export function getStudioRuntimeRootDir(): string {
  ensureRuntimeRoot();
  return runtimeRootDir;
}

export function setStudioRuntimeRootDir(dir: string): void {
  runtimeRootDir = dir;
}

export function isManagedTempDir(dirPath: string): boolean {
  return path.basename(dirPath).startsWith(TEMP_RUNTIME_PREFIX);
}

export function resetRuntimeConfig(rootDir?: string): void {
  const envDir = process.env.CYBERNOVELIST_STUDIO_RUNTIME_DIR;
  runtimeRootDir = rootDir ?? envDir ?? resolveDefaultRuntimeRoot();
  ensureRuntimeRoot();
}
