/// <reference types="node" />

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  getStudioRuntimeRootDir,
  setStudioRuntimeRootDir,
  isManagedTempDir,
} from '../runtime/runtime-config';

// Re-export everything for backward compatibility

export { getStudioRuntimeRootDir } from '../runtime/runtime-config';
export {
  hasStudioBookRuntime,
  initializeStudioBookRuntime,
  updateStudioBookRuntime,
  deleteStudioBookRuntime,
  readStudioBookRuntime,
  listStudioBookRuntimes,
  loadBookManifest,
  saveBookManifest,
} from '../runtime/book-repository';

// ─── Test reset ─────────────────────────────────────────────────

export function resetStudioCoreBridgeForTests(rootDir?: string): void {
  const currentRoot = getStudioRuntimeRootDir();
  if (isManagedTempDir(currentRoot) && fs.existsSync(currentRoot)) {
    fs.rmSync(currentRoot, { recursive: true, force: true });
  }

  const newRoot = rootDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'cybernovelist-studio-'));
  setStudioRuntimeRootDir(newRoot);
  fs.mkdirSync(newRoot, { recursive: true });
}
