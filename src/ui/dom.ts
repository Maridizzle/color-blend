/** Minimal element helper. Text is always set as textContent, never as HTML. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: {
    class?: string;
    text?: string;
    attrs?: Record<string, string>;
    on?: Partial<Record<keyof HTMLElementEventMap, (event: never) => void>>;
    children?: (Node | null | undefined | false)[];
  } = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.class) node.className = options.class;
  // textContent rather than innerHTML throughout: pack titles and fact strings
  // come from zips written by other people and must never be parsed as markup.
  if (options.text !== undefined) node.textContent = options.text;
  for (const [key, value] of Object.entries(options.attrs ?? {})) {
    node.setAttribute(key, value);
  }
  for (const [event, handler] of Object.entries(options.on ?? {})) {
    node.addEventListener(event, handler as EventListener);
  }
  for (const child of options.children ?? []) {
    if (child) node.appendChild(child);
  }
  return node;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function button(
  label: string,
  onClick: () => void,
  className = 'button',
): HTMLButtonElement {
  return el('button', {
    class: className,
    text: label,
    attrs: { type: 'button' },
    on: { click: onClick as (event: never) => void },
  });
}
