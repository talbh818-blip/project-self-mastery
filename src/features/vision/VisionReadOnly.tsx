// ============================================================================
// VisionReadOnly — render a Tiptap vision document as READ-ONLY React.
// ----------------------------------------------------------------------------
// Used by the "look back" panel so past visions read like they were written:
// real paragraph breaks, BOLD (and italic / underline / highlight) marks,
// numbered (ordered) lists with their digits — not flattened plain text.
//
// A self-contained walker (no editor instance, no HTML generation) so a handful
// of read-only memories stay cheap. Styling is inline Tailwind — it touches no
// CSS file. Only the node types the vision editor can produce are handled; an
// unknown node falls back to its inline text.
// ============================================================================
import { Fragment, type ReactNode } from 'react';

type PMNode = {
  type?: string;
  text?: string;
  marks?: { type?: string; attrs?: Record<string, unknown> }[];
  attrs?: Record<string, unknown>;
  content?: PMNode[];
};

export function VisionReadOnly({ content }: { content: unknown }) {
  const doc = content as PMNode | null;
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.content)) return null;
  return (
    <div className="text-[0.9rem] text-ink-100 leading-snug">
      {doc.content.map((n, i) => renderBlock(n, i, i === 0))}
    </div>
  );
}

// Top margin per block. Consecutive lines (single-Enter paragraphs) sit TIGHT
// (no extra margin — the line-height alone separates them); headings / lists
// get a clear gap before them. Real paragraph breaks (double-Enter) come from
// the taller empty-line spacer below.
function blockGap(type: string | undefined): string {
  switch (type) {
    case 'heading':
    case 'bulletList':
    case 'orderedList':
    case 'taskList':
    case 'visionQuestion':
      return 'mt-3';
    default:
      return '';
  }
}

function renderBlock(node: PMNode, key: number, first: boolean): ReactNode {
  const gap = first ? '' : blockGap(node.type);

  switch (node.type) {
    case 'paragraph': {
      const inner = renderInline(node.content);
      // An empty paragraph (a deliberate double-Enter) → a clear, roomy gap so
      // the writer's paragraph breaks stand out from the tight in-stanza lines.
      if (inner.length === 0) return <div key={key} aria-hidden className="h-4" />;
      return (
        <p key={key} className={gap}>
          {inner}
        </p>
      );
    }
    case 'heading': {
      const level = (node.attrs?.level as number) ?? 1;
      const size = level === 1 ? 'text-[1.05rem]' : 'text-[0.98rem]';
      return (
        <p key={key} className={`${gap} ${size} font-bold text-ink-100`}>
          {renderInline(node.content)}
        </p>
      );
    }
    case 'bulletList':
      return (
        <ul key={key} className={`${gap} list-disc ps-5 space-y-1.5 marker:text-ink-300`}>
          {(node.content ?? []).map((li, i) => (
            <li key={i}>{renderItemContent(li)}</li>
          ))}
        </ul>
      );
    case 'orderedList':
      return (
        <ol
          key={key}
          start={(node.attrs?.start as number) ?? 1}
          className={`${gap} list-decimal ps-5 space-y-2 marker:text-ink-300 marker:font-semibold`}
        >
          {(node.content ?? []).map((li, i) => (
            <li key={i}>{renderItemContent(li)}</li>
          ))}
        </ol>
      );
    case 'taskList':
      return (
        <ul key={key} className={`${gap} space-y-1.5`}>
          {(node.content ?? []).map((li, i) => {
            const checked = li.attrs?.checked === true;
            return (
              <li key={i} className="flex items-start gap-2">
                <span
                  className={`mt-0.5 shrink-0 inline-flex h-4 w-4 items-center justify-center rounded-[4px] border text-[10px] ${
                    checked
                      ? 'bg-forest-700 border-forest-700 text-on-accent'
                      : 'border-surface-border text-transparent'
                  }`}
                >
                  ✓
                </span>
                <div className={checked ? 'line-through text-ink-300' : ''}>
                  {renderItemContent(li)}
                </div>
              </li>
            );
          })}
        </ul>
      );
    case 'visionQuestion':
      return (
        <p key={key} className={`${gap} font-semibold text-ink-100`}>
          {typeof node.attrs?.text === 'string' ? node.attrs.text : ''}
        </p>
      );
    case 'visionImage':
      return (
        <p key={key} className={`${first ? '' : 'mt-1'} text-ink-300 text-[0.85rem]`}>
          🖼️ תמונה
        </p>
      );
    default:
      return Array.isArray(node.content) ? (
        <p key={key} className={gap}>
          {renderInline(node.content)}
        </p>
      ) : null;
  }
}

// A list item holds block content (usually one or more paragraphs).
function renderItemContent(li: PMNode): ReactNode {
  const blocks = Array.isArray(li.content) ? li.content : [];
  return blocks.map((b, i) => renderBlock(b, i, i === 0));
}

function renderInline(content: PMNode[] | undefined): ReactNode[] {
  if (!Array.isArray(content)) return [];
  const out: ReactNode[] = [];
  content.forEach((n, i) => {
    if (n.type === 'hardBreak') {
      out.push(<br key={i} />);
      return;
    }
    if (n.type === 'text' && typeof n.text === 'string') {
      let el: ReactNode = n.text;
      for (const m of n.marks ?? []) {
        if (m.type === 'bold') el = <strong className="font-bold text-ink-100">{el}</strong>;
        else if (m.type === 'italic') el = <em>{el}</em>;
        else if (m.type === 'underline') el = <u>{el}</u>;
        else if (m.type === 'strike') el = <s>{el}</s>;
        else if (m.type === 'highlight') {
          const color = (m.attrs?.color as string) ?? '#fde68a';
          el = (
            <mark
              style={{
                backgroundColor: color,
                color: '#0d1117',
                padding: '0 0.1em',
                borderRadius: 2,
              }}
            >
              {el}
            </mark>
          );
        }
      }
      out.push(<Fragment key={i}>{el}</Fragment>);
      return;
    }
    if (Array.isArray(n.content)) {
      out.push(<Fragment key={i}>{renderInline(n.content)}</Fragment>);
    }
  });
  return out;
}
