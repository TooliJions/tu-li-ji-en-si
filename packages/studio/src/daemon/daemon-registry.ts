import type { DaemonScheduler } from '@cybernovelist/core';

const daemonRegistry = new Map<string, DaemonScheduler>();

export function setStudioDaemon(bookId: string, daemon: DaemonScheduler): void {
  daemonRegistry.get(bookId)?.stop();
  daemonRegistry.set(bookId, daemon);
}

export function getStudioDaemon(bookId: string): DaemonScheduler | undefined {
  return daemonRegistry.get(bookId);
}

export function clearStudioDaemon(bookId: string): void {
  daemonRegistry.delete(bookId);
}

export function stopAllStudioDaemons(): void {
  for (const daemon of daemonRegistry.values()) {
    daemon.stop();
  }
}

export function clearAllStudioDaemons(): void {
  daemonRegistry.clear();
}
