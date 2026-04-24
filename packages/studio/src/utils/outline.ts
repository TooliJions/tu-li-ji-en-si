import type { OutlineResult } from '@cybernovelist/core';

/**
 * Serialize an outline result into a human-readable string.
 */
export function serializeOutline(outline: OutlineResult): string {
  const acts = Array.isArray(outline.acts) ? outline.acts : [];
  const structureLabel = acts.length > 3 ? '卷' : '幕';
  return acts
    .map((act) => {
      const chapters = Array.isArray(act.chapters) ? act.chapters : [];
      const chapterLines = chapters
        .map((chapter) => `- 第${chapter.chapterNumber}章 ${chapter.title}：${chapter.summary}`)
        .join('\n');
      return `第${act.actNumber}${structureLabel} ${act.title}\n${act.summary}\n${chapterLines}`;
    })
    .join('\n\n');
}
