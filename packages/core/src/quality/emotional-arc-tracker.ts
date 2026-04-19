/**
 * Emotional arc tracking for characters across chapters.
 * Detects sudden shifts, flat-lines, and extreme emotions.
 */

export type EmotionType =
  | 'joy'
  | 'anger'
  | 'sadness'
  | 'fear'
  | 'surprise'
  | 'disgust'
  | 'trust'
  | 'anticipation';

export interface EmotionalSnapshot {
  chapterNumber: number;
  character: string;
  emotions: Partial<Record<EmotionType, number>>;
  timestamp: string;
}

export interface ChapterEmotion {
  chapterNumber: number;
  emotions: Record<EmotionType, number>;
  deltas: Record<EmotionType, number> | null;
  dominantEmotion: EmotionType;
  summary: string;
}

export interface CharacterArc {
  name: string;
  chapters: ChapterEmotion[];
}

export type AlertType = 'sudden_shift' | 'flat_line' | 'extreme_emotion';

export interface EmotionBreakAlert {
  type: AlertType;
  character: string;
  chapterNumber: number;
  emotion: EmotionType;
  severity: 'warning' | 'critical';
  message: string;
}

export interface EmotionArcReport {
  characters: CharacterArc[];
  alerts: EmotionBreakAlert[];
}

const EMOTION_TYPES: EmotionType[] = [
  'joy',
  'anger',
  'sadness',
  'fear',
  'surprise',
  'disgust',
  'trust',
  'anticipation',
];

const EMOTION_LABELS: Record<EmotionType, string> = {
  joy: '喜悦',
  anger: '愤怒',
  sadness: '悲伤',
  fear: '恐惧',
  surprise: '惊讶',
  disgust: '厌恶',
  trust: '信任',
  anticipation: '期待',
};

const SUDDEN_SHIFT_THRESHOLD = 0.5;
const FLAT_LINE_WINDOW = 4;
const FLAT_LINE_TOLERANCE = 0.05;
const EXTREME_THRESHOLD = 0.9;

function defaultEmotions(): Record<EmotionType, number> {
  return Object.fromEntries(EMOTION_TYPES.map((t) => [t, 0])) as Record<EmotionType, number>;
}

function mergeEmotions(
  emotions: Partial<Record<EmotionType, number>>
): Record<EmotionType, number> {
  const merged = defaultEmotions();
  for (const type of EMOTION_TYPES) {
    merged[type] = emotions[type] ?? 0;
  }
  return merged;
}

function findDominant(emotions: Record<EmotionType, number>): EmotionType {
  let maxType: EmotionType = 'joy';
  let maxVal = -1;
  for (const type of EMOTION_TYPES) {
    if (emotions[type] > maxVal) {
      maxVal = emotions[type];
      maxType = type;
    }
  }
  return maxType;
}

function computeDeltas(
  prev: Record<EmotionType, number>,
  curr: Record<EmotionType, number>
): Record<EmotionType, number> {
  const deltas: Record<EmotionType, number> = {} as Record<EmotionType, number>;
  for (const type of EMOTION_TYPES) {
    deltas[type] = curr[type] - prev[type];
  }
  return deltas;
}

export class EmotionalArcTracker {
  analyze(snapshots: EmotionalSnapshot[]): EmotionArcReport {
    const byCharacter = new Map<string, EmotionalSnapshot[]>();
    for (const snap of snapshots) {
      const arr = byCharacter.get(snap.character) ?? [];
      arr.push(snap);
      byCharacter.set(snap.character, arr);
    }

    const characters: CharacterArc[] = [];
    const alerts: EmotionBreakAlert[] = [];

    for (const [name, snaps] of byCharacter) {
      snaps.sort((a, b) => a.chapterNumber - b.chapterNumber);
      const chapters: ChapterEmotion[] = [];

      for (let i = 0; i < snaps.length; i++) {
        const emotions = mergeEmotions(snaps[i].emotions);
        const dominant = findDominant(emotions);
        const deltas = i > 0 ? computeDeltas(mergeEmotions(snaps[i - 1].emotions), emotions) : null;
        const summary = `${EMOTION_LABELS[dominant]}为主(${(emotions[dominant] * 100).toFixed(0)}%)`;

        chapters.push({
          chapterNumber: snaps[i].chapterNumber,
          emotions,
          deltas,
          dominantEmotion: dominant,
          summary,
        });
      }

      characters.push({ name, chapters });

      // Detect alerts
      for (let i = 1; i < chapters.length; i++) {
        const prev = chapters[i - 1];
        const curr = chapters[i];

        // Sudden shift detection
        for (const type of EMOTION_TYPES) {
          const delta = Math.abs(curr.deltas![type]);
          if (delta >= SUDDEN_SHIFT_THRESHOLD) {
            alerts.push({
              type: 'sudden_shift',
              character: name,
              chapterNumber: curr.chapterNumber,
              emotion: type,
              severity: delta >= 0.7 ? 'critical' : 'warning',
              message: `${name} 在第${curr.chapterNumber}章 ${EMOTION_LABELS[type]} 剧烈变化 (${delta > 0 ? '+' : ''}${(delta * 100).toFixed(0)}%)`,
            });
          }
        }

        // Flat-line detection (windowed)
        if (i >= FLAT_LINE_WINDOW - 1) {
          const window = chapters.slice(i - FLAT_LINE_WINDOW + 1, i + 1);
          let allFlat = true;
          for (const type of EMOTION_TYPES) {
            const values = window.map((c) => c.emotions[type]);
            const range = Math.max(...values) - Math.min(...values);
            if (range > FLAT_LINE_TOLERANCE) {
              allFlat = false;
              break;
            }
          }
          if (allFlat) {
            const existing = alerts.find(
              (a) =>
                a.type === 'flat_line' &&
                a.character === name &&
                a.chapterNumber === curr.chapterNumber
            );
            if (!existing) {
              alerts.push({
                type: 'flat_line',
                character: name,
                chapterNumber: curr.chapterNumber,
                emotion: 'joy',
                severity: 'warning',
                message: `${name} 的情感弧线在第${curr.chapterNumber - FLAT_LINE_WINDOW + 1}-${curr.chapterNumber}章趋于平坦，缺乏变化`,
              });
            }
          }
        }
      }

      // Extreme emotion detection (all chapters)
      for (const ch of chapters) {
        for (const type of EMOTION_TYPES) {
          if (ch.emotions[type] >= EXTREME_THRESHOLD) {
            alerts.push({
              type: 'extreme_emotion',
              character: name,
              chapterNumber: ch.chapterNumber,
              emotion: type,
              severity: 'critical',
              message: `${name} 在第${ch.chapterNumber}章 ${EMOTION_LABELS[type]} 值过高 (${(ch.emotions[type] * 100).toFixed(0)}%)`,
            });
          }
        }
      }
    }

    return { characters, alerts };
  }
}
