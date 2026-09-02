import { formatReport, ingestPack } from '../content/ingest';
import { loadArtwork } from '../content/artwork';
import { addPackCategory, allCategories, findCategory, findSubject } from '../game/library';
import { loadProgress, loadSettings, saveSettings, type Settings } from '../game/persistence';
import { button, clear, el } from './dom';
import { puzzleScreen } from './puzzleScreen';
import { categoryFlash, introSplash, type Dismissable } from './intro';
import { howToPlayContent } from './howToPlay';
import { prefersReducedMotion } from '../game/persistence';

type Route =
  | { name: 'home' }
  | { name: 'category'; categoryId: string }
  | { name: 'puzzle'; categoryId: string; subjectId: string }
  | { name: 'journal' }
  | { name: 'packs' }
  | { name: 'settings' }
  | { name: 'how' };

/**
 * Screen router and shell.
 *
 * A plain stack of screens rather than a framework: the game is one canvas plus
 * a handful of lists, and every dependency here is one more thing to keep
 * working on a mid-range phone.
 */
export class App {
  private root: HTMLElement;
  private history: Route[] = [{ name: 'home' }];
  private teardown: (() => void) | null = null;
  /** The splash or flash card currently over the top of everything. */
  private overlay: Dismissable | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.render();

    // The title card sits over the home screen rather than replacing it, so the
    // game is already built and interactive the instant it clears.
    const settings = loadSettings();
    this.showOverlay(
      introSplash(prefersReducedMotion(settings), () => {
        this.clearOverlay();
        // First run ever: show the instructions rather than leaving someone to
        // work out a colour-sorting game from a list of category names.
        if (!settings.seenHowToPlay) {
          saveSettings({ ...settings, seenHowToPlay: true });
          this.navigate({ name: 'how' });
        }
      }),
    );
  }

  private showOverlay(overlay: Dismissable): void {
    this.overlay?.destroy();
    this.overlay = overlay;
    this.root.appendChild(overlay.element);
  }

  private clearOverlay(): void {
    this.overlay?.element.remove();
    this.overlay = null;
  }

  private get route(): Route {
    return this.history[this.history.length - 1] as Route;
  }

  navigate(route: Route): void {
    this.history.push(route);
    this.render();

    // Only on the way in. Flashing the same card again on every Back would turn
    // a piece of punctuation into a toll gate.
    if (route.name === 'category') {
      const category = findCategory(route.categoryId);
      if (category) {
        this.showOverlay(
          categoryFlash(
            category.title,
            category.blurb,
            prefersReducedMotion(loadSettings()),
            () => this.clearOverlay(),
          ),
        );
      }
    }
  }

  goBack(): void {
    if (this.history.length > 1) this.history.pop();
    this.render();
  }

  goHome(): void {
    this.history = [{ name: 'home' }];
    this.render();
  }

  openSubject(categoryId: string, subjectId: string): void {
    // Replace rather than stack, so "next puzzle" repeated a dozen times does
    // not bury the category screen a dozen entries deep.
    if (this.route.name === 'puzzle') this.history.pop();
    this.navigate({ name: 'puzzle', categoryId, subjectId });
  }

  refreshProgress(): void {
    // Progress is read fresh on each render; nothing cached to invalidate.
  }

  /** Re-render when new categories arrive, e.g. baked packs finishing loading. */
  contentChanged(): void {
    if (this.route.name === 'home') this.render();
  }

  private render(): void {
    this.teardown?.();
    this.teardown = null;
    // Clearing the root takes any overlay with it; drop the reference so a
    // timer still in flight cannot try to remove a node twice.
    this.overlay = null;
    clear(this.root);

    const route = this.route;
    switch (route.name) {
      case 'home':
        this.root.appendChild(this.homeScreen());
        break;
      case 'category':
        this.root.appendChild(this.categoryScreen(route.categoryId));
        break;
      case 'puzzle': {
        const found = findSubject(route.categoryId, route.subjectId);
        if (!found) {
          this.goHome();
          return;
        }
        const screen = puzzleScreen(this, found.category, found.subject, found.index);
        this.teardown = screen.destroy;
        this.root.appendChild(screen.element);
        break;
      }
      case 'journal':
        this.root.appendChild(this.journalScreen());
        break;
      case 'packs':
        this.root.appendChild(this.packsScreen());
        break;
      case 'how':
        this.root.appendChild(
          el('section', {
            class: 'screen screen-list',
            children: [this.subHeader('How to play'), howToPlayContent()],
          }),
        );
        break;
      case 'settings':
        this.root.appendChild(this.settingsScreen());
        break;
    }
  }

  // ----------------------------------------------------------------- home

  private homeScreen(): HTMLElement {
    const progress = loadProgress();
    const categories = allCategories();

    const cards = categories.map((category, categoryIndex) => {
      const solved = category.subjects.filter((s) => progress.solved[s.id]).length;
      const cover = category.subjects.find(
        (subject) => progress.solved[subject.id] && subject.artwork.kind === 'url',
      );
      return el('button', {
        class: 'card category-card',
        attrs: { type: 'button' },
        on: {
          click: (() => this.navigate({ name: 'category', categoryId: category.id })) as never,
        },
        children: [
          el('div', {
            class: 'category-illumination',
            attrs: { 'aria-hidden': 'true' },
            children: [
              cover?.artwork.kind === 'url'
                ? el('img', {
                    class: 'category-image',
                    attrs: { src: cover.artwork.url, alt: '', loading: 'lazy' },
                  })
                : null,
              el('span', { class: 'category-rose' }),
            ],
          }),
          el('div', {
            class: 'card-body',
            children: [
              el('span', {
                class: 'card-kicker',
                text: category.fromPack ? 'Visiting archive' : `Archive ${roman(categoryIndex + 1)}`,
              }),
              el('h2', { class: 'card-title', text: category.title }),
              category.blurb ? el('p', { class: 'card-blurb', text: category.blurb }) : null,
              el('p', {
                class: 'card-meta',
                text: `${solved} of ${category.subjects.length} revealed`,
              }),
            ],
          }),
          el('span', { class: 'category-arrow', attrs: { 'aria-hidden': 'true' }, text: '†' }),
        ],
      });
    });

    return el('section', {
      class: 'screen screen-home',
      children: [
        el('header', {
          class: 'home-header',
          children: [
            el('div', {
              class: 'rose-window',
              attrs: { 'aria-hidden': 'true' },
              children: [
                el('span', { class: 'rose-core' }),
                el('span', { class: 'rose-ring rose-ring-one' }),
                el('span', { class: 'rose-ring rose-ring-two' }),
              ],
            }),
            el('p', { class: 'brand-kicker', text: 'The Chromatic Reliquary' }),
            el('h1', { class: 'logo', text: 'Color Blend' }),
            el('p', {
              class: 'tagline',
              text: 'Order the living shades. Unseal the image. Keep what it remembers.',
            }),
            el('div', { class: 'ornament-rule', attrs: { 'aria-hidden': 'true' } }),
          ],
        }),
        el('div', { class: 'card-list', children: cards }),
        el('nav', {
          class: 'home-nav',
          children: [
            button('How to play', () => this.navigate({ name: 'how' })),
            button('Journal', () => this.navigate({ name: 'journal' })),
            button('Load a pack', () => this.navigate({ name: 'packs' })),
            button('Settings', () => this.navigate({ name: 'settings' })),
          ],
        }),
      ],
    });
  }

  // ------------------------------------------------------------- category

  private categoryScreen(categoryId: string): HTMLElement {
    const category = findCategory(categoryId);
    if (!category) return this.homeScreen();

    const progress = loadProgress();

    const cards = category.subjects.map((subject, index) => {
      const solved = progress.solved[subject.id];
      const facts = progress.facts[subject.id]?.length ?? 0;
      const totalFacts = Math.min(subject.facts.length, 5);

      return el('button', {
        class: `card subject-card${solved ? ' subject-card-solved' : ''}`,
        attrs: { type: 'button' },
        on: {
          click: (() => this.navigate({ name: 'puzzle', categoryId, subjectId: subject.id })) as never,
        },
        children: [
          solved && subject.artwork.kind === 'url'
            ? el('div', {
                class: 'subject-portrait',
                attrs: { 'aria-hidden': 'true' },
                children: [
                  el('img', {
                    attrs: { src: subject.artwork.url, alt: '', loading: 'lazy' },
                  }),
                ],
              })
            : el('div', {
                class: 'subject-portrait subject-portrait-sealed',
                attrs: { 'aria-hidden': 'true' },
                text: '✦',
              }),
          el('div', {
            class: 'card-body',
            children: [
              el('span', { class: 'card-kicker', text: `Folio ${roman(index + 1)}` }),
              el('h2', { class: 'card-title', text: subject.title }),
              // Blurbs give away nothing about the picture, only the subject.
              subject.blurb ? el('p', { class: 'card-blurb', text: subject.blurb }) : null,
              el('p', {
                class: 'card-meta',
                text: solved
                  ? `Revealed · best ${solved.moves} moves${totalFacts ? ` · ${facts}/${totalFacts} facts` : ''}`
                  : `Puzzle ${index + 1}${totalFacts ? ` · ${totalFacts} facts hidden` : ''}`,
              }),
            ],
          }),
          solved
            ? el('span', { class: 'chip chip-done', text: 'Revealed' })
            : el('span', { class: 'subject-seal', attrs: { 'aria-hidden': 'true' }, text: '✦' }),
        ],
      });
    });

    return el('section', {
      class: 'screen screen-list',
      children: [
        this.subHeader(category.title, category.blurb),
        el('p', { class: 'list-intro', text: 'Choose a sealed folio and restore its order of light.' }),
        el('div', { class: 'card-list', children: cards }),
      ],
    });
  }

  // -------------------------------------------------------------- journal

  private journalScreen(): HTMLElement {
    const progress = loadProgress();
    const sections: HTMLElement[] = [];

    for (const category of allCategories()) {
      const entries = category.subjects
        .map((subject) => ({ subject, found: progress.facts[subject.id] ?? [] }))
        .filter((e) => e.found.length > 0);
      if (entries.length === 0) continue;

      sections.push(
        el('div', {
          class: 'journal-category',
          children: [
            el('h2', { class: 'journal-category-title', text: category.title }),
            ...entries.map((entry) =>
              el('div', {
                class: 'journal-subject',
                children: [
                  el('h3', { class: 'journal-subject-title', text: entry.subject.title }),
                  el('ul', {
                    class: 'journal-facts',
                    children: entry.found.map((i) =>
                      el('li', { text: entry.subject.facts[i] ?? '' }),
                    ),
                  }),
                ],
              }),
            ),
          ],
        }),
      );
    }

    return el('section', {
      class: 'screen screen-list',
      children: [
        this.subHeader('Journal', 'Everything you have uncovered so far.'),
        sections.length > 0
          ? el('div', { class: 'journal', children: sections })
          : el('p', {
              class: 'empty',
              text: 'Nothing yet. Facts appear here as you place the tiles that hide them.',
            }),
      ],
    });
  }

  // ---------------------------------------------------------------- packs

  private packsScreen(): HTMLElement {
    const status = el('p', { class: 'pack-status', text: '' });
    const reportBox = el('pre', { class: 'pack-report', attrs: { hidden: 'hidden' } });

    const input = el('input', {
      class: 'pack-input',
      attrs: { type: 'file', accept: '.zip,application/zip', id: 'pack-file' },
    });

    const handle = async (file: File) => {
      status.textContent = `Opening ${file.name}…`;
      reportBox.hidden = true;

      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const { category, report } = await ingestPack(bytes, {
          packName: file.name,
          // Decoding through a canvas keeps this identical to how the artwork
          // will actually be sampled at play time.
          decode: async (imageBytes, mime) => {
            const artwork = await loadArtwork({ kind: 'bytes', bytes: imageBytes, mime });
            return artwork.pixels;
          },
        });

        reportBox.textContent = formatReport(report);
        reportBox.hidden = false;

        if (category) {
          addPackCategory(category);
          status.textContent = `Loaded ${report.accepted} puzzle${report.accepted === 1 ? '' : 's'} from ${file.name}.`;
          status.appendChild(el('br'));
          status.appendChild(
            button(
              `Play ${category.title}`,
              () => this.navigate({ name: 'category', categoryId: category.id }),
              'button button-primary',
            ),
          );
        } else {
          status.textContent = `Nothing playable in ${file.name}. See the report below.`;
        }
      } catch (error) {
        status.textContent = `Could not read ${file.name}: ${(error as Error).message}`;
      }
    };

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) void handle(file);
    });

    const drop = el('label', {
      class: 'dropzone',
      attrs: { for: 'pack-file' },
      children: [
        el('strong', { text: 'Drop a pack here' }),
        el('span', { text: 'or tap to choose a .zip' }),
      ],
    });

    drop.addEventListener('dragover', (event) => {
      event.preventDefault();
      drop.classList.add('dropzone-over');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('dropzone-over'));
    drop.addEventListener('drop', (event) => {
      event.preventDefault();
      drop.classList.remove('dropzone-over');
      const file = event.dataTransfer?.files?.[0];
      if (file) void handle(file);
    });

    return el('section', {
      class: 'screen screen-list',
      children: [
        this.subHeader('Load a pack', 'A zip of images becomes a set of puzzles.'),
        drop,
        input,
        status,
        reportBox,
        el('details', {
          class: 'pack-help',
          children: [
            el('summary', { text: 'What goes in a pack?' }),
            el('p', {
              text: 'Any zip of images works on its own — titles come from the filenames. Add a pack.json to give each image a subject name and its facts, and to choose a board shape.',
            }),
            el('pre', {
              class: 'pack-example',
              text: EXAMPLE_MANIFEST,
            }),
          ],
        }),
      ],
    });
  }

  // ------------------------------------------------------------- settings

  private settingsScreen(): HTMLElement {
    const settings = loadSettings();

    const toggle = (
      label: string,
      description: string,
      value: boolean,
      onChange: (next: boolean) => void,
    ) => {
      const input = el('input', { attrs: { type: 'checkbox' } });
      input.checked = value;
      input.addEventListener('change', () => onChange(input.checked));
      return el('label', {
        class: 'setting',
        children: [
          input,
          el('span', {
            class: 'setting-text',
            children: [
              el('strong', { text: label }),
              el('span', { class: 'setting-desc', text: description }),
            ],
          }),
        ],
      });
    };

    const update = (patch: Partial<Settings>) => saveSettings({ ...loadSettings(), ...patch });

    return el('section', {
      class: 'screen screen-list',
      children: [
        this.subHeader('Settings'),
        toggle(
          'Lightness assist',
          'Draw a small bar on each tile showing how light it is. The puzzle is an ordering task, and lightness ordering survives color blindness.',
          settings.lightnessAssist,
          (next) => update({ lightnessAssist: next }),
        ),
        toggle(
          'Reduce motion',
          'Shorten the reveal animation. Follows your system setting unless you turn this on.',
          settings.reducedMotion === true,
          (next) => update({ reducedMotion: next ? true : null }),
        ),
      ],
    });
  }

  // --------------------------------------------------------------- shared

  private subHeader(title: string, blurb?: string): HTMLElement {
    return el('header', {
      class: 'sub-header',
      children: [
        button('←', () => this.goBack(), 'button button-icon'),
        el('div', {
          class: 'sub-heading-copy',
          children: [
            el('span', { class: 'sub-kicker', text: 'Color Blend Archive' }),
            el('h1', { class: 'sub-title', text: title }),
            blurb ? el('p', { class: 'sub-blurb', text: blurb }) : null,
          ],
        }),
      ],
    });
  }
}

function roman(value: number): string {
  const numerals: [number, string][] = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let rest = value;
  let result = '';
  for (const [amount, glyph] of numerals) {
    while (rest >= amount) {
      result += glyph;
      rest -= amount;
    }
  }
  return result;
}

const EXAMPLE_MANIFEST = `{
  "schemaVersion": 1,
  "category": { "id": "biomes", "title": "The World's Biomes" },
  "subjects": [
    {
      "image": "images/kelp-forest.jpg",
      "title": "Kelp Forest",
      "difficulty": "medium",
      "shape": "circle",
      "facts": ["Giant kelp can grow 60 cm in a single day."]
    }
  ]
}`;
