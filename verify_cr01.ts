import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { StateManager } from './packages/core/src/state/manager';

async function testStaleLock() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-test-'));
  const stateManager = new StateManager(tempDir);
  const bookId = 'test-book';
  stateManager.ensureBookStructure(bookId);

  const lockPath = path.join(tempDir, bookId, '.lock');

  // 1. Create a "stale" lock with a non-existent PID
  const staleLockInfo = {
    bookId,
    pid: 999999, // Highly unlikely to exist
    createdAt: new Date().toISOString(),
    operation: 'test-stale',
  };
  fs.writeFileSync(lockPath, JSON.stringify(staleLockInfo, null, 2));

  console.log('Created stale lock file.');

  // 2. Try to acquire lock
  try {
    const lock = stateManager.acquireBookLock(bookId, 'new-op');
    console.log('Successfully acquired lock after stale lock cleanup:', lock);
    if (lock && lock.pid === process.pid) {
      console.log('SUCCESS: Stale lock was cleaned up and new lock acquired.');
    } else {
      console.error('FAILURE: Lock acquisition returned unexpected result.');
      process.exit(1);
    }
  } catch (err) {
    console.error('FAILURE: Failed to acquire lock:', err);
    process.exit(1);
  }

  // 3. Try to acquire lock again (should fail)
  try {
    stateManager.acquireBookLock(bookId, 'should-fail');
    console.error('FAILURE: Acquired lock that should be held by previous step.');
    process.exit(1);
  } catch (err) {
    console.log('SUCCESS: Correctly failed to acquire already held lock:', (err as Error).message);
  }

  // Cleanup
  fs.rmSync(tempDir, { recursive: true, force: true });
}

testStaleLock().catch((err) => {
  console.error(err);
  process.exit(1);
});
