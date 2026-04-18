import { ParsedItem, ParseResult } from './types';
import { classifyContent } from './classifier';

const EXTINF_REGEX = /^#EXTINF:\s*(-?\d+)\s*(.*),\s*(.+)$/;
const TVG_ID_REGEX = /tvg-id="([^"]*)"/;
const TVG_NAME_REGEX = /tvg-name="([^"]*)"/;
const TVG_LOGO_REGEX = /tvg-logo="([^"]*)"/;
const GROUP_TITLE_REGEX = /group-title="([^"]*)"/;

function parseExtInfLine(line: string): {
  name: string;
  attributes: Record<string, string>;
  groupTitle: string | null;
  tvgId: string | null;
  tvgName: string | null;
  tvgLogo: string | null;
} | null {
  const match = line.match(EXTINF_REGEX);
  if (!match) {
    // Fallback: try to parse without duration
    const fallback = line.match(/^#EXTINF:\s*.*,\s*(.+)$/);
    if (fallback) {
      const attrs = line.substring(0, line.lastIndexOf(','));
      return {
        name: fallback[1].trim(),
        attributes: { raw: attrs },
        groupTitle: attrs.match(GROUP_TITLE_REGEX)?.[1] || null,
        tvgId: attrs.match(TVG_ID_REGEX)?.[1] || null,
        tvgName: attrs.match(TVG_NAME_REGEX)?.[1] || null,
        tvgLogo: attrs.match(TVG_LOGO_REGEX)?.[1] || null,
      };
    }
    return null;
  }

  const attrString = match[2];
  const name = match[3].trim();

  return {
    name,
    attributes: { raw: attrString },
    groupTitle: attrString.match(GROUP_TITLE_REGEX)?.[1] || null,
    tvgId: attrString.match(TVG_ID_REGEX)?.[1] || null,
    tvgName: attrString.match(TVG_NAME_REGEX)?.[1] || null,
    tvgLogo: attrString.match(TVG_LOGO_REGEX)?.[1] || null,
  };
}

export function parseM3U(content: string): ParseResult {
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const items: ParsedItem[] = [];
  const categoriesSet = new Set<string>();

  let currentInfo: ReturnType<typeof parseExtInfLine> = null;

  for (const line of lines) {
    if (line.startsWith('#EXTM3U')) continue;

    if (line.startsWith('#EXTINF:')) {
      currentInfo = parseExtInfLine(line);
      continue;
    }

    // Skip other directives
    if (line.startsWith('#')) continue;

    // This should be a URL line
    if (currentInfo && (line.startsWith('http://') || line.startsWith('https://') || line.startsWith('rtmp://') || line.startsWith('rtsp://') || line.startsWith('mms://'))) {
      const contentType = classifyContent(
        currentInfo.name,
        currentInfo.groupTitle,
        line
      );

      if (currentInfo.groupTitle) {
        categoriesSet.add(currentInfo.groupTitle);
      }

      items.push({
        name: currentInfo.name,
        streamUrl: line,
        groupTitle: currentInfo.groupTitle,
        logoUrl: currentInfo.tvgLogo || null,
        tvgId: currentInfo.tvgId,
        tvgName: currentInfo.tvgName,
        tvgLogo: currentInfo.tvgLogo,
        contentType,
        metadata: currentInfo.attributes,
      });

      currentInfo = null;
    }
  }

  const categories = Array.from(categoriesSet);
  const channelsCount = items.filter(i => i.contentType === 'channel').length;
  const moviesCount = items.filter(i => i.contentType === 'movie').length;
  const seriesCount = items.filter(i => i.contentType === 'series').length;

  return {
    items,
    categories,
    totalItems: items.length,
    channelsCount,
    moviesCount,
    seriesCount,
    categoriesCount: categories.length,
  };
}
