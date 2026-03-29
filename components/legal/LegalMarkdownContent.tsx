import React from 'react';

type MarkdownBlock =
  | { kind: 'heading'; level: 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] };

type LegalMarkdownContentProps = {
  markdown: string;
};

function parseMarkdown(markdown: string): MarkdownBlock[] {
  const lines = String(markdown || '').split('\n');
  const blocks: MarkdownBlock[] = [];

  let paragraphLines: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    blocks.push({
      kind: 'paragraph',
      text: paragraphLines.join(' ').trim(),
    });
    paragraphLines = [];
  };

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push({ kind: 'list', items: [...listItems] });
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    if (line.startsWith('### ')) {
      flushParagraph();
      flushList();
      blocks.push({ kind: 'heading', level: 3, text: line.replace(/^###\s+/, '').trim() });
      continue;
    }

    if (line.startsWith('## ') || line.startsWith('# ')) {
      flushParagraph();
      flushList();
      blocks.push({
        kind: 'heading',
        level: 2,
        text: line.replace(/^#{1,2}\s+/, '').trim(),
      });
      continue;
    }

    if (line.startsWith('- ') || line.startsWith('* ')) {
      flushParagraph();
      listItems.push(line.replace(/^[-*]\s+/, '').trim());
      continue;
    }

    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();

  return blocks;
}

export default function LegalMarkdownContent({ markdown }: LegalMarkdownContentProps) {
  const blocks = parseMarkdown(markdown);

  return (
    <div className="space-y-6">
      {blocks.map((block, index) => {
        if (block.kind === 'heading') {
          if (block.level === 3) {
            return (
              <h3 key={`h3-${index}`} className="text-lg font-bold text-white tracking-tight">
                {block.text}
              </h3>
            );
          }

          return (
            <h2 key={`h2-${index}`} className="text-xl font-black text-white tracking-tight">
              {block.text}
            </h2>
          );
        }

        if (block.kind === 'list') {
          return (
            <ul key={`ul-${index}`} className="list-disc pl-5 space-y-2 text-sm text-slate-300 leading-relaxed">
              {block.items.map((item, itemIndex) => (
                <li key={`li-${index}-${itemIndex}`}>{item}</li>
              ))}
            </ul>
          );
        }

        return (
          <p key={`p-${index}`} className="text-sm text-slate-300 leading-relaxed">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}
