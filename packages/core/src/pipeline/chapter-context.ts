import * as fs from 'fs';
import type { StateManager } from '../state/manager';

// ── Outline Context ─────────────────────────────────────────────

/**
 * 根据章节号定位大纲中所属卷/幕，构建卷级上下文。
 * 如果大纲为空或无法定位，回退到 fallback 文本。
 */
export function buildOutlineContext(
  outline: Array<{
    actNumber: number;
    title: string;
    summary: string;
    chapters: Array<{ chapterNumber: number; title: string; summary: string }>;
  }>,
  chapterNumber: number,
  fallback: string,
  bookId: string,
  stateManager: StateManager,
): string {
  if (!outline || outline.length === 0) return fallback;

  const isLongForm = outline.length > 3;
  const volumeLabel = isLongForm ? '卷' : '幕';

  // 读取书籍元数据中的总章节数和总字数
  const bookPath = stateManager.getBookPath(bookId, 'book.json');
  let totalChapters = 0;
  let totalWords = 0;
  if (fs.existsSync(bookPath)) {
    try {
      const bookData = JSON.parse(fs.readFileSync(bookPath, 'utf-8')) as Record<string, unknown>;
      totalChapters = (bookData.targetChapterCount as number) ?? 0;
      totalWords = (bookData.targetWords as number) ?? 0;
    } catch {
      /* ignore */
    }
  }
  const isSuperLong = totalChapters > 100 || totalWords > 1000000;

  // 定位所属卷：找到包含该章节号的卷，或最接近的卷
  let targetAct = outline[0];
  for (const act of outline) {
    const chapterNums = (act.chapters ?? []).map((ch) => ch.chapterNumber);
    if (chapterNums.includes(chapterNumber)) {
      targetAct = act;
      break;
    }
    // 如果章节号在两卷之间，归入前卷
    if (chapterNums.length > 0 && chapterNums[0] <= chapterNumber) {
      targetAct = act;
    }
  }

  const lines: string[] = [];

  // 全书规模信息
  if (isSuperLong) {
    lines.push(`## 全书规模提示`);
    lines.push(
      `本书规划 ${totalChapters > 0 ? totalChapters : '大量'} 章、${totalWords > 0 ? `${totalWords / 10000}万字` : '超百万字'}长篇。当前正在写第 ${chapterNumber} 章。`,
    );
    if (isLongForm) {
      lines.push(
        `大纲为多卷结构，每卷约 ${Math.ceil((totalChapters || 1667) / outline.length)} 章。`,
      );
    } else {
      lines.push(
        `大纲为三幕概要，每幕实际覆盖约 ${Math.ceil((totalChapters || 1667) / 3)} 章。第 ${chapterNumber} 章处于开篇阶段，应注重铺垫而非快进到高潮。`,
      );
    }
    lines.push('');
  }

  // 全书大纲概览
  lines.push(`## 全书${isLongForm ? '多卷' : '三幕'}结构（共 ${outline.length} ${volumeLabel}）`);
  for (const act of outline) {
    const marker = act.actNumber === targetAct.actNumber ? ' ← 当前' : '';
    lines.push(`- 第${act.actNumber}${volumeLabel} ${act.title}${marker}`);
  }
  lines.push('');

  // 当前卷详细信息
  lines.push(`## 当前第${targetAct.actNumber}${volumeLabel}：${targetAct.title}`);
  lines.push(targetAct.summary);
  lines.push('');

  if (targetAct.chapters && targetAct.chapters.length > 0) {
    lines.push(`### 本${volumeLabel}关键章节`);
    // 判断当前章节是否命中某个 beat
    let hitBeat = false;
    for (const ch of targetAct.chapters) {
      const marker = ch.chapterNumber === chapterNumber ? ' ← 本章' : '';
      lines.push(`- 第${ch.chapterNumber}章 ${ch.title}：${ch.summary}${marker}`);
      if (ch.chapterNumber === chapterNumber) hitBeat = true;
    }
    // 如果当前章节不在任何 beat 中，找到最近的前后 beat 提供定位参考
    if (!hitBeat) {
      const beats = targetAct.chapters;
      let prevBeat: (typeof beats)[0] | undefined;
      let nextBeat: (typeof beats)[0] | undefined;
      for (const b of beats) {
        if (b.chapterNumber <= chapterNumber) prevBeat = b;
        if (b.chapterNumber > chapterNumber && !nextBeat) nextBeat = b;
      }
      lines.push('');
      lines.push(`### 本章叙事定位（第 ${chapterNumber} 章不在大纲关键章节中，以下为最近参考）`);
      if (prevBeat) {
        lines.push(
          `- 前一个关键节点：第${prevBeat.chapterNumber}章「${prevBeat.title}」— ${prevBeat.summary}`,
        );
      }
      if (nextBeat) {
        lines.push(
          `- 后一个关键节点：第${nextBeat.chapterNumber}章「${nextBeat.title}」— ${nextBeat.summary}`,
        );
      }
      if (prevBeat && nextBeat) {
        lines.push(
          `- 当前章节应承前启后：承接前节点余波，为后节点铺垫，同时推进本卷概要中的叙事目标`,
        );
      } else if (prevBeat && !nextBeat) {
        lines.push(
          `- 当前章节是本卷最后关键节点之后的延展，应逐步收束本卷线索，为下一卷过渡做准备`,
        );
      } else if (!prevBeat && nextBeat) {
        lines.push(`- 当前章节处于本卷开篇，应为即将到来的第一个关键节点做充分铺垫`);
      }
    }
    lines.push('');
  }

  // 前后卷概要（如有）
  const prevAct = outline.find((a) => a.actNumber === targetAct.actNumber - 1);
  const nextAct = outline.find((a) => a.actNumber === targetAct.actNumber + 1);
  if (prevAct) {
    lines.push(`### 上一${volumeLabel}：${prevAct.title}`);
    lines.push(prevAct.summary);
    lines.push('');
  }
  if (nextAct) {
    lines.push(`### 下一${volumeLabel}：${nextAct.title}`);
    lines.push(nextAct.summary);
  }

  return lines.join('\n');
}
