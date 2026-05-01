import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  getStudioRuntimeRootDir,
  hasStudioBookRuntime,
  readStudioBookRuntime,
  updateStudioBookRuntime,
} from '../core-bridge';

const WORKFLOW_DIR = ['story', 'workflow'] as const;

export function ensureWorkflowDocumentDir(bookId: string): string {
  const workflowDir = path.join(getStudioRuntimeRootDir(), bookId, ...WORKFLOW_DIR);
  fs.mkdirSync(workflowDir, { recursive: true });
  return workflowDir;
}

export function getWorkflowDocumentPath(bookId: string, fileName: string): string {
  return path.join(ensureWorkflowDocumentDir(bookId), fileName);
}

export function readWorkflowDocument<T>(bookId: string, fileName: string): T | null {
  if (!hasStudioBookRuntime(bookId)) {
    return null;
  }

  const filePath = getWorkflowDocumentPath(bookId, fileName);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

export function writeWorkflowDocument<T>(bookId: string, fileName: string, document: T): void {
  const filePath = getWorkflowDocumentPath(bookId, fileName);
  fs.writeFileSync(filePath, JSON.stringify(document, null, 2), 'utf-8');
  touchBookRuntime(bookId);
}

function touchBookRuntime(bookId: string): void {
  const book = readStudioBookRuntime(bookId);
  if (!book) {
    return;
  }

  updateStudioBookRuntime({
    ...book,
    updatedAt: new Date().toISOString(),
  });
}
