import { useState, useEffect } from 'react';
import { fetchGenres, updateGenre } from '../lib/api';

interface GenreRule {
  id: string;
  name: string;
  description: string;
  constraints: string[];
  tags: string[];
}

export default function GenreManager() {
  const [genres, setGenres] = useState<GenreRule[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<GenreRule | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGenres()
      .then((data) => {
        setGenres(data.genres ?? data);
      })
      .catch(() => {
        // use empty list on failure
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (genre: GenreRule) => {
    try {
      const updated = await updateGenre(genre.id, {
        name: genre.name,
        description: genre.description,
        constraints: genre.constraints,
        tags: genre.tags,
      });
      setGenres((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
      setSelectedGenre(updated);
      setIsEditing(false);
    } catch {
      // save failed
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">加载中…</div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">题材管理</h1>
        <p className="text-sm text-muted-foreground mt-1">管理题材模板及其预置规则（PRD-002）</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {genres.map((genre) => (
          <button
            key={genre.id}
            type="button"
            className={`rounded-lg border p-4 text-left transition-colors hover:bg-accent ${
              selectedGenre?.id === genre.id ? 'border-primary bg-accent' : 'border-border'
            }`}
            onClick={() => {
              setSelectedGenre(genre);
              setIsEditing(false);
            }}
          >
            <h3 className="font-semibold">{genre.name}</h3>
            <p className="text-xs text-muted-foreground mt-1">{genre.description}</p>
            <div className="flex flex-wrap gap-1 mt-2">
              {genre.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="inline-block rounded bg-secondary px-2 py-0.5 text-xs">
                  {tag}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>

      {selectedGenre && (
        <div className="mt-6 rounded-lg border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">{selectedGenre.name}</h2>
            <button
              type="button"
              className="text-sm text-primary hover:underline"
              onClick={() => setIsEditing(!isEditing)}
            >
              {isEditing ? '取消编辑' : '编辑规则'}
            </button>
          </div>

          {isEditing ? (
            <GenreEditor
              genre={selectedGenre}
              onSave={handleSave}
              onCancel={() => setIsEditing(false)}
            />
          ) : (
            <GenreDetail genre={selectedGenre} />
          )}
        </div>
      )}
    </div>
  );
}

function GenreDetail({ genre }: { genre: GenreRule }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium mb-1">描述</h3>
        <p className="text-sm text-muted-foreground">{genre.description}</p>
      </div>
      {genre.constraints.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-1">预置约束规则</h3>
          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
            {genre.constraints.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <h3 className="text-sm font-medium mb-1">标签</h3>
        <div className="flex flex-wrap gap-1">
          {genre.tags.map((tag) => (
            <span key={tag} className="inline-block rounded bg-secondary px-2 py-0.5 text-xs">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function GenreEditor({
  genre,
  onSave,
  onCancel,
}: {
  genre: GenreRule;
  onSave: (genre: GenreRule) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(genre.name);
  const [description, setDescription] = useState(genre.description);
  const [constraintsText, setConstraintsText] = useState(genre.constraints.join('\n'));
  const [tagsText, setTagsText] = useState(genre.tags.join(', '));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...genre,
      name,
      description,
      constraints: constraintsText.split('\n').filter(Boolean),
      tags: tagsText
        .split(/[,，]/)
        .map((t) => t.trim())
        .filter(Boolean),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">题材名称</label>
        <input
          type="text"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">描述</label>
        <textarea
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">约束规则（每行一条）</label>
        <textarea
          className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
          rows={4}
          value={constraintsText}
          onChange={(e) => setConstraintsText(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">标签（逗号分隔）</label>
        <input
          type="text"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
        >
          保存
        </button>
        <button
          type="button"
          className="rounded-md border px-4 py-2 text-sm hover:bg-accent"
          onClick={onCancel}
        >
          取消
        </button>
      </div>
    </form>
  );
}
