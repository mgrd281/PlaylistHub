import { ContentType } from '@/types/database';

export interface ParsedItem {
  name: string;
  streamUrl: string;
  groupTitle: string | null;
  logoUrl: string | null;
  tvgId: string | null;
  tvgName: string | null;
  tvgLogo: string | null;
  contentType: ContentType;
  metadata: Record<string, string>;
}

export interface ParseResult {
  items: ParsedItem[];
  categories: string[];
  totalItems: number;
  channelsCount: number;
  moviesCount: number;
  seriesCount: number;
  categoriesCount: number;
}
