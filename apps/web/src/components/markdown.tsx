'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function Markdown({ source }: { source: string }) {
  if (!source.trim()) {
    return <p className="text-muted dark:text-[#8C837C] italic">(empty)</p>;
  }
  return (
    <div className="prose prose-bm max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </div>
  );
}
