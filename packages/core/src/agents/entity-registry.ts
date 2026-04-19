export type EntityType = 'character' | 'location' | 'item' | 'organization';
export type EntityStatus = 'active' | 'inactive' | 'suspended';

export interface EntityEntry {
  name: string;
  type: EntityType;
  sourceChapter: number;
  description?: string;
  status?: EntityStatus;
}

export interface EntityRecord extends EntityEntry {
  id: string;
  registeredAt: string;
}

export interface RegisterResult {
  success: boolean;
  action: 'registered' | 'duplicate' | 'error';
  message?: string;
  existing?: EntityRecord;
}

export interface DetectionResult {
  newEntities: string[];
  knownEntities: string[];
}

// 常见中文命名模式，用于从文本中提取实体名
const CHARACTER_PATTERNS = [
  /[\u4e00-\u9fa5]{2,4}(?:师兄|师弟|师姐|师妹|师父|徒弟|长老|门主|宗主|尊者|前辈|公子|小姐|夫人|先生)/g,
  /(?:李|王|张|刘|陈|杨|赵|黄|周|吴|徐|孙|胡|朱|高|林|何|郭|马)(?:[\u4e00-\u9fa5]){1,3}/g,
];

const LOCATION_PATTERNS = [
  /[\u4e00-\u9fa5]{2,6}(?:门|派|宗|殿|宫|山|谷|峰|崖|洞|府|院|寺|观|城|镇|村|街|路|楼|阁|堂|厅|室|园|林|海|湖|河|溪|涧|岛|原|漠|域|界|天|地|空间|禁地|秘境)/g,
];

const ITEM_PATTERNS = [
  /[\u4e00-\u9fa5]{2,6}(?:剑|刀|枪|棍|棒|锤|斧|弓|弩|盾|甲|衣|袍|服|帽|鞋|靴|戒|镯|珠|玉|佩|瓶|炉|鼎|丹|药|符|阵|图|卷|书|简|袋|囊|盒|盘|台|镜|灯|扇|伞|笛|箫|琴|瑟|琵琶)/g,
];

const ORGANIZATION_PATTERNS = [
  /[\u4e00-\u9fa5]{2,6}(?:门|派|宗|帮|会|盟|教|宗族|世家|家族|氏|阁|楼|堂|殿|宫|院|府|司|署|衙|营|寨|堡|城)/g,
];

const PATTERN_MAP: Record<EntityType, RegExp[]> = {
  character: CHARACTER_PATTERNS,
  location: LOCATION_PATTERNS,
  item: ITEM_PATTERNS,
  organization: ORGANIZATION_PATTERNS,
};

export class EntityRegistry {
  private entities: Map<string, EntityRecord> = new Map();
  private idCounter = 0;

  /**
   * 注册新实体。
   */
  register(entry: EntityEntry): RegisterResult {
    const existing = this.#findMatch(entry.name, entry.type);
    if (existing) {
      return {
        success: false,
        action: 'duplicate',
        message: `实体「${entry.name}」重复（${existing.type}，第 ${existing.sourceChapter} 章已注册）`,
        existing,
      };
    }

    const id = this.#generateId(entry.type);
    const record: EntityRecord = {
      ...entry,
      id,
      status: entry.status ?? 'active',
      registeredAt: new Date().toISOString(),
    };

    this.entities.set(id, record);
    return { success: true, action: 'registered' };
  }

  /**
   * 批量注册实体。
   */
  registerBatch(entries: EntityEntry[]): RegisterResult[] {
    return entries.map((entry) => this.register(entry));
  }

  /**
   * 从文本中检测新实体，与已注册列表对比。
   */
  detectNewEntities(text: string, type: EntityType): DetectionResult {
    if (!text || text.trim().length === 0) {
      return { newEntities: [], knownEntities: [] };
    }

    const patterns = PATTERN_MAP[type];
    const candidates = new Set<string>();

    for (const pattern of patterns) {
      const matches = text.match(pattern) || [];
      for (const match of matches) {
        candidates.add(match);
      }
    }

    const registered = this.listByType(type);
    const knownEntities: string[] = [];
    const newEntities: string[] = [];

    // 检查已知实体是否出现在文本中
    for (const entity of registered) {
      if (text.includes(entity.name)) {
        knownEntities.push(entity.name);
      }
    }

    // 检查候选实体哪些是新的
    const knownNames = new Set(registered.map((e) => e.name));
    for (const candidate of candidates) {
      const isKnown = [...knownNames].some(
        (name) => candidate.includes(name) || name.includes(candidate)
      );
      if (!isKnown && !this.#isLikelyFalsePositive(candidate, type)) {
        newEntities.push(candidate);
      }
    }

    return { newEntities, knownEntities };
  }

  /**
   * 按名称查找实体。
   */
  lookup(name: string): EntityRecord | undefined {
    for (const entity of this.entities.values()) {
      if (entity.name === name) {
        return entity;
      }
    }
    return undefined;
  }

  /**
   * 按类型列出实体。
   */
  listByType(type: EntityType): EntityRecord[] {
    return [...this.entities.values()].filter((e) => e.type === type);
  }

  /**
   * 列出所有已注册实体。
   */
  listAll(): EntityRecord[] {
    return [...this.entities.values()];
  }

  /**
   * 获取实体名称列表。
   */
  getNames(type?: EntityType): string[] {
    const entities = type ? this.listByType(type) : this.listAll();
    return entities.map((e) => e.name);
  }

  /**
   * 移除实体。
   */
  remove(name: string): boolean {
    for (const [id, entity] of this.entities.entries()) {
      if (entity.name === name) {
        this.entities.delete(id);
        return true;
      }
    }
    return false;
  }

  /**
   * 序列化为 JSON 可传输格式。
   */
  toJSON(): EntityRecord[] {
    return [...this.entities.values()];
  }

  /**
   * 从 JSON 恢复注册表状态。
   */
  static fromJSON(data: EntityRecord[]): EntityRegistry {
    const registry = new EntityRegistry();
    for (const record of data) {
      registry.entities.set(record.id, record);
    }
    return registry;
  }

  /**
   * 获取统计信息。
   */
  stats(): Record<EntityType | 'total', number> {
    const result: Record<string, number> = {
      character: 0,
      location: 0,
      item: 0,
      organization: 0,
      total: 0,
    };

    for (const entity of this.entities.values()) {
      result[entity.type]++;
      result.total++;
    }

    return result as Record<EntityType | 'total', number>;
  }

  // ── Private helpers ─────────────────────────────────────────

  #generateId(type: EntityType): string {
    this.idCounter++;
    return `${type}-${String(this.idCounter).padStart(6, '0')}`;
  }

  #findMatch(name: string, type: EntityType): EntityRecord | undefined {
    // 精确匹配
    for (const entity of this.entities.values()) {
      if (entity.type === type && entity.name === name) {
        return entity;
      }
    }

    // 模糊匹配：名称包含关系
    for (const entity of this.entities.values()) {
      if (entity.type === type) {
        if (entity.name.includes(name) || name.includes(entity.name)) {
          return entity;
        }
      }
    }

    return undefined;
  }

  #isLikelyFalsePositive(candidate: string, _type: EntityType): boolean {
    // 过滤过短或过长的候选
    if (candidate.length < 2 || candidate.length > 10) {
      return true;
    }
    // 过滤常见非实体词
    const stopWords = ['之中', '之上', '之下', '之内', '之外', '之间', '之上', '之后', '之前'];
    return stopWords.some((word) => candidate.endsWith(word));
  }
}
