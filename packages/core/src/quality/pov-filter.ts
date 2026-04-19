// ─── Types ─────────────────────────────────────────────────────────

export type PovType = 'first-person' | 'second-person' | 'third-person' | 'mixed' | 'unknown';
export type NarrativeMode = 'limited' | 'omniscient' | 'dramatic' | 'unknown';

export interface POVShift {
  type: 'person-change' | 'head-hop' | 'second-intrusion';
  from: string;
  to: string;
  severity: 'critical' | 'warning';
  description: string;
  sentence: string;
  paragraphIndex: number;
}

export interface AuthorIntrusion {
  type: 'intrusion' | 'meta-commentary';
  text: string;
  paragraphIndex: number;
  description: string;
}

export interface POVConsistencyResult {
  type: PovType;
  narrativeMode: NarrativeMode;
  authorIntrusions: AuthorIntrusion[];
  shifts: POVShift[];
}

export interface POFilterInput {
  chapterContent: string;
  chapterNumber: number;
  genre: string;
}

export interface POFilterReport {
  chapterNumber: number;
  timestamp: string;
  povConsistency: PovType;
  narrativeMode: NarrativeMode;
  authorIntrusions: AuthorIntrusion[];
  shifts: POVShift[];
  overallStatus: 'pass' | 'warning' | 'fail';
}

// ─── First-person pronouns ───────────────────────────────────────

const FIRST_PERSON_PRONOUNS = [
  // Subject
  '我',
  '我们',
  '咱',
  '咱们',
  // Object/possessive (single-char to avoid false positives)
  '我的',
  '我们的',
  '我的',
  '咱们的',
];

const SECOND_PERSON_PRONOUNS = ['你', '你们', '您的', '你们的', '你的'];

const THIRD_PERSON_PRONOUNS = [
  '他',
  '她',
  '它',
  '他们',
  '她们',
  '它们',
  '他的',
  '她的',
  '它的',
  '他们的',
  '她们的',
  '它们的',
];

// ─── Idioms and fixed phrases containing 我/你/他 that are NOT POV markers ─────────

const IDIOM_PHRASES_WITH_PRONOUNS = [
  // 我
  '理所当然',
  '自言自语',
  '自作自受',
  '自以为是',
  '自我感觉',
  '我行我素',
  '你死我活',
  '尔虞我诈',
  '唯我独尊',
  '故我依然',
  // 你
  '你追我赶',
  '你一言我一语',
  '你好我好大家好',
  // 他
  '他山之石',
  '其他',
  '他人',
  '他乡',
  '他人',
  // 她
  '她人',
];

// ─── Omniscient narrator patterns ────────────────────────────────

const OMNISCIENT_PATTERNS = [
  /命运.*开始.*转动/,
  /谁也不知道/,
  /与此同时/,
  /千里之外/,
  /在另一个.*地方/,
  /而此时的/,
  /遥远的.*地方/,
  /无人知晓/,
  /上天注定/,
  /冥冥之中/,
];

// ─── Author intrusion patterns ───────────────────────────────────

const AUTHOR_INTRUSION_PATTERNS = [
  { re: /让我们来看看|让我们把目光转向/, type: 'intrusion' as const, label: '引导读者' },
  { re: /接下来会|接下来.*发生/, type: 'meta-commentary' as const, label: '剧情预告' },
  { re: /在此之前.*先回顾/, type: 'meta-commentary' as const, label: '回顾提示' },
  { re: /正如大家所知|众所周知/, type: 'intrusion' as const, label: '众所周知' },
  { re: /这个故事告诉|这个故事说明/, type: 'meta-commentary' as const, label: '道理总结' },
  { re: /读者.*也许|读者.*可能|各位读者/, type: 'intrusion' as const, label: '称呼读者' },
];

// ─── Inner thought patterns (for head-hop detection) ─────────────

// ─── POFilter ────────────────────────────────────────────────────
/**
 * 叙事视角过滤器。检测章节内容中的视角跳变，包括：
 *   - 人称跳变（第一人称↔第三人称↔第二人称）
 *   - 角色内心切换（head-hopping）
 *   - 作者闯入（元叙事）
 * 纯算法检测，不依赖 LLM。
 */
export class POFilter {
  analyze(input: POFilterInput): POFilterReport {
    const { chapterContent, chapterNumber } = input;

    if (!chapterContent || chapterContent.trim().length === 0) {
      return this.#emptyReport(chapterNumber);
    }

    const paragraphs = chapterContent.split(/\n+/).filter((p) => p.trim().length > 0);
    const shifts: POVShift[] = [];
    const authorIntrusions: AuthorIntrusion[] = [];

    // Step 1: Determine paragraph-level POV
    const paragraphPOVs = paragraphs.map((p, i) => ({
      index: i,
      pov: this.#detectParagraphPOV(p),
    }));

    // Step 2: Detect person changes between paragraphs
    this.#detectPersonChanges(paragraphPOVs, paragraphs, shifts);

    // Step 3: Detect head-hopping (third-person with inner thoughts from multiple characters)
    this.#detectHeadHopping(paragraphs, shifts);

    // Step 4: Detect author intrusions
    this.#detectAuthorIntrusions(paragraphs, authorIntrusions);

    // Step 5: Detect omniscient narrative mode
    const narrativeMode = this.#detectNarrativeMode(paragraphs);

    // Step 6: Compute overall POV
    const povConsistency = this.#computeOverallPOV(paragraphPOVs);

    // Step 7: Compute overall status
    const overallStatus = this.#computeOverallStatus(shifts);

    return {
      chapterNumber,
      timestamp: new Date().toISOString(),
      povConsistency,
      narrativeMode,
      authorIntrusions,
      shifts,
      overallStatus,
    };
  }

  #emptyReport(chapterNumber: number): POFilterReport {
    return {
      chapterNumber,
      timestamp: new Date().toISOString(),
      povConsistency: 'unknown',
      narrativeMode: 'unknown',
      authorIntrusions: [],
      shifts: [],
      overallStatus: 'pass',
    };
  }

  // ── Paragraph POV Detection ───────────────────────────────────

  #detectParagraphPOV(paragraph: string): PovType {
    // Strip dialogue to avoid counting quoted pronouns as POV
    const narration = this.#stripDialogue(paragraph);

    if (narration.trim().length === 0) return 'unknown';

    const firstCount = this.#countPronounUsage(narration, FIRST_PERSON_PRONOUNS, true);
    const secondCount = this.#countPronounUsage(narration, SECOND_PERSON_PRONOUNS, false);
    const thirdCount = this.#countPronounUsage(narration, THIRD_PERSON_PRONOUNS, false);

    if (firstCount > 0 && firstCount > secondCount && firstCount > thirdCount)
      return 'first-person';
    if (secondCount > 0 && secondCount > firstCount && secondCount > thirdCount)
      return 'second-person';
    if (thirdCount > 0) return 'third-person';

    return 'unknown';
  }

  #stripDialogue(text: string): string {
    // Remove text inside quotation marks (both Chinese and Western)
    return text
      .replace(/"[^"]*"/g, '')
      .replace(/"[^"]*"/g, '')
      .replace(/\u201c[^\u201d]*\u201d/g, '')
      .replace(/\u2018[^\u2019]*\u2019/g, '')
      .replace(/《[^》]*》/g, '');
  }

  #countPronounUsage(text: string, pronouns: string[], checkIdioms: boolean): number {
    let count = 0;

    for (const pronoun of pronouns) {
      let idx = 0;
      while ((idx = text.indexOf(pronoun, idx)) !== -1) {
        if (checkIdioms && this.#isInsideIdiom(text, idx, pronoun)) {
          idx += pronoun.length;
          continue;
        }

        // Check if the pronoun is a standalone character usage (not part of a longer word)
        if (pronoun.length === 1) {
          // For single-char pronouns, check context to avoid false positives
          // Skip if part of a compound word/idiom
          if (this.#isPartOfCompound(text, idx, pronoun)) {
            idx += 1;
            continue;
          }
        }

        count++;
        idx += pronoun.length;
      }
    }

    return count;
  }

  #isInsideIdiom(text: string, index: number, pronoun: string): boolean {
    // Check surrounding text for known idioms
    const start = Math.max(0, index - 4);
    const end = Math.min(text.length, index + pronoun.length + 4);
    const context = text.substring(start, end);

    for (const idiom of IDIOM_PHRASES_WITH_PRONOUNS) {
      if (context.includes(idiom)) return true;
    }

    return false;
  }

  #isPartOfCompound(text: string, index: number, pronoun: string): boolean {
    // Check if the pronoun is part of a known compound or idiom
    const start = Math.max(0, index - 3);
    const end = Math.min(text.length, index + pronoun.length + 3);
    const context = text.substring(start, end);

    for (const idiom of IDIOM_PHRASES_WITH_PRONOUNS) {
      if (idiom.includes(pronoun) && context.includes(idiom)) return true;
    }

    return false;
  }

  // ── Person Change Detection ───────────────────────────────────

  #detectPersonChanges(
    paragraphPOVs: Array<{ index: number; pov: PovType }>,
    paragraphs: string[],
    shifts: POVShift[]
  ): void {
    const knownPOVs = paragraphPOVs.filter((p) => p.pov !== 'unknown');

    if (knownPOVs.length < 2) return;

    for (let i = 1; i < knownPOVs.length; i++) {
      const prev = knownPOVs[i - 1];
      const curr = knownPOVs[i];

      if (prev.pov !== curr.pov) {
        const sentence = this.#findFirstPOVSentence(paragraphs[curr.index], curr.pov);
        shifts.push({
          type: 'person-change',
          from: prev.pov,
          to: curr.pov,
          severity: 'critical',
          description: `人称跳变：从${this.#povLabel(prev.pov)}切换到${this.#povLabel(curr.pov)}`,
          sentence,
          paragraphIndex: curr.index,
        });
      }
    }
  }

  #findFirstPOVSentence(paragraph: string, pov: PovType): string {
    const sentences = paragraph.split(/[。！？\n]+/).filter((s) => s.trim().length > 2);

    for (const sentence of sentences) {
      if (pov === 'first-person' && sentence.includes('我')) return sentence.trim();
      if (pov === 'second-person' && sentence.includes('你')) return sentence.trim();
      if (pov === 'third-person' && /[他她它]/.test(sentence)) return sentence.trim();
    }

    return paragraph.trim().substring(0, 50);
  }

  #povLabel(pov: PovType): string {
    switch (pov) {
      case 'first-person':
        return '第一人称';
      case 'second-person':
        return '第二人称';
      case 'third-person':
        return '第三人称';
      case 'mixed':
        return '混合视角';
      case 'unknown':
        return '未知';
    }
  }

  // ── Head-Hopping Detection ────────────────────────────────────

  #detectHeadHopping(paragraphs: string[], shifts: POVShift[]): void {
    // Step 1: Check within each paragraph for multiple thought owners
    for (let i = 0; i < paragraphs.length; i++) {
      const thoughtOwners = this.#findThoughtOwners(paragraphs[i]);
      if (thoughtOwners.length >= 2) {
        shifts.push({
          type: 'head-hop',
          from: thoughtOwners[0],
          to: thoughtOwners[1],
          severity: 'warning',
          description: `视角跳变：段落中出现了多个角色的内心描写（${thoughtOwners.join(' → ')}）`,
          sentence: paragraphs[i].trim().substring(0, 50),
          paragraphIndex: i,
        });
      }
    }

    // Step 2: Check consecutive paragraphs for thought owner switches
    const paragraphThoughtOwners: Array<{ index: number; owners: string[] }> = [];
    for (let i = 0; i < paragraphs.length; i++) {
      const owners = this.#findThoughtOwners(paragraphs[i]);
      if (owners.length > 0) {
        paragraphThoughtOwners.push({ index: i, owners });
      }
    }

    for (let i = 1; i < paragraphThoughtOwners.length; i++) {
      const prev = paragraphThoughtOwners[i - 1];
      const curr = paragraphThoughtOwners[i];
      // If different characters' thoughts in adjacent paragraphs with thought markers
      const prevOwner = prev.owners[0];
      const currOwner = curr.owners[0];
      if (prevOwner !== currOwner && !curr.owners.includes(prevOwner)) {
        shifts.push({
          type: 'head-hop',
          from: prevOwner,
          to: currOwner,
          severity: 'warning',
          description: `视角跳变：连续段落中切换了内心视角（${prevOwner} → ${currOwner}）`,
          sentence: paragraphs[curr.index].trim().substring(0, 50),
          paragraphIndex: curr.index,
        });
      }
    }
  }

  #findThoughtOwners(paragraph: string): string[] {
    const owners = new Set<string>();

    // Strategy: Find sentences with thought markers, extract the subject
    // Pattern: "角色名 + (looking/action verb) + ..., (心想/暗想/心中/暗暗)..."
    const sentences = paragraph.split(/[。！？；\n]+/).filter((s) => s.trim().length > 2);

    for (const sentence of sentences) {
      // Check if this sentence has a thought marker
      const hasThought =
        /(?:心想|暗想|心道|暗忖|寻思|思忖|暗暗.*盘算|心中.*想|心中.*盘算|在心里.*想|心下.*思忖)/.test(
          sentence
        );
      if (!hasThought) continue;

      // Try to extract character name from the subject position
      // Pattern: Name + verb (看着/望着/盯着/听/想/站/走/坐/说)
      const subjectMatch = sentence.match(
        /^([^\s，。！？]{2,4})(?:看着|望着|盯着|听了|听完|听后|听后想|听到|想了想|想了一下|想了|看着|望着|听罢|叹道|摇头|点头|站起|坐下|转身|回过)/
      );
      if (subjectMatch) {
        const name = subjectMatch[1].trim();
        if (this.#isValidName(name)) {
          owners.add(name);
          continue;
        }
      }

      // Fallback: check for "角色名 + 心想" directly
      const directMatch = sentence.match(/^([^\s，。！？]{2,4})(?:心想|暗想|心道|暗忖|寻思|思忖)/);
      if (directMatch) {
        const name = directMatch[1].trim();
        if (this.#isValidName(name)) {
          owners.add(name);
          continue;
        }
      }

      // Fallback: check for "角色名 + 决定" (internal decision)
      const decideMatch = sentence.match(/^([^\s，。！？]{2,4})决定/);
      if (decideMatch) {
        const name = decideMatch[1].trim();
        if (this.#isValidName(name)) {
          owners.add(name);
        }
      }
    }

    // Remove pronouns
    owners.delete('我');
    owners.delete('你');
    owners.delete('他');
    owners.delete('她');
    owners.delete('它');
    owners.delete('谁');

    return [...owners];
  }

  #isValidName(name: string): boolean {
    if (name.length === 0 || name.length > 4) return false;
    // Reject pronouns
    if (this.#isPronoun(name)) return false;
    // Reject non-name words (abstract nouns, common words)
    const nonNameWords = [
      '心中',
      '心里',
      '心道',
      '心里头',
      '暗自',
      '暗暗',
      '默默',
      '突然',
      '忽然',
      '终于',
      '开始',
      '觉得',
      '认为',
      '总是',
      '经常',
      '已经',
      '正在',
      '立刻',
      '马上',
      '然后',
      '接着',
      '于是',
      '此时',
      '当时',
      '这时',
      '之前',
      '之后',
      '旁边',
      '周围',
      '一切',
      '所有',
      '什么',
      '怎么',
      '怎样',
      '哪里',
      '哪里',
      '自己',
      '对方',
    ];
    if (nonNameWords.includes(name)) return false;
    // Reject fragments (too short or containing only function words)
    if (/^[，。！？、的了吗呢了着过]$/.test(name)) return false;
    return true;
  }

  #isPronoun(word: string): boolean {
    return ['我', '你', '他', '她', '它', '谁', '什么', '怎么'].includes(word);
  }

  // ── Author Intrusion Detection ────────────────────────────────

  #detectAuthorIntrusions(paragraphs: string[], intrusions: AuthorIntrusion[]): void {
    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i];

      for (const { re, type, label } of AUTHOR_INTRUSION_PATTERNS) {
        const match = paragraph.match(re);
        if (match) {
          intrusions.push({
            type,
            text: match[0],
            paragraphIndex: i,
            description: `作者闯入（${label}）："${match[0].substring(0, 30)}"`,
          });
        }
      }
    }
  }

  // ── Narrative Mode Detection ──────────────────────────────────

  #detectNarrativeMode(paragraphs: string[]): NarrativeMode {
    let omniscientCount = 0;

    for (const paragraph of paragraphs) {
      for (const pattern of OMNISCIENT_PATTERNS) {
        if (pattern.test(paragraph)) {
          omniscientCount++;
        }
      }
    }

    if (omniscientCount >= 2) return 'omniscient';
    return 'limited';
  }

  // ── Overall POV Computation ───────────────────────────────────

  #computeOverallPOV(paragraphPOVs: Array<{ index: number; pov: PovType }>): PovType {
    const known = paragraphPOVs.filter((p) => p.pov !== 'unknown');

    if (known.length === 0) return 'unknown';

    const povCounts = new Map<PovType, number>();
    for (const p of known) {
      povCounts.set(p.pov, (povCounts.get(p.pov) ?? 0) + 1);
    }

    if (povCounts.size === 1) return known[0].pov;

    // Multiple POV types detected
    const entries = [...povCounts.entries()];
    entries.sort((a, b) => b[1] - a[1]);

    // If one POV is dominant (>70%), consider it consistent
    const dominant = entries[0];
    if (dominant[1] / known.length > 0.7) return dominant[0];

    return 'mixed';
  }

  // ── Overall Status Computation ────────────────────────────────

  #computeOverallStatus(shifts: POVShift[]): 'pass' | 'warning' | 'fail' {
    if (shifts.length === 0) return 'pass';

    // Any critical shift → fail
    if (shifts.some((s) => s.severity === 'critical')) return 'fail';

    // Only warnings → warning
    if (shifts.some((s) => s.severity === 'warning')) return 'warning';

    return 'pass';
  }
}
