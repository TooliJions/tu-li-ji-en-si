import {
  LLMProvider,
  type LLMRequest,
  type LLMResponse,
  type LLMResponseWithJSON,
  type LLMStreamChunk,
  extractSection,
  extractChapterNumber,
} from '@cybernovelist/core';

/**
 * 确定性 Provider — 测试替身
 *
 * 基于用户输入的 prompt 内容动态生成响应，不调用外部 LLM API。
 * 仅用于测试环境（Vitest）和浏览器运行时降级。
 */
export class DeterministicProvider extends LLMProvider {
  constructor() {
    super({
      apiKey: 'deterministic',
      baseURL: 'http://localhost/deterministic',
      model: 'deterministic-provider',
    });
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const text = this.#buildTextResponse(request.prompt);
    return {
      text,
      usage: estimateUsage(request.prompt, text),
      model: this.config.model,
    };
  }

  async generateJSON<T>(request: LLMRequest): Promise<T> {
    return this.#buildJsonResponse(request.prompt) as T;
  }

  async generateJSONWithMeta<T>(request: LLMRequest): Promise<LLMResponseWithJSON<T>> {
    const data = this.#buildJsonResponse(request.prompt) as T;
    const text = JSON.stringify(data);
    return {
      data,
      usage: estimateUsage(request.prompt, text),
      model: this.config.model,
    };
  }

  async *generateStream(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    const text = this.#buildTextResponse(request.prompt);
    const words = text.split(' ');
    for (const word of words) {
      yield { text: word + ' ', done: false };
    }
    yield { text: '', done: true };
  }

  // ─── 动态模板引擎 — 基于用户输入生成响应 ────────────────────

  #extractBrief(prompt: string): string {
    const patterns = [
      /创作灵感[：:]\s*([^\n]+)/i,
      /brief[：:]\s*([^\n]+)/i,
      /灵感[：:]\s*([^\n]+)/i,
      /故事梗概[：:]\s*([^\n]+)/i,
    ];
    for (const p of patterns) {
      const m = prompt.match(p);
      if (m) return m[1].trim();
    }
    return '';
  }

  #extractGenre(prompt: string): string {
    const genreMap: Record<string, string> = {
      都市: 'urban',
      玄幻: 'fantasy',
      科幻: 'sci-fi',
      仙侠: 'xianxia',
      历史: 'historical',
      游戏: 'game',
      悬疑: 'mystery',
      言情: 'romance',
      武侠: 'wuxia',
      灵异: 'supernatural',
    };
    for (const [cn] of Object.entries(genreMap)) {
      if (prompt.includes(cn)) return cn;
    }
    return '都市';
  }

  #extractTitle(prompt: string): string {
    const patterns = [
      /书名[：:]\s*([^\n]+)/i,
      /title[：:]\s*([^\n]+)/i,
      /小说名称[：:]\s*([^\n]+)/i,
    ];
    for (const p of patterns) {
      const m = prompt.match(p);
      if (m) return m[1].trim();
    }
    return '未命名作品';
  }

  #extractOutline(prompt: string): string {
    const startIdx = prompt.indexOf('大纲');
    if (startIdx === -1) return '';
    const section = prompt.slice(startIdx, startIdx + 500);
    const endIdx = section.indexOf('\n\n');
    return endIdx !== -1 ? section.slice(0, endIdx).trim() : section.trim();
  }

  #extractSceneDescription(prompt: string): string {
    const patterns = [
      /场景描述[：:]\s*([^\n]+)/i,
      /场景[：:]\s*([^\n]+)/i,
      /情节[：:]\s*([^\n]+)/i,
      /主线[：:]\s*([^\n]+)/i,
      /意图[：:]\s*([^\n]+)/i,
      /用户意图[：:]\s*([^\n]+)/i,
    ];
    for (const p of patterns) {
      const m = prompt.match(p);
      if (m && m[1].trim().length > 0) return m[1].trim();
    }
    const section = extractSection(prompt, '## 用户意图');
    if (section) return section;
    return '继续推进主线';
  }

  #extractCharacters(prompt: string): string[] {
    const characters: string[] = [];
    const patterns = [
      /关键角色[：:]?\s*([^。;\n]+)/gi,
      /出场人物[：:]?\s*([^。;\n]+)/gi,
      /characters[：:]?\s*\[([^\]]*)\]/gi,
      /角色[：:]?\s*([^。;\n]+)/gi,
    ];
    for (const p of patterns) {
      const m = prompt.match(p);
      if (m) {
        const raw = m[1] || m[0];
        const names = raw.split(/[，、,;\s]+/).filter((s) => s.length > 0 && s.length < 10);
        characters.push(...names);
      }
    }
    return [...new Set(characters)].slice(0, 5);
  }

  #genreConflictMap: Record<string, { conflict: string; arc: string; rule: string; mood: string }> =
    {
      玄幻: {
        conflict: '修炼之路充满危机，主角必须在宗门争斗与强敌环伺中杀出一条血路。',
        arc: '从卑微凡人到傲世强者，在战斗中领悟力量的真谛。',
        rule: '修炼体系分多个境界，突破需要资源与机缘。',
        mood: '燃起斗志，气势如虹',
      },
      都市: {
        conflict: '现实生活中的困境与压力接踵而至，主角必须在职场与人际中找到出路。',
        arc: '从迷茫到觉醒，在现实中重新定义成功。',
        rule: '现实向设定，遵循社会规则与人性逻辑。',
        mood: '压抑→绷紧→燃起斗志',
      },
      科幻: {
        conflict: '科技发展与人类命运交织，主角在未知与挑战中寻找答案。',
        arc: '从质疑到承担，在科技与人性之间做出抉择。',
        rule: '基于硬科幻设定，遵循科技逻辑。',
        mood: '冷峻→震撼→深思',
      },
      仙侠: {
        conflict: '仙途漫漫，主角必须在天道与人心之间寻找自己的道。',
        arc: '从懵懂少年到一代仙尊，在修行中领悟大道。',
        rule: '修炼体系包含练气、筑基、金丹等境界。',
        mood: '超脱→入世→超然',
      },
      悬疑: {
        conflict: '谜团重重，主角在层层线索中发现真相远比想象中复杂。',
        arc: '从困惑到顿悟，在追寻真相中直面人性阴暗。',
        rule: '推理遵循逻辑，每个伏笔必有解释。',
        mood: '紧张→反转→恍然大悟',
      },
      言情: {
        conflict: '情感纠葛与现实阻碍并存，主角在爱与责任之间挣扎。',
        arc: '从误解到理解，在相处中逐渐靠近。',
        rule: '情感发展循序渐进，注重心理描写。',
        mood: '微妙→暧昧→深情',
      },
      历史: {
        conflict: '乱世纷争中，主角必须在权谋与道义中找到立足之地。',
        arc: '从小人物到风云人物，在历史洪流中留下印记。',
        rule: '遵循历史背景，重大事件不可更改。',
        mood: '沉重→激昂→苍凉',
      },
      游戏: {
        conflict: '虚拟世界中的挑战与现实交织，主角在游戏中寻找自我。',
        arc: '从新手到高手，在竞技中突破自我极限。',
        rule: '游戏机制明确，等级与装备体系清晰。',
        mood: '兴奋→紧张→热血',
      },
    };

  #getGenreDefaults(genre: string): { conflict: string; arc: string; rule: string; mood: string } {
    return this.#genreConflictMap[genre] || this.#genreConflictMap['都市'];
  }

  #buildTextResponse(prompt: string): string {
    const brief = this.#extractBrief(prompt);
    const genre = this.#extractGenre(prompt);
    const title = this.#extractTitle(prompt);
    const defaults = this.#getGenreDefaults(genre);
    const chapterNumber = extractChapterNumber(prompt);

    if (prompt.includes('请根据以下审计问题修订章节内容')) {
      const currentContent = extractSection(prompt, '## 当前内容');
      return currentContent
        ? `${currentContent}\n\n【修订完成】已根据审计意见校正逻辑一致性与角色行为合理性。`.trim()
        : `内容已修订。基于${title}的世界观与角色设定，校正了矛盾之处。`;
    }

    if (prompt.includes('文字润色师')) {
      const draft = extractSection(prompt, '## 初稿内容');
      return draft
        ? `${draft}\n\n【润色补强】场景层次更清晰，情感递进更稳定，${defaults.mood}。`.trim()
        : `段落已润色。强化了节奏变化与细节描写，使${genre}风格更加鲜明。`;
    }

    const sceneDesc = this.#extractSceneDescription(prompt);
    const chapterBrief = this.#extractBrief(prompt);
    const briefSnippet = chapterBrief
      ? chapterBrief.length > 80
        ? chapterBrief.slice(0, 80) + '……'
        : chapterBrief
      : `${title}的${genre}故事`;

    return [
      `《${title}》· 第 ${chapterNumber} 章`,
      '',
      `夜色压低了长街的回声。${sceneDesc.includes('继续') ? `${title}的故事在继续` : sceneDesc}。`,
      `${briefSnippet}……主角必须面对眼前的抉择。`,
      '对话短促有力，信息逐步揭示，在结尾埋下一个推动下一章的悬念。',
    ].join('\n');
  }

  #buildJsonResponse(prompt: string): unknown {
    const brief = this.#extractBrief(prompt);
    const genre = this.#extractGenre(prompt);
    const title = this.#extractTitle(prompt);
    const defaults = this.#getGenreDefaults(genre);
    const chapterNumber = extractChapterNumber(prompt);
    const outline = this.#extractOutline(prompt);
    const sceneDesc = this.#extractSceneDescription(prompt);
    const characters = this.#extractCharacters(prompt);

    const briefSummary = brief
      ? brief.length > 60
        ? brief.slice(0, 60) + '……'
        : brief
      : `${title}的${genre}故事`;

    const fallbackChars = characters.length > 0 ? characters : ['主角', '关键配角'];

    if (prompt.includes('世界观构建师')) {
      const hooks = brief
        ? [`核心谜团：${briefSummary}`, '主角的过去隐藏着不为人知的秘密']
        : ['主线冲突正在酝酿', '角色间关系将面临重大考验'];

      return {
        currentFocus: `核心矛盾：${defaults.conflict.slice(0, 30)}；成长主线：${defaults.arc.slice(0, 20)}。`,
        centralConflict: brief ? `基于创作灵感：${briefSummary}` : defaults.conflict,
        growthArc: defaults.arc,
        worldRules: [defaults.rule, `${genre}题材的核心法则`],
        hooks: hooks,
      };
    }

    if (prompt.includes('大纲策划师') || prompt.includes('大纲规划师')) {
      const actNames = ['序幕·入局', '暗流·升级', '风暴·对决'];
      return {
        chapterNumber,
        title: `第 ${chapterNumber} 章 · ${genre === '悬疑' ? '谜影重重' : genre === '玄幻' ? '风云骤起' : '转折出现'}`,
        summary: brief
          ? `围绕「${briefSummary}」展开，主角面临关键抉择。`
          : `第 ${chapterNumber} 章围绕主线冲突推进，并埋入新的疑点。`,
        keyEvents: ['发现新线索', '与对手正面碰撞', '做出关键决定'],
        targetWordCount: 3000,
        hooks: [],
        acts: outline
          ? [
              {
                actNumber: 1,
                title: actNames[0],
                summary: briefSummary,
                chapters: [{ chapterNumber: 1, title: '启程', summary: '故事开始' }],
              },
              {
                actNumber: 2,
                title: actNames[1],
                summary: '矛盾深化',
                chapters: [
                  {
                    chapterNumber: Math.floor(chapterNumber / 2),
                    title: '暗流',
                    summary: '伏笔显现',
                  },
                ],
              },
              {
                actNumber: 3,
                title: actNames[2],
                summary: '高潮收束',
                chapters: [{ chapterNumber, title: '风暴', summary: '最终对决' }],
              },
            ]
          : actNames.map((name, i) => ({
              actNumber: i + 1,
              title: name,
              summary: `第 ${i + 1} 幕主线推进`,
              chapters: [
                {
                  chapterNumber: (i + 1) * Math.max(1, Math.floor(chapterNumber / 3)),
                  title: `第${i + 1}幕开篇`,
                  summary: `${name}阶段开始`,
                },
              ],
            })),
      };
    }

    if (prompt.includes('角色设计师')) {
      const protagonistName = characters[0] || '主角';
      return {
        characters: [
          {
            name: protagonistName,
            role: 'protagonist',
            traits: ['坚韧', '敏锐', '有担当'],
            background: brief || `在${genre}世界中寻找自我定位。`,
            abilities: [`${genre}核心能力`, '逆境突破'],
            relationships: { [fallbackChars[1] || '盟友']: '并肩作战的伙伴' },
            arc: defaults.arc,
          },
          ...fallbackChars.slice(1, 3).map((name, i) => ({
            name,
            role: i === 0 ? 'supporting' : 'antagonist',
            traits: i === 0 ? ['忠诚', '细腻'] : ['深沉', '难以捉摸'],
            background: `与${protagonistName}命运交织的关键人物。`,
            abilities: ['独特专长'],
            relationships: { [protagonistName]: i === 0 ? '盟友与知己' : '宿敌与对照' },
            arc: i === 0 ? '从旁观者变为坚定的支持者。' : '从对立到理解，最终走向各自的结局。',
          })),
        ],
      };
    }

    const protagonistName = characters[0] || '主角';

    if (prompt.includes('章节策划师') || prompt.includes('章节规划')) {
      return {
        plan: {
          chapterNumber,
          title: `${genre === '悬疑' ? '迷雾' : genre === '玄幻' ? '风云' : '转折'}·第 ${chapterNumber} 章`,
          intention:
            sceneDesc !== '继续推进主线'
              ? sceneDesc
              : `${protagonistName || '主角'}继续推进主线，面临新的考验。`,
          wordCountTarget: 3000,
          characters: fallbackChars.slice(0, 3),
          keyEvents: ['关键信息确认', '冲突升级', '做出选择'],
          hooks: [
            {
              description: brief ? `核心悬念：${briefSummary}` : '主线矛盾进一步激化',
              type: 'plot',
              priority: 'major',
            },
          ],
          worldRules: [defaults.rule],
          emotionalBeat: defaults.mood,
          sceneTransition: '从当前场景过渡到下一章的关键转折点。',
        },
      };
    }

    if (prompt.includes('场景规划师')) {
      return {
        scenes: [
          {
            description: `${genre === '玄幻' ? '修炼密室' : genre === '都市' ? '长街尽头' : '核心场景'}，${sceneDesc}`,
            targetWords: 1200,
            mood: defaults.mood.split('→')[0] || '压迫',
          },
          {
            description: `与关键人物交锋，${defaults.conflict.slice(0, 20)}`,
            targetWords: 1800,
            mood: defaults.mood.split('→')[1] || '紧张',
          },
        ],
        characters: fallbackChars.slice(0, 3),
        hooks: [],
      };
    }

    if (
      prompt.includes('上下文整理师') ||
      prompt.includes('上下文') ||
      prompt.includes('ContextCard')
    ) {
      return {
        summary: `已完成至第 ${Math.max(chapterNumber - 1, 0)} 章，${brief ? `围绕「${briefSummary}」` : '当前主线'}正在收束旧问题并引出新矛盾。`,
        activeHooks: [brief ? `核心悬念：${briefSummary}` : '主线矛盾待解'],
        characterStates: [`${fallbackChars[0]}保持警惕并主动调查`],
        locationContext: genre === '玄幻' ? '修炼之地' : genre === '都市' ? '长街' : '核心冲突现场',
      };
    }

    if (prompt.includes('意图导演') || prompt.includes('创作指导师')) {
      const userIntent =
        extractSection(prompt, '## 用户创作意图') ||
        extractSection(prompt, '## 用户意图') ||
        `推进第 ${chapterNumber} 章主线`;
      const beats = ['线索确认', '短兵相接', '做出抉择'];
      const focusCharacters = fallbackChars.slice(0, 2);
      return {
        narrativeGoal: userIntent,
        emotionalTone: defaults.mood,
        keyBeats: beats,
        focusCharacters,
        styleNotes: '保持冲突递进与情绪回弹，结尾留下下一章悬念。',

        chapterGoal: userIntent,
        keyScenes: beats,
        emotionalArc: defaults.mood,
        hookProgression: [],
      };
    }

    if (prompt.includes('质量审计师')) {
      return {
        issues: [],
        overallScore: 92,
        status: 'pass',
        summary: '结构完整，角色与情节一致。',
      };
    }

    if (prompt.includes('记忆提取师')) {
      return {
        facts: [
          {
            content: brief
              ? `第 ${chapterNumber} 章围绕「${briefSummary}」推进了核心剧情。`
              : `第 ${chapterNumber} 章推进了核心剧情并确认新的线索。`,
            category: 'plot',
            confidence: 'high',
          },
        ],
        newHooks: [],
        updatedHooks: [],
      };
    }

    return {
      chapterNumber,
      content: `基于「${title}」的创作灵感：${briefSummary}`,
      genre,
      tone: defaults.mood,
    };
  }
}

// ─── 辅助函数 ──────────────────────────────────────────────────

export function estimateUsage(prompt: string, text: string) {
  const promptTokens = Math.max(24, Math.ceil(prompt.length / 4));
  const completionTokens = Math.max(32, Math.ceil(text.length / 4));
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

export function extractLineValue(prompt: string, label: string): string | undefined {
  const line = prompt.split('\n').find((entry) => entry.trimStart().startsWith(label));
  if (!line) {
    return undefined;
  }
  return line.slice(line.indexOf(label) + label.length).trim();
}
