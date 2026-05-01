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
  const legacyChapter = chapter as ChapterIndexEntry & {
    chapterNumber?: number;
    status?: string;
    writtenAt?: string;
    plannedAt?: string;
  };
   
  const {
    chapterNumber: _cn,
    status: _s,
    writtenAt: _w,
    plannedAt: _p,
    ...rest
  } = legacyChapter as ChapterIndexEntry & {
    chapterNumber?: number;
    status?: string;
    writtenAt?: string;
    plannedAt?: string;
  };
  return {
    ...rest,
    number: chapterNumber,
    title: title ?? chapter.title,
    fileName: chapter.fileName || `chapter-${String(chapterNumber).padStart(4, '0')}.md`,
    wordCount: Number.isFinite(chapter.wordCount) ? chapter.wordCount : wordCount,
    createdAt: chapter.createdAt || new Date().toISOString(),
  };
}
