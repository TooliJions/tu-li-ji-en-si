import type { ChapterIndexEntry } from '../models/chapter';

export function findChapterEntry(
  chapters: ChapterIndexEntry[],
  chapterNumber: number
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
  wordCount: number
): void {
  const legacyChapter = chapter as ChapterIndexEntry & {
    chapterNumber?: number;
    status?: string;
    writtenAt?: string;
    plannedAt?: string;
  };
  chapter.number = chapterNumber;
  chapter.title = title;
  chapter.fileName = chapter.fileName || `chapter-${String(chapterNumber).padStart(4, '0')}.md`;
  chapter.wordCount = Number.isFinite(chapter.wordCount) ? chapter.wordCount : wordCount;
  chapter.createdAt = chapter.createdAt || new Date().toISOString();
  delete legacyChapter.chapterNumber;
  delete legacyChapter.status;
  delete legacyChapter.writtenAt;
  delete legacyChapter.plannedAt;
}
