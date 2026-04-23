import homeMarkdown from '../../docs/wiki/Home.md?raw';
import gettingStartedMarkdown from '../../docs/wiki/Getting-Started.md?raw';
import workspaceMarkdown from '../../docs/wiki/Workspace-and-Modes.md?raw';
import drawingMarkdown from '../../docs/wiki/Drawing-and-Selection.md?raw';
import layersMarkdown from '../../docs/wiki/Layers-Frames-and-Animation.md?raw';
import tilesetsMarkdown from '../../docs/wiki/Tilesets-and-Tilemaps.md?raw';
import colorMarkdown from '../../docs/wiki/Color-Palette-and-Import.md?raw';
import exportMarkdown from '../../docs/wiki/Export-Persistence-and-Preferences.md?raw';
import shortcutsMarkdown from '../../docs/wiki/Keyboard-Shortcuts-and-Commands.md?raw';
import dataModelMarkdown from '../../docs/wiki/Data-Model-and-Project-Format.md?raw';
import faqMarkdown from '../../docs/wiki/FAQ-and-Troubleshooting.md?raw';
import whatsNewMarkdown from '../../docs/wiki/Whats-New.md?raw';

export interface WikiPageMeta {
  slug: string;
  title: string;
  group: 'start' | 'guide' | 'reference' | 'support';
  summary: string;
  markdown: string;
  estimatedMinutes: number;
}

const WORDS_PER_MINUTE = 220;

function estimateReadingMinutes(markdown: string): number {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

type WikiPageInput = Omit<WikiPageMeta, 'estimatedMinutes'>;

const PAGE_INPUTS: WikiPageInput[] = [
  {
    slug: '',
    title: 'Home',
    group: 'start',
    summary: 'Welcome to Tile Studio — a browser-based pixel-art, tileset, and animation editor.',
    markdown: homeMarkdown,
  },
  {
    slug: 'getting-started',
    title: 'Getting Started',
    group: 'start',
    summary: 'First-session onboarding for drawing, animation, and tile workflows.',
    markdown: gettingStartedMarkdown,
  },
  {
    slug: 'workspace-and-modes',
    title: 'Workspace and Modes',
    group: 'guide',
    summary: 'Layout tour, editor modes, navigation, and sprite-level operations.',
    markdown: workspaceMarkdown,
  },
  {
    slug: 'drawing-and-selection',
    title: 'Drawing and Selection',
    group: 'guide',
    summary: 'Tool behavior, brush options, selections, slices, and guides.',
    markdown: drawingMarkdown,
  },
  {
    slug: 'layers-frames-and-animation',
    title: 'Layers, Frames, and Animation',
    group: 'guide',
    summary: 'Layer types, timeline workflows, onion skin, tags, and history.',
    markdown: layersMarkdown,
  },
  {
    slug: 'tilesets-and-tilemaps',
    title: 'Tilesets and Tilemaps',
    group: 'guide',
    summary: 'Tile authoring, tilemap painting, region ops, and map-ready workflows.',
    markdown: tilesetsMarkdown,
  },
  {
    slug: 'color-palette-and-import',
    title: 'Color, Palette, and Import Workflows',
    group: 'guide',
    summary: 'Palette control, quantization, and art import pipelines.',
    markdown: colorMarkdown,
  },
  {
    slug: 'export-persistence-and-preferences',
    title: 'Export, Persistence, and Preferences',
    group: 'guide',
    summary: 'Export modes, project saving, autosave, and user settings.',
    markdown: exportMarkdown,
  },
  {
    slug: 'keyboard-shortcuts-and-commands',
    title: 'Keyboard Shortcuts and Commands',
    group: 'reference',
    summary: 'Default bindings, command palette behavior, and rebinding rules.',
    markdown: shortcutsMarkdown,
  },
  {
    slug: 'data-model-and-project-format',
    title: 'Data Model and Project Format',
    group: 'reference',
    summary: 'Internal document structure, tile encoding, and persistence details.',
    markdown: dataModelMarkdown,
  },
  {
    slug: 'faq-and-troubleshooting',
    title: 'FAQ and Troubleshooting',
    group: 'support',
    summary: 'Common questions, first-session pitfalls, and fixes for frequent issues.',
    markdown: faqMarkdown,
  },
  {
    slug: 'whats-new',
    title: "What's New",
    group: 'support',
    summary: 'Release notes, numbered feature waves, and planned directions.',
    markdown: whatsNewMarkdown,
  },
];

export const WIKI_PAGES: WikiPageMeta[] = PAGE_INPUTS.map((page) => ({
  ...page,
  estimatedMinutes: estimateReadingMinutes(page.markdown),
}));

export const WIKI_GROUPS: Array<{ key: WikiPageMeta['group']; label: string; blurb: string }> = [
  { key: 'start', label: 'Start Here', blurb: 'Orientation and first-session flows.' },
  { key: 'guide', label: 'Guides', blurb: 'Deep dives into each workflow area.' },
  { key: 'reference', label: 'Reference', blurb: 'Lookup material for shortcuts and internals.' },
  { key: 'support', label: 'Support', blurb: 'Troubleshooting and release history.' },
];

export const WIKI_PAGE_BY_SLUG = new Map(WIKI_PAGES.map((page) => [page.slug, page]));

export function wikiHref(slug: string): string {
  return slug ? `/wiki/${slug}` : '/wiki';
}

export function wikiPageFromHref(href: string): WikiPageMeta | null {
  const [pathname] = href.split('#');
  if (!pathname.endsWith('.md')) return null;
  const filename = pathname.split('/').pop();
  if (!filename) return null;
  const slug = filename === 'Home.md'
    ? ''
    : filename.replace(/\.md$/, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
  return WIKI_PAGE_BY_SLUG.get(slug) ?? null;
}

export function wikiGroupLabel(group: WikiPageMeta['group']): string {
  switch (group) {
    case 'start': return 'Onboarding';
    case 'guide': return 'Guide';
    case 'reference': return 'Reference';
    case 'support': return 'Support';
  }
}

export interface WikiNeighbors {
  previous: WikiPageMeta | null;
  next: WikiPageMeta | null;
}

export function wikiNeighbors(slug: string): WikiNeighbors {
  const index = WIKI_PAGES.findIndex((p) => p.slug === slug);
  if (index === -1) return { previous: null, next: null };
  return {
    previous: index > 0 ? WIKI_PAGES[index - 1] : null,
    next: index < WIKI_PAGES.length - 1 ? WIKI_PAGES[index + 1] : null,
  };
}
