import type { Manifest } from '../../models/state';
import type { ValidationInput, ValidationResult } from '../post-write-validator';

const TRAVEL_KEYWORDS = [
  '踏上.*旅途',
  '前往',
  '来到',
  '抵达',
  '跋涉',
  '赶路',
  '经过.*天.*来到',
  '走了.*天',
  '行程',
  '路程',
  '骑马',
  '坐车',
  '乘船',
  '飞行',
  '传送',
  '赶到',
  '奔赴',
  '离开',
  '出发',
  '南下',
  '北上',
  '东行',
  '西去',
];

const FLASHBACK_KEYWORDS = [
  '回忆',
  '想起.*以前',
  '想起.*曾经',
  '回想起',
  '回忆.*中',
  '记忆.*里',
  '往事',
  '当年',
  '从前',
  '昔日',
  '过去.*的',
  '仿佛.*回到',
  '梦.*中.*看',
  '脑海.*浮现',
];

// ─── Character Location Checker ────────────────────────────────

export function checkCharacterLocation(input: ValidationInput): ValidationResult[] {
  const { chapterContent, manifest } = input;
  const issues: ValidationResult[] = [];

  const locationFacts = manifest.facts.filter(
    (f) => f.category === 'character' && containsLocation(f.content),
  );

  if (locationFacts.length === 0) return [];

  const dualLocation = detectDualLocation(chapterContent, manifest);
  if (dualLocation) {
    issues.push(dualLocation);
    return issues;
  }

  for (const fact of locationFacts) {
    const charName = extractCharacterName(fact.content);
    const knownLocation = extractLocation(fact.content);
    if (!charName || !knownLocation) continue;

    const mentionsInNewLocation = findCharacterLocationMentions(chapterContent, charName);

    for (const mention of mentionsInNewLocation) {
      if (mention.location !== knownLocation && !isNearby(mention.location, knownLocation)) {
        if (!hasTravelTransition(chapterContent)) {
          if (isInFlashbackContext(chapterContent, charName)) {
            continue;
          }

          issues.push({
            rule: 'character-location',
            severity: 'critical',
            description: `角色「${charName}」已知位置为「${knownLocation}」，但文中出现在「${mention.location}」且缺少过渡`,
            suggestion: '补充旅行过渡，或确认角色是否真的出现在该位置',
            detail: `已知位置: ${knownLocation} → 文中位置: ${mention.location}`,
          });
        }
      }
    }
  }

  return issues;
}

function containsLocation(text: string): boolean {
  const locationPrepositions = /在|位于|身处|到了|来到|出现在|回到|进入|走出/;
  return locationPrepositions.test(text);
}

function extractCharacterName(text: string): string | null {
  const match = text.match(/^(.{1,5}?)(?:在|位于|身处)/);
  if (match) return match[1].trim();
  const simpleMatch = text.match(/^([^，,。在位于]+?)在/);
  return simpleMatch ? simpleMatch[1].trim() : null;
}

function extractLocation(text: string): string | null {
  const match = text.match(
    /(?:在|位于|身处|到了|来到|出现在|回到|进入|走出)([^，。！？\n\r]{1,15})(?:[，。！？\n\r]|$)/,
  );
  if (match) {
    const loc = match[1].trim();
    return loc.length >= 1 ? loc : null;
  }
  return null;
}

function detectDualLocation(text: string, manifest: Manifest): ValidationResult | null {
  const sentences = text.split(/[。！？\n]+/).filter((s) => s.trim().length > 2);

  for (const char of manifest.characters) {
    const charSentences = sentences.filter((s) => s.includes(char.name));
    const charLocations = new Set<string>();

    for (const sentence of charSentences) {
      const locRegex = /(站在|坐在|走在|在|位于|身处|出现在|来到|到了)([^，。！？\n\r]{1,20})/g;
      let m: RegExpExecArray | null;
      while ((m = locRegex.exec(sentence)) !== null) {
        let loc = m[2].trim();
        loc = loc.replace(/^(同时|又|就|便|却|而|的|之)+/, '').trim();
        if (loc.length >= 2) charLocations.add(loc);
      }
    }

    if (charLocations.size >= 2) {
      const locations = [...charLocations];
      if (!isNearby(locations[0], locations[1])) {
        return {
          rule: 'character-location',
          severity: 'critical',
          description: `角色「${char.name}」同时出现在两个不同位置：「${locations[0]}」和「${locations[1]}」`,
          suggestion: '确认角色的正确位置，删除矛盾的描述',
          detail: `分身检测: ${locations.join(' vs ')}`,
        };
      }
    }
  }

  return null;
}

function findCharacterLocationMentions(
  text: string,
  charName: string,
): Array<{ location: string }> {
  const mentions: Array<{ location: string }> = [];
  const sentences = text.split(/[。！？\n]+/).filter((s) => s.trim().length > 2);

  for (const sentence of sentences) {
    if (sentence.includes(charName)) {
      const locMatch = sentence.match(
        /(?:站在|坐在|走在|来到|到了|出现在|身处|位于|在)([^，。！？\n\r]{1,15})(?:[，。！？\n\r]|$)/,
      );
      if (locMatch) {
        const loc = locMatch[1].trim();
        if (loc.length > 1) mentions.push({ location: loc });
      }
    }
  }

  return mentions;
}

function hasTravelTransition(text: string): boolean {
  for (const re of TRAVEL_KEYWORDS) {
    if (new RegExp(re).test(text)) return true;
  }
  return false;
}

export function isInFlashbackContext(text: string, charName: string): boolean {
  const sentences = text.split(/[。！？\n]+/).filter((s) => s.trim().length > 2);

  for (const sentence of sentences) {
    if (sentence.includes(charName)) {
      for (const re of FLASHBACK_KEYWORDS) {
        if (new RegExp(re).test(sentence)) return true;
      }
    }
  }

  return false;
}

function isNearby(locA: string, locB: string): boolean {
  if (locA.includes(locB) || locB.includes(locA)) return true;
  const buildingA = locA.replace(/里|中|外|上|下|房间|角落|角落/g, '');
  const buildingB = locB.replace(/里|中|外|上|下|房间|角落|角落/g, '');
  return buildingA === buildingB;
}
