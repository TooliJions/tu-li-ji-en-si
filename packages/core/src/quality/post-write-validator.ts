import type { Manifest, WorldRule } from '../models/state';

// ─── Types ─────────────────────────────────────────────────────────

export type ValidationRuleType =
  | 'character-location'
  | 'resource-change'
  | 'relationship-state'
  | 'character-state'
  | 'world-rule';

export interface ValidationRule {
  type: ValidationRuleType;
  severity: 'critical' | 'warning';
}

export interface ValidationInput {
  chapterContent: string;
  chapterNumber: number;
  manifest: Manifest;
}

export interface ValidationResult {
  rule: ValidationRuleType;
  severity: 'critical' | 'warning';
  description: string;
  suggestion: string;
  detail?: string;
}

export interface ValidationReport {
  chapterNumber: number;
  timestamp: string;
  overallStatus: 'pass' | 'warning' | 'fail';
  issues: ValidationResult[];
}

export interface ValidatorOptions {
  rules: ValidationRule[];
}

// ─── Character state keywords ──────────────────────────────────────

const DEATH_KEYWORDS = [
  '死亡',
  '去世',
  '身亡',
  '死了',
  '死在',
  '毙命',
  '陨落',
  '牺牲',
  '永别人世',
  '与世长辞',
  '长眠',
  '魂归',
];

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

// Relationship polarity keywords
const POSITIVE_RELATIONSHIP = [
  '好友',
  '朋友',
  '兄弟',
  '姐妹',
  '亲如',
  '知己',
  '恋人',
  '爱人',
  '夫妻',
  '情侣',
  '信任',
];
const NEGATIVE_RELATIONSHIP = ['仇敌', '敌人', '仇人', '死敌', '仇家', '仇', '敌对'];

// ─── PostWriteValidator ────────────────────────────────────────────
/**
 * 写后验证器。在章节内容写入后，验证角色位置/资源/关系/状态等
 * 是否与已有事实一致。纯算法检测（正则 + 规则匹配），不依赖 LLM。
 */
export class PostWriteValidator {
  private rules: ValidationRule[];

  constructor(options: ValidatorOptions) {
    this.rules = options.rules;
  }

  getRules(): ValidationRule[] {
    return this.rules;
  }

  validate(input: ValidationInput): ValidationReport {
    const issues: ValidationResult[] = [];

    // Input validation
    const inputErrors = this.#validateInput(input);
    if (inputErrors.length > 0) {
      return {
        chapterNumber: input.chapterNumber,
        timestamp: new Date().toISOString(),
        overallStatus: 'fail',
        issues: inputErrors,
      };
    }

    for (const rule of this.rules) {
      switch (rule.type) {
        case 'character-location':
          issues.push(...this.#checkCharacterLocation(input));
          break;
        case 'resource-change':
          issues.push(...this.#checkResourceChange(input));
          break;
        case 'relationship-state':
          issues.push(...this.#checkRelationshipState(input));
          break;
        case 'character-state':
          issues.push(...this.#checkCharacterState(input));
          break;
        case 'world-rule':
          issues.push(...this.#checkWorldRule(input));
          break;
      }
    }

    // Normalize severity from rule config
    for (const issue of issues) {
      const rule = this.rules.find((r) => r.type === issue.rule);
      if (rule) {
        issue.severity = rule.severity;
      }
    }

    const overallStatus = this.#computeOverallStatus(issues);

    return {
      chapterNumber: input.chapterNumber,
      timestamp: new Date().toISOString(),
      overallStatus,
      issues,
    };
  }

  #validateInput(input: ValidationInput): ValidationResult[] {
    const errors: ValidationResult[] = [];

    if (!input.chapterContent || input.chapterContent.trim().length === 0) {
      errors.push({
        rule: 'character-state',
        severity: 'critical',
        description: '章节内容为空，无法验证',
        suggestion: '请提供有效的章节内容',
      });
    }

    if (!input.manifest) {
      errors.push({
        rule: 'character-state',
        severity: 'critical',
        description: '状态清单缺失，无法验证',
        suggestion: '请提供有效的 Manifest 状态',
      });
    }

    return errors;
  }

  #computeOverallStatus(issues: ValidationResult[]): 'pass' | 'warning' | 'fail' {
    if (issues.length === 0) return 'pass';
    if (issues.some((i) => i.severity === 'critical')) return 'fail';
    return 'warning';
  }

  // ── Character Location ────────────────────────────────────────

  #checkCharacterLocation(input: ValidationInput): ValidationResult[] {
    const { chapterContent, manifest } = input;
    const issues: ValidationResult[] = [];

    // Find character location facts
    const locationFacts = manifest.facts.filter(
      (f) => f.category === 'character' && this.#containsLocation(f.content)
    );

    if (locationFacts.length === 0) return [];

    // Check for dual-location conflicts (character in two places at once)
    const dualLocation = this.#detectDualLocation(chapterContent, manifest);
    if (dualLocation) {
      issues.push(dualLocation);
      return issues;
    }

    // Check if characters appear in locations inconsistent with known facts
    for (const fact of locationFacts) {
      const charName = this.#extractCharacterName(fact.content);
      const knownLocation = this.#extractLocation(fact.content);
      if (!charName || !knownLocation) continue;

      // Check if the character appears in a different location in the text
      const mentionsInNewLocation = this.#findCharacterLocationMentions(chapterContent, charName);

      for (const mention of mentionsInNewLocation) {
        if (
          mention.location !== knownLocation &&
          !this.#isNearby(mention.location, knownLocation)
        ) {
          // Check if there's a travel transition
          if (!this.#hasTravelTransition(chapterContent)) {
            // Check if it's a flashback
            if (this.#isInFlashbackContext(chapterContent, charName)) {
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

  #containsLocation(text: string): boolean {
    const locationPrepositions = /在|位于|身处|到了|来到|出现在|回到|进入|走出/;
    return locationPrepositions.test(text);
  }

  #extractCharacterName(text: string): string | null {
    // Try to extract a name before a location preposition
    const match = text.match(/^(.{1,5}?)(?:在|位于|身处)/);
    if (match) return match[1].trim();

    // For "张三在茶馆" pattern
    const simpleMatch = text.match(/^([^，,。在位于]+?)在/);
    return simpleMatch ? simpleMatch[1].trim() : null;
  }

  #extractLocation(text: string): string | null {
    // Greedy match captures up to 15 chars before punctuation or end
    const match = text.match(
      /(?:在|位于|身处|到了|来到|出现在|回到|进入|走出)([^，。！？\n\r]{1,15})(?:[，。！？\n\r]|$)/
    );
    if (match) {
      const loc = match[1].trim();
      return loc.length >= 1 ? loc : null;
    }
    return null;
  }

  #detectDualLocation(text: string, manifest: Manifest): ValidationResult | null {
    const sentences = text.split(/[。！？\n]+/).filter((s) => s.trim().length > 2);

    for (const char of manifest.characters) {
      const charSentences = sentences.filter((s) => s.includes(char.name));
      const charLocations = new Set<string>();

      for (const sentence of charSentences) {
        // Find all location prepositions in this sentence
        const locRegex = /(站在|坐在|走在|在|位于|身处|出现在|来到|到了)([^，。！？\n\r]{1,20})/g;
        let m: RegExpExecArray | null;
        while ((m = locRegex.exec(sentence)) !== null) {
          let loc = m[2].trim();
          // Trim stop words at the start
          loc = loc.replace(/^(同时|又|就|便|却|而|的|之)+/, '').trim();
          if (loc.length >= 2) charLocations.add(loc);
        }
      }

      if (charLocations.size >= 2) {
        const locations = [...charLocations];
        if (!this.#isNearby(locations[0], locations[1])) {
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

  #findCharacterLocationMentions(text: string, charName: string): Array<{ location: string }> {
    const mentions: Array<{ location: string }> = [];
    const sentences = text.split(/[。！？\n]+/).filter((s) => s.trim().length > 2);

    for (const sentence of sentences) {
      if (sentence.includes(charName)) {
        // Greedy match captures up to 15 chars before punctuation/end
        const locMatch = sentence.match(
          /(?:站在|坐在|走在|来到|到了|出现在|身处|位于|在)([^，。！？\n\r]{1,15})(?:[，。！？\n\r]|$)/
        );
        if (locMatch) {
          const loc = locMatch[1].trim();
          if (loc.length > 1) mentions.push({ location: loc });
        }
      }
    }

    return mentions;
  }

  #hasTravelTransition(text: string): boolean {
    for (const re of TRAVEL_KEYWORDS) {
      if (new RegExp(re).test(text)) return true;
    }
    return false;
  }

  #isInFlashbackContext(text: string, charName: string): boolean {
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

  #isNearby(locA: string, locB: string): boolean {
    // Simple proximity check: if locations share common characters, consider them nearby
    if (locA.includes(locB) || locB.includes(locA)) return true;
    // Same building with different rooms
    const buildingA = locA.replace(/里|中|外|上|下|房间|角落|角落/g, '');
    const buildingB = locB.replace(/里|中|外|上|下|房间|角落|角落/g, '');
    return buildingA === buildingB;
  }

  // ── Resource Change ───────────────────────────────────────────

  #checkResourceChange(input: ValidationInput): ValidationResult[] {
    const { chapterContent, manifest } = input;
    const issues: ValidationResult[] = [];

    const resourceFacts = manifest.facts.filter((f) => f.category === 'resource');
    if (resourceFacts.length === 0) return [];

    for (const fact of resourceFacts) {
      const resourceAmount = this.#extractResourceAmount(fact.content);
      if (!resourceAmount) continue;

      // Check for sudden large increase in text
      const textAmount = this.#findResourceAmountInText(chapterContent, resourceAmount.name);
      if (textAmount && textAmount.amount > resourceAmount.amount * 10) {
        issues.push({
          rule: 'resource-change',
          severity: 'critical',
          description: `资源「${resourceAmount.name}」数量异常增加：已知 ${resourceAmount.amount}，文中出现 ${textAmount.amount}`,
          suggestion: '补充资源来源说明',
          detail: `${resourceAmount.name}: ${resourceAmount.amount} → ${textAmount.amount}`,
        });
      }
    }

    return issues;
  }

  #extractResourceAmount(text: string): { name: string; amount: number } | null {
    const match = text.match(/(.{1,10}?)\s*[×xX*]\s*(\d+)/);
    if (match) {
      let name = match[1].trim();
      // Strip ownership prefix: "张三拥有：灵石" → "灵石"
      const ownerMatch = name.match(/(?:拥有|持有|剩余|共有)[：:]\s*(.+)$/);
      if (ownerMatch) {
        name = ownerMatch[1].trim();
      }
      if (name.length === 0) return null;
      return {
        name,
        amount: parseInt(match[2], 10),
      };
    }
    return null;
  }

  #findResourceAmountInText(
    text: string,
    resourceName: string
  ): { name: string; amount: number } | null {
    // Look for resource name followed by a number
    const escaped = resourceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = text.match(new RegExp(`${escaped}.*?(\\d+)`));
    if (match) {
      return {
        name: resourceName,
        amount: parseInt(match[1], 10),
      };
    }
    return null;
  }

  // ── Relationship State ────────────────────────────────────────

  #checkRelationshipState(input: ValidationInput): ValidationResult[] {
    const { chapterContent, manifest } = input;
    const issues: ValidationResult[] = [];

    for (const char of manifest.characters) {
      const relationships = char.relationships || {};

      for (const [targetId, relationship] of Object.entries(relationships)) {
        const target = manifest.characters.find((c) => c.id === targetId);
        if (!target) continue;

        // Check if both characters appear in the text
        if (!chapterContent.includes(char.name) || !chapterContent.includes(target.name)) continue;

        // Detect relationship polarity in text
        const textPolarity = this.#detectRelationshipPolarity(
          chapterContent,
          char.name,
          target.name
        );
        const knownPolarity = this.#classifyRelationshipPolarity(relationship);

        if (textPolarity && knownPolarity && textPolarity !== knownPolarity) {
          issues.push({
            rule: 'relationship-state',
            severity: 'critical',
            description: `角色关系突变：「${char.name}」与「${target.name}」已知关系为「${relationship}」，但文中描写为「${textPolarity === 'positive' ? '友好' : '敌对'}」`,
            suggestion: '补充关系转变的过渡和原因',
            detail: `关系: ${relationship} → ${textPolarity === 'positive' ? '友好/亲密' : '敌对/冲突'}`,
          });
        }
      }
    }

    return issues;
  }

  #detectRelationshipPolarity(
    text: string,
    nameA: string,
    nameB: string
  ): 'positive' | 'negative' | null {
    // Find sentences mentioning both characters
    const sentences = text.split(/[。！？\n]+/).filter((s) => s.trim().length > 2);

    let positiveCount = 0;
    let negativeCount = 0;

    for (const sentence of sentences) {
      if (!sentence.includes(nameA) || !sentence.includes(nameB)) continue;

      for (const kw of POSITIVE_RELATIONSHIP) {
        if (sentence.includes(kw)) positiveCount++;
      }
      for (const kw of NEGATIVE_RELATIONSHIP) {
        if (sentence.includes(kw)) negativeCount++;
      }
    }

    if (positiveCount > negativeCount && positiveCount >= 2) return 'positive';
    if (negativeCount > positiveCount && negativeCount >= 2) return 'negative';
    return null;
  }

  #classifyRelationshipPolarity(relationship: string): 'positive' | 'negative' | null {
    for (const kw of POSITIVE_RELATIONSHIP) {
      if (relationship.includes(kw)) return 'positive';
    }
    for (const kw of NEGATIVE_RELATIONSHIP) {
      if (relationship.includes(kw)) return 'negative';
    }
    return null;
  }

  // ── Character State ───────────────────────────────────────────

  #checkCharacterState(input: ValidationInput): ValidationResult[] {
    const { chapterContent, manifest } = input;
    const issues: ValidationResult[] = [];

    // Find death facts
    const deathFacts = manifest.facts.filter((f) =>
      DEATH_KEYWORDS.some((kw) => f.content.includes(kw))
    );

    for (const deathFact of deathFacts) {
      // Extract character name from death fact
      const charName = this.#extractNameFromDeathFact(deathFact.content);
      if (!charName) continue;

      // Check if this character appears in the new chapter (not in flashback)
      if (chapterContent.includes(charName)) {
        // Check if the appearance is in a flashback/reminiscence context
        if (this.#isInFlashbackContext(chapterContent, charName)) {
          continue;
        }

        // Character is dead but appears in text without flashback context
        issues.push({
          rule: 'character-state',
          severity: 'critical',
          description: `已死亡角色「${charName}」在第 ${input.chapterNumber} 章中出现`,
          suggestion: '确认是否为回忆/梦境场景，或移除角色的不当出现',
          detail: `死亡事实: ${deathFact.content}`,
        });
      }
    }

    return issues;
  }

  #extractNameFromDeathFact(content: string): string | null {
    // Greedy match captures everything before the death keyword
    for (const kw of DEATH_KEYWORDS) {
      const idx = content.indexOf(kw);
      if (idx >= 0 && idx <= 5 && idx > 0) {
        return (
          content
            .substring(0, idx)
            .replace(/已经|早已|竟|然/g, '')
            .trim() || null
        );
      }
    }
    return null;
  }

  // ── World Rule ────────────────────────────────────────────────

  #checkWorldRule(input: ValidationInput): ValidationResult[] {
    const { chapterContent, manifest } = input;
    const issues: ValidationResult[] = [];

    for (const rule of manifest.worldRules) {
      // Check if any exception character is mentioned in the violating context
      const hasException = rule.exceptions.some((exc) => chapterContent.includes(exc));
      if (hasException) continue;

      // Check if the text contradicts the world rule
      const violation = this.#detectWorldRuleViolation(chapterContent, rule);
      if (violation) {
        issues.push({
          rule: 'world-rule',
          severity: 'critical',
          description: `违反世界规则：「${rule.rule}」`,
          suggestion: '修改文中描述使其符合世界规则，或将角色/情况加入规则的例外列表',
          detail: `规则: [${rule.category}] ${rule.rule}`,
        });
      }
    }

    return issues;
  }

  #detectWorldRuleViolation(text: string, rule: WorldRule): boolean {
    const ruleText = rule.rule.toLowerCase();

    // Check for negation patterns: "不可跳过" → look for "跳过" + context
    if (ruleText.includes('不可') || ruleText.includes('不能') || ruleText.includes('禁止')) {
      // Extract the forbidden action
      const forbiddenMatch = ruleText.match(/(?:不可|不能|禁止)(.+)/);
      if (forbiddenMatch) {
        const forbidden = forbiddenMatch[1].trim();
        // Check if text shows the forbidden action happening
        if (text.includes(forbidden)) {
          // Additional check: does the text show someone bypassing the restriction?
          const bypassPatterns = [
            new RegExp(`却.*${forbidden}`),
            new RegExp(`直接.*${forbidden}`),
            new RegExp(`突然.*${forbidden}`),
            new RegExp(`竟然.*${forbidden}`),
          ];
          for (const pattern of bypassPatterns) {
            if (pattern.test(text)) return true;
          }
        }
      }
    }

    // Check for "必须" patterns: look for violations where the requirement is absent
    if (ruleText.includes('必须')) {
      const mustMatch = ruleText.match(/必须(.+)/);
      if (mustMatch) {
        const required = mustMatch[1].trim();
        // Check if text shows the action WITHOUT the requirement
        const withoutPatterns = [
          new RegExp(
            `(?:从未|没有|未曾|不曾).*${required.split(/(?:经过|通过|经过|使用)/)[0]?.trim() || required}`
          ),
          new RegExp(`未.*${required}`),
        ];
        for (const pattern of withoutPatterns) {
          if (pattern.test(text)) return true;
        }
      }
    }

    return false;
  }
}
