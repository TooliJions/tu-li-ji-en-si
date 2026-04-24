/**
 * Normalize Chinese genre labels into English agent identifiers.
 */
export function normalizeGenreForAgents(genre: string | undefined): string {
  const value = (genre ?? '').trim();
  if (value === '都市') return 'urban';
  if (value === '玄幻') return 'fantasy';
  if (value === '科幻') return 'sci-fi';
  if (value === '历史') return 'history';
  if (value === '游戏') return 'game';
  if (value === '悬疑') return 'horror';
  if (value === '同人') return 'fanfic';
  return value || 'urban';
}
