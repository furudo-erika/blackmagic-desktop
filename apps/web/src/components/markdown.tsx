'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// [[path/to/note]] or [[path/to/note|Display]] -> [Display](/vault?path=…)
// The vault browser is the canonical viewer; clicking a wikilink hops there.
const WIKILINK_RE = /\[\[([^\]\n|]+?)(?:\|([^\]\n]+))?\]\]/g;
export function renderWikilinks(src: string): string {
  return src.replace(WIKILINK_RE, (_whole, target: string, alt?: string) => {
    const raw = target.trim().replace(/^\.\//, '');
    const withMd = raw.endsWith('.md') ? raw : raw + '.md';
    const display = (alt ?? raw.replace(/\.md$/, '').split('/').pop() ?? raw).trim();
    return `[${display}](/vault?path=${encodeURIComponent(withMd)})`;
  });
}

export function Markdown({ source }: { source: string }) {
  if (!source.trim()) {
    return <p className="text-muted dark:text-[#8C837C] italic">(empty)</p>;
  }
  const processed = renderWikilinks(source);
  return (
    <div className="prose prose-bm max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{processed}</ReactMarkdown>
    </div>
  );
}
