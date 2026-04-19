import { Hono } from 'hono';
import * as fs from 'node:fs';
import { RuntimeStateStore, StateManager } from '@cybernovelist/core';
import { hasStudioBookRuntime, getStudioRuntimeRootDir } from '../core-bridge';
import {
  extractFlowEntities,
  findSentenceAround,
  inferEmotionFromSentence,
  inferEntityType,
} from '../../lib/entity-context';

interface MemoryPreviewItem {
  text: string;
  confidence: number;
  sourceType: 'character' | 'fact' | 'hook';
  entityType: 'character' | 'location' | 'item' | null;
}

function getContextState() {
  const manager = new StateManager(getStudioRuntimeRootDir());
  const store = new RuntimeStateStore(manager);
  return { manager, store };
}

function readChapterContent(bookId: string, chapterNumber?: number): string {
  const { manager, store } = getContextState();
  const manifest = store.loadManifest(bookId);
  const targetChapter = chapterNumber ?? manifest.lastChapterWritten;
  if (!targetChapter) {
    return '';
  }

  const chapterPath = manager.getChapterFilePath(bookId, targetChapter);
  if (!fs.existsSync(chapterPath)) {
    return '';
  }

  const raw = fs.readFileSync(chapterPath, 'utf-8');
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  return match ? raw.slice(match[0].length).trim() : raw.trim();
}

function inferLocation(entity: string, entityType: 'character' | 'location' | 'item', sentence: string): string {
  if (entityType === 'location') {
    return entity;
  }

  const locations = extractFlowEntities(sentence).filter((candidate) =>
    ['室', '楼', '城', '街', '院', '堂', '阁', '殿', '馆', '山', '谷', '镇'].some((suffix) =>
      candidate.endsWith(suffix)
    )
  );

  return locations.find((location) => location !== entity) ?? '未知地点';
}

function inferInventory(entity: string, entityType: 'character' | 'location' | 'item', sentence: string, facts: string[]) {
  if (entityType !== 'character') {
    return [] as string[];
  }

  const items = new Set(
    [...extractFlowEntities(sentence), ...facts.flatMap((fact) => extractFlowEntities(fact))]
      .map((candidate) => normalizeItemCandidate(candidate))
      .filter((candidate) => candidate.length > 0 && inferEntityType(candidate) === 'item' && candidate !== entity)
  );

  return [...items];
}

function normalizeItemCandidate(candidate: string): string {
  const cleaned = candidate
    .replace(/^(?:核对|翻看|查看|对|看|将|把|交给|带着|随身带着)/, '')
    .trim();

  const itemMatch = cleaned.match(/([\u4e00-\u9fa5]{0,3}(?:试卷|卷宗|卷轴|文件|玉佩|长剑|短剑|钥匙|令牌|手札|书信|图纸|药瓶|档案))/);
  return itemMatch?.[1] ?? '';
}

function buildRelationships(
  entity: string,
  entityType: 'character' | 'location' | 'item',
  characterNames: string[],
  relationshipMap: Record<string, string>,
  sentence: string
) {
  if (entityType === 'character') {
    return Object.entries(relationshipMap).map(([withName, type]) => ({
      with: withName,
      type,
      affinity: '关联',
    }));
  }

  return characterNames
    .filter((name) => sentence.includes(name))
    .map((name) => ({ with: name, type: '关联实体', affinity: '线索相关' }));
}

function mapFactConfidence(confidence: 'high' | 'medium' | 'low') {
  if (confidence === 'high') return 0.9;
  if (confidence === 'medium') return 0.68;
  return 0.35;
}

function mapHookConfidence(priority: 'critical' | 'major' | 'minor', status: string) {
  const priorityScore = priority === 'critical' ? 0.92 : priority === 'major' ? 0.82 : 0.7;
  if (status === 'dormant' || status === 'deferred') {
    return Math.max(0.45, priorityScore - 0.12);
  }
  if (status === 'resolved' || status === 'abandoned') {
    return Math.max(0.4, priorityScore - 0.2);
  }
  return priorityScore;
}

function upsertMemory(
  bucket: Map<string, MemoryPreviewItem>,
  item: MemoryPreviewItem
) {
  const existing = bucket.get(item.text);
  if (!existing || item.confidence > existing.confidence) {
    bucket.set(item.text, item);
  }
}

function buildMemoryPreview(bookId: string) {
  const { store } = getContextState();
  const manifest = store.loadManifest(bookId);
  const characterNames = manifest.characters.map((character) => character.name);
  const bucket = new Map<string, MemoryPreviewItem>();

  for (const character of manifest.characters) {
    upsertMemory(bucket, {
      text: character.name,
      confidence: 0.95,
      sourceType: 'character',
      entityType: 'character',
    });
  }

  for (const fact of manifest.facts) {
    const confidence = mapFactConfidence(fact.confidence);
    const entities = extractFlowEntities(fact.content, characterNames);
    if (entities.length === 0) {
      upsertMemory(bucket, {
        text: fact.content.slice(0, 18),
        confidence,
        sourceType: 'fact',
        entityType: null,
      });
      continue;
    }

    for (const entity of entities) {
      upsertMemory(bucket, {
        text: entity,
        confidence,
        sourceType: 'fact',
        entityType: inferEntityType(entity, characterNames),
      });
    }
  }

  for (const hook of manifest.hooks) {
    upsertMemory(bucket, {
      text: hook.description,
      confidence: mapHookConfidence(hook.priority, hook.status),
      sourceType: 'hook',
      entityType: null,
    });
  }

  return {
    summary: {
      facts: manifest.facts.length,
      hooks: manifest.hooks.length,
      characters: manifest.characters.length,
    },
    memories: [...bucket.values()]
      .sort((left, right) => right.confidence - left.confidence || left.text.localeCompare(right.text, 'zh-CN'))
      .slice(0, 18),
  };
}

export function createContextRouter(): Hono {
  const router = new Hono();

  router.get('/memory-preview', (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    return c.json({ data: buildMemoryPreview(bookId) });
  });

  // GET /api/books/:bookId/context/:entityName
  router.get('/:entityName', (c) => {
    const bookId = c.req.param('bookId')!;
    if (!hasStudioBookRuntime(bookId)) {
      return c.json({ error: { code: 'BOOK_NOT_FOUND', message: '书籍不存在' } }, 404);
    }

    const entityName = decodeURIComponent(c.req.param('entityName'));
    const chapterNumber = Number.parseInt(c.req.query('chapterNumber') || '0', 10) || undefined;
    const { store } = getContextState();
    const manifest = store.loadManifest(bookId);
    const chapterContent = readChapterContent(bookId, chapterNumber);
    const characterNames = manifest.characters.map((character) => character.name);
    const factText = manifest.facts.map((fact) => fact.content).join('\n');
    const knownEntities = new Set([
      ...characterNames,
      ...extractFlowEntities(chapterContent, characterNames),
      ...extractFlowEntities(factText, characterNames),
    ]);

    if (!knownEntities.has(entityName)) {
      return c.json({ error: { code: 'ENTITY_NOT_FOUND', message: '实体不存在' } }, 404);
    }

    const matchingCharacter = manifest.characters.find((character) => character.name === entityName);
    const entityType = inferEntityType(entityName, characterNames);
    const sentence = findSentenceAround(chapterContent, entityName);
    const relatedFacts = manifest.facts
      .filter((fact) => fact.content.includes(entityName))
      .map((fact) => fact.content);
    const relationshipMap = matchingCharacter
      ? Object.fromEntries(
          Object.entries(matchingCharacter.relationships).map(([characterId, relation]) => {
            const relationName = manifest.characters.find((character) => character.id === characterId)?.name ?? characterId;
            return [relationName, relation];
          })
        )
      : {};
    const activeHooks = manifest.hooks
      .filter((hook) => hook.status === 'open' || hook.status === 'progressing')
      .filter(
        (hook) =>
          hook.description.includes(entityName) ||
          (matchingCharacter ? hook.relatedCharacters.includes(matchingCharacter.id) : sentence.includes(hook.description))
      )
      .map((hook) => ({ id: hook.id, description: hook.description, status: hook.status }));

    return c.json({
      data: {
        name: entityName,
        type: entityType,
        currentLocation: inferLocation(entityName, entityType, sentence),
        emotion: inferEmotionFromSentence(sentence),
        inventory: inferInventory(entityName, entityType, sentence, relatedFacts),
        relationships: buildRelationships(
          entityName,
          entityType,
          characterNames,
          relationshipMap,
          sentence
        ),
        activeHooks,
      },
    });
  });

  return router;
}
