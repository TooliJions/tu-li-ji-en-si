import type { ChapterIndexEntry } from '../models/chapter';

export function findChapterEntry(
  chapters: ChapterIndexEntry[],
  chapterNumber: number,
): ChapterIndexEntry | undefined {
  return chapters.find((chapter) => {
    const legacyChapter = chapter as ChapterIndexEntry & { chapterNumber?: number };
    return chapter.number === chapterNumber || legacyChapter.chapterNumber === chapterNumber;
  });
}

export function normalizeChapterEntry(
  chapter: ChapterIndexEntry,
  chapterNumber: number,
  title: string | null,
  wordCount: number,
): ChapterIndexEntry {
  const rest = {
    ...(chapter as ChapterIndexEntry & {
      chapterNumber?: number;
      status?: string;
      writtenAt?: string;
      plannedAt?: string;
    }),
  };
  delete rest.chapterNumber;
  delete rest.status;
  delete rest.writtenAt;
  delete rest.plannedAt;
  return {
    ...rest,
    number: chapterNumber,
    title: title ?? chapter.title,
    fileName: chapter.fileName || `chapter-${String(chapterNumber).padStart(4, '0')}.md`,
    wordCount: Number.isFinite(chapter.wordCount) ? chapter.wordCount : wordCount,
    createdAt: chapter.createdAt || new Date().toISOString(),
  };
}
