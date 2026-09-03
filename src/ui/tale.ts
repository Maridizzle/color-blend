import { el } from './dom';

/**
 * Rendering the Archivist's tale.
 *
 * The story is written in Markdown-ish prose with `*emphasis*`, and nothing in
 * this game ever parses HTML from content. So emphasis is handled here, by
 * splitting the text and building `em` nodes -- never by innerHTML.
 */

/** Text with `*emphasis*` markers, as text and `em` nodes. */
export function inline(text: string): Node[] {
  const nodes: Node[] = [];
  const marker = /\*([^*]+)\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(text))) {
    if (match.index > last) nodes.push(document.createTextNode(text.slice(last, match.index)));
    nodes.push(el('em', { text: match[1] ?? '' }));
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(document.createTextNode(text.slice(last)));
  return nodes;
}

export function paragraph(text: string, className?: string): HTMLParagraphElement {
  return el('p', { class: className, children: inline(text) });
}

/** One passage of the tale: paragraphs behind a rule, with a cite naming its folio. */
export function talePassage(options: {
  paragraphs: readonly string[];
  cite?: string;
  opening?: boolean;
}): HTMLElement {
  return el('div', {
    class: `tale-passage${options.opening ? ' tale-opening' : ''}`,
    children: [
      ...options.paragraphs.map((text) => paragraph(text)),
      options.cite ? el('cite', { text: options.cite }) : null,
    ],
  });
}
