import { Hono } from 'hono';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';

const GENRE_FILE = 'genres.json';

interface GenreRule {
  id: string;
  name: string;
  description: string;
  constraints: string[];
  tags: string[];
}

const DEFAULT_GENRES: GenreRule[] = [
  {
    id: 'urban',
    name: '都市',
    description: '现代都市背景，现实主义风格',
    constraints: ['无超自然力量', '符合现实社会规则', '时间线为现代'],
    tags: ['现实', '职场', '校园', '生活'],
  },
  {
    id: 'fantasy',
    name: '玄幻',
    description: '架空世界，包含魔法、修炼等超自然元素',
    constraints: ['需定义力量体系', '需明确世界观设定', '修炼等级需自洽'],
    tags: ['魔法', '修炼', '异世界', '冒险'],
  },
  {
    id: 'scifi',
    name: '科幻',
    description: '基于科学设想的未来或架空世界',
    constraints: ['科技设定需有科学依据', '时间线为未来或架空', '逻辑自洽'],
    tags: ['太空', 'AI', '未来', '赛博朋克'],
  },
  {
    id: 'xianxia',
    name: '仙侠',
    description: '中国古典仙侠背景，修仙问道',
    constraints: ['需定义修炼体系', '需明确仙凡界限', '法力规则需一致'],
    tags: ['修仙', '丹药', '法宝', '天道'],
  },
  {
    id: 'historical',
    name: '历史',
    description: '基于真实历史背景的创作',
    constraints: ['需符合历史时期特征', '重大历史事件不可篡改', '人物设定符合时代'],
    tags: ['朝堂', '军事', '权谋', '古代'],
  },
  {
    id: 'mystery',
    name: '悬疑',
    description: '以解谜、推理为核心的题材',
    constraints: ['伏笔必须有合理解释', '时间线不可矛盾', '线索必须公平呈现'],
    tags: ['推理', '犯罪', '悬疑', '惊悚'],
  },
  {
    id: 'game',
    name: '游戏',
    description: '以游戏世界或游戏相关为核心',
    constraints: ['需定义游戏规则', '等级/职业系统需自洽', '虚拟与现实界限清晰'],
    tags: ['网游', '电竞', '穿越', '系统流'],
  },
  {
    id: 'fanfic',
    name: '同人',
    description: '基于已有 IP 的二次创作',
    constraints: ['原作角色不 OOC', '正典设定不可违反', '需声明同人模式'],
    tags: ['动漫', '影视', '小说', '正典延续'],
  },
  {
    id: 'other',
    name: '其他',
    description: '自定义题材类型',
    constraints: [],
    tags: ['自定义'],
  },
];

const createGenreSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  constraints: z.array(z.string()),
  tags: z.array(z.string()),
});

const updateGenreSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  constraints: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

function getGenresFilePath(): string {
  const configDir = process.env.CONFIG_DIR ?? process.cwd();
  return path.join(configDir, '.cybernovelist', GENRE_FILE);
}

function loadGenres(): GenreRule[] {
  const filePath = getGenresFilePath();
  if (!fs.existsSync(filePath)) return [...DEFAULT_GENRES];
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as GenreRule[];
  } catch {
    return [...DEFAULT_GENRES];
  }
}

function saveGenres(genres: GenreRule[]) {
  const filePath = getGenresFilePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(genres, null, 2), 'utf-8');
}

export function createGenreRouter(): Hono {
  const router = new Hono();

  // GET /api/genres
  router.get('/', (c) => {
    const genres = loadGenres();
    return c.json({ data: genres, total: genres.length });
  });

  // POST /api/genres
  router.post('/', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const result = createGenreSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }

    const genres = loadGenres();
    const id = crypto.randomUUID();
    const newGenre: GenreRule = {
      id,
      name: result.data.name,
      description: result.data.description,
      constraints: result.data.constraints,
      tags: result.data.tags,
    };
    genres.push(newGenre);
    saveGenres(genres);
    return c.json({ data: newGenre }, 201);
  });

  // PUT /api/genres/:genreId
  router.put('/:genreId', async (c) => {
    const genreId = c.req.param('genreId');
    const body = await c.req.json().catch(() => ({}));
    const result = updateGenreSchema.safeParse(body);
    if (!result.success) {
      return c.json(
        { error: { code: 'INVALID_STATE', message: result.error.errors[0].message } },
        400
      );
    }

    const genres = loadGenres();
    const index = genres.findIndex((g) => g.id === genreId);
    if (index === -1) {
      return c.json({ error: { code: 'GENRE_NOT_FOUND', message: '题材不存在' } }, 404);
    }

    genres[index] = { ...genres[index], ...result.data };
    saveGenres(genres);
    return c.json({ data: genres[index] });
  });

  // DELETE /api/genres/:genreId
  router.delete('/:genreId', (c) => {
    const genreId = c.req.param('genreId');
    const genres = loadGenres();
    const filtered = genres.filter((g) => g.id !== genreId);
    if (filtered.length === genres.length) {
      return c.json({ error: { code: 'GENRE_NOT_FOUND', message: '题材不存在' } }, 404);
    }

    saveGenres(filtered);
    return c.body(null, 204);
  });

  return router;
}
