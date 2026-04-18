import { ContentType } from '@/types/database';

const MOVIE_PATTERNS = [
  /\b(19|20)\d{2}\b/,          // Year pattern (1900-2099)
  /\bvod\b/i,
  /\bmovies?\b/i,
  /\bfilms?\b/i,
  /\b(720p|1080p|4k|uhd|hdr|bluray|bdrip|webrip|web-dl)\b/i,
];

const SERIES_PATTERNS = [
  /s\d{1,3}\s*e\d{1,3}/i,      // S01E01
  /season\s*\d+/i,
  /episode\s*\d+/i,
  /\bseries\b/i,
  /\be\d{2,3}\b/i,
];

const CHANNEL_PATTERNS = [
  /\b(live|tv|hd|fhd|sd|hevc)\b/i,
  /\b(news|sport|kids|music|documentary)\b/i,
  /\b(epg|guide|24\/7)\b/i,
];

const MOVIE_GROUP_KEYWORDS = [
  'movie', 'movies', 'film', 'films', 'vod', 'cinema',
  'kino', 'filme', 'peliculas',
];

const SERIES_GROUP_KEYWORDS = [
  'series', 'serie', 'shows', 'show', 'tv show',
  'serien', 'episod',
];

const CHANNEL_GROUP_KEYWORDS = [
  'live', 'tv', 'channel', 'channels', 'iptv',
  'sport', 'news', 'kids', 'music', 'entertainment',
  'documentary', 'national', 'local',
];

function matchesPatterns(text: string, patterns: RegExp[]): number {
  return patterns.reduce((score, pattern) => score + (pattern.test(text) ? 1 : 0), 0);
}

function matchesGroupKeywords(group: string, keywords: string[]): boolean {
  const lower = group.toLowerCase();
  return keywords.some(kw => lower.includes(kw));
}

export function classifyContent(
  name: string,
  groupTitle: string | null,
  streamUrl: string
): ContentType {
  const group = groupTitle || '';

  // Group-based classification (highest priority)
  if (matchesGroupKeywords(group, SERIES_GROUP_KEYWORDS)) return 'series';
  if (matchesGroupKeywords(group, MOVIE_GROUP_KEYWORDS)) return 'movie';
  if (matchesGroupKeywords(group, CHANNEL_GROUP_KEYWORDS)) return 'channel';

  // Name + URL pattern matching
  const combinedText = `${name} ${streamUrl}`;

  const seriesScore = matchesPatterns(combinedText, SERIES_PATTERNS);
  const movieScore = matchesPatterns(combinedText, MOVIE_PATTERNS);
  const channelScore = matchesPatterns(combinedText, CHANNEL_PATTERNS);

  if (seriesScore > 0 && seriesScore >= movieScore) return 'series';
  if (movieScore > 0 && movieScore > channelScore) return 'movie';
  if (channelScore > 0) return 'channel';

  // URL extension heuristics
  const urlLower = streamUrl.toLowerCase();
  if (urlLower.includes('/movie/') || urlLower.includes('/vod/')) return 'movie';
  if (urlLower.includes('/series/')) return 'series';
  if (urlLower.includes('/live/') || urlLower.endsWith('.ts')) return 'channel';

  return 'uncategorized';
}
