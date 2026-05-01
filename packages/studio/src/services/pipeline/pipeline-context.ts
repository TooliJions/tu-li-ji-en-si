import { readStudioBookRuntime, loadBookManifest } from '../../api/core-bridge';

export function buildBookScopedIntent(bookId: string, fallback: string) {
  const book = readStudioBookRuntime(bookId);
  const manifest = loadBookManifest(bookId);
  const parts = [
    manifest.currentFocus,
    book?.planningBrief,
    book?.brief,
    manifest.worldRules.length > 0
      ? `世界设定：${manifest.worldRules
          .slice(0, 3)
          .map((rule) => rule.rule)
          .join('；')}`
      : '',
    manifest.characters.length > 0
      ? `关键角色：${manifest.characters
          .slice(0, 3)
          .map((character) => character.name)
          .join('、')}`
      : '',
    manifest.hooks.length > 0
      ? `当前伏笔：${manifest.hooks
          .filter((hook) => ['open', 'progressing', 'deferred', 'dormant'].includes(hook.status))
          .slice(0, 2)
          .map((hook) => hook.description)
          .join('；')}`
      : '',
  ].filter((part): part is string => Boolean(part && part.trim()));

  return parts.join('；') || fallback;
}

export function mergeIntentWithBookContext(
  bookId: string,
  intent: string | undefined,
  fallback: string,
) {
  const baseContext = buildBookScopedIntent(bookId, fallback).trim();
  const chapterIntent = intent?.trim() ?? '';

  if (!chapterIntent) {
    return baseContext;
  }

  if (!baseContext) {
    return chapterIntent;
  }

  return `${baseContext}；${chapterIntent}`;
}

export function mergeOutlineContextWithBookContext(
  bookId: string,
  outlineContext: string | undefined,
) {
  const baseContext = buildBookScopedIntent(bookId, '').trim();
  const chapterContext = outlineContext?.trim() ?? '';

  if (!chapterContext) {
    return baseContext;
  }

  if (!baseContext) {
    return chapterContext;
  }

  return `${baseContext}\n${chapterContext}`;
}

export function resolveFastDraftChapterNumber(bookId: string) {
  const manifest = loadBookManifest(bookId);
  return Math.max(manifest.lastChapterWritten + 1, 1);
}

export function buildBookContextFromManifest(bookId: string): string {
  const manifest = loadBookManifest(bookId);
  const lines: string[] = [];

  if (manifest.currentFocus) {
    lines.push(`当前焦点: ${manifest.currentFocus}`);
  }

  if (manifest.characters.length > 0) {
    lines.push('角色:');
    for (const c of manifest.characters) {
      const traits = Array.isArray(c.traits)
        ? c.traits.join('、')
        : typeof c.traits === 'string'
          ? c.traits
          : '';
      lines.push(`  - ${c.name}(${c.role})${traits ? `: ${traits}` : ''}`);
    }
  }

  const activeHooks = manifest.hooks.filter(
    (h) => h.status === 'open' || h.status === 'progressing',
  );
  if (activeHooks.length > 0) {
    lines.push('进行中伏笔:');
    for (const h of activeHooks) {
      lines.push(`  - [${h.priority}] ${h.description}`);
    }
  }

  if (manifest.worldRules.length > 0) {
    lines.push('世界规则:');
    for (const r of manifest.worldRules) {
      lines.push(`  - [${r.category}] ${r.rule}`);
    }
  }

  return lines.join('\n');
}
