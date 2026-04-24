/// <reference types="node" />

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  getStudioRuntimeRootDir,
  setStudioRuntimeRootDir,
  isManagedTempDir,
} from '../runtime/runtime-config';
import {
  type StudioRuntimeBookRecord,
  hasStudioBookRuntime,
  initializeStudioBookRuntime,
  updateStudioBookRuntime,
  deleteStudioBookRuntime,
  readStudioBookRuntime,
  listStudioBookRuntimes,
} from '../runtime/book-repository';

import {
  setStudioDaemon,
  getStudioDaemon,
  clearStudioDaemon,
  stopAllStudioDaemons,
  clearAllStudioDaemons,
} from '../daemon/daemon-registry';

// Re-export everything for backward compatibility
export type { StudioRuntimeBookRecord } from '../runtime/book-repository';
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

export { setStudioDaemon, getStudioDaemon, clearStudioDaemon } from '../daemon/daemon-registry';

// ─── Test reset ─────────────────────────────────────────────────

export function resetStudioCoreBridgeForTests(rootDir?: string): void {
  stopAllStudioDaemons();
  clearAllStudioDaemons();

  const currentRoot = getStudioRuntimeRootDir();
  if (isManagedTempDir(currentRoot) && fs.existsSync(currentRoot)) {
    fs.rmSync(currentRoot, { recursive: true, force: true });
  }

  const newRoot = rootDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'cybernovelist-studio-'));
  setStudioRuntimeRootDir(newRoot);
  fs.mkdirSync(newRoot, { recursive: true });
}
