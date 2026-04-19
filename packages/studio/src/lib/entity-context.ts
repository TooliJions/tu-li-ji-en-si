const LOCATION_SUFFIXES = ['室', '楼', '城', '街', '院', '堂', '阁', '殿', '馆', '山', '谷', '镇'];
const ITEM_KEYWORDS = [
  '试卷',
  '卷宗',
  '卷轴',
  '文件',
  '玉佩',
  '长剑',
  '短剑',
  '钥匙',
  '令牌',
  '手札',
  '书信',
  '图纸',
  '药瓶',
  '档案',
];
const STOP_TERMS = new Set([
  '没什么',
  '只是觉得',
  '有些事情',
  '不对劲',
  '望着窗外',
  '收回目光',
  '最后一道题',
  '惊人的相似',
  '轻声问道',
]);

export type EntityType = 'character' | 'location' | 'item';

export function extractFlowEntities(text: string, knownNames: string[] = []): string[] {
  const entitySet = new Set<string>();

  for (const name of knownNames) {
    if (name && text.includes(name)) {
      entitySet.add(name);
    }
  }

  collectMatches(text, /([\u4e00-\u9fa5]{2,4})(?=轻声|低声|问道|说道|提醒|收回|坐在|走进|翻看|看向|望着|将|把)/g, entitySet);
  collectMatches(text, /(?:在|进了|走进|进入|回到|来到|坐在)([\u4e00-\u9fa5]{1,6}?(?:室|楼|城|街|院|堂|阁|殿|馆|山|谷|镇))(?:里|中|内)?/g, entitySet);
  collectMatches(text, /(?:^|[，。！？\s"“])([\u4e00-\u9fa5]{1,6}?(?:室|楼|城|街|院|堂|阁|殿|馆|山|谷|镇))(?:里|中|内)/g, entitySet);

  for (const keyword of ITEM_KEYWORDS) {
    const regex = new RegExp(`([\\u4e00-\\u9fa5]{0,3}${keyword})`, 'g');
    collectMatches(text, regex, entitySet);
  }

  return [...entitySet]
    .map((entity) => entity.trim())
    .filter((entity) => entity.length >= 2 && entity.length <= 8)
    .filter((entity) => !STOP_TERMS.has(entity))
    .sort((left, right) => right.length - left.length);
}

export function inferEntityType(entity: string, knownNames: string[] = []): EntityType {
  if (knownNames.includes(entity)) {
    return 'character';
  }
  if (LOCATION_SUFFIXES.some((suffix) => entity.endsWith(suffix))) {
    return 'location';
  }
  return 'item';
}

export function findSentenceAround(text: string, entity: string): string {
  const sentences = text
    .split(/(?<=[。！？!?])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);

  return sentences.find((sentence) => sentence.includes(entity)) ?? '';
}

export function inferEmotionFromSentence(sentence: string): string {
  if (!sentence) {
    return '平静';
  }
  if (/(不对劲|警觉|提防|戒备|压低声音|谨慎)/.test(sentence)) {
    return '警惕';
  }
  if (/(翻看|核对|注视|盯着|观察|查看)/.test(sentence)) {
    return '专注';
  }
  if (/(慌|紧张|急促|颤抖)/.test(sentence)) {
    return '紧张';
  }
  if (/(笑|欣喜|轻快)/.test(sentence)) {
    return '欣喜';
  }
  return '平静';
}

function collectMatches(text: string, pattern: RegExp, entitySet: Set<string>) {
  for (const match of text.matchAll(pattern)) {
    const entity = sanitizeCandidate(match[1]?.trim() ?? '');
    if (entity) {
      entitySet.add(entity);
    }
  }
}

function sanitizeCandidate(candidate: string): string {
  if (!candidate) {
    return '';
  }

  return candidate
    .replace(
      /^(?:林晨坐在|苏小雨坐在|坐在|站在|走进|进入|来到|回到|昨晚在|将|把|看到|到的那份|到的|轻声|低声|核对|翻看|查看|对|看|交给|带着|随身带着)/,
      ''
    )
    .replace(/(?:里看|里望|里翻|里提醒)$/u, '')
    .trim();
}