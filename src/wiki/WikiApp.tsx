import { useMemo, useState } from 'react';
import type { AnchorHTMLAttributes, ChangeEvent, ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronLeft,
  Clock,
  ExternalLink,
  FileText,
  HelpCircle,
  Layers,
  LifeBuoy,
  Map as MapIcon,
  Palette,
  Play,
  Search,
  Sparkles,
  Wrench,
} from 'lucide-react';
import './wiki.css';
import {
  WIKI_GROUPS,
  WIKI_PAGE_BY_SLUG,
  WIKI_PAGES,
  type WikiPageMeta,
  wikiGroupLabel,
  wikiHref,
  wikiNeighbors,
  wikiPageFromHref,
} from './content';

interface HeadingItem {
  id: string;
  title: string;
  level: 2 | 3;
}

export function WikiApp() {
  const { slug } = useParams();
  const location = useLocation();
  const page = WIKI_PAGE_BY_SLUG.get(slug ?? '') ?? null;
  const headings = useMemo(() => (page ? extractHeadings(page.markdown) : []), [page]);
  const neighbors = useMemo(() => (page ? wikiNeighbors(page.slug) : { previous: null, next: null }), [page]);
  const [query, setQuery] = useState('');
  const filteredPages = useMemo(() => filterPages(WIKI_PAGES, query), [query]);

  if (!page) return <Navigate to="/wiki" replace />;

  const isHome = page.slug === '';

  return (
    <div className="wiki-shell min-h-screen text-slate-100" data-testid="wiki-shell">
      <div className="wiki-grid mx-auto max-w-[1600px]">
        <aside className="wiki-sidebar border-r border-white/10">
          <div className="wiki-brand border-b border-white/10">
            <Link to="/wiki" className="wiki-brand-link" aria-label="Tile Studio Wiki home">
              <span className="wiki-brand-mark" aria-hidden="true" />
              <span>
                <span className="wiki-brand-title">Tile Studio</span>
                <span className="wiki-brand-subtitle">Product handbook</span>
              </span>
            </Link>
            <Link to="/" className="wiki-editor-link" data-testid="wiki-back-editor">
              <ChevronLeft size={14} />
              <span>Back to Editor</span>
            </Link>
          </div>

          <div className="wiki-sidebar-content">
            <label className="wiki-search">
              <Search size={14} aria-hidden="true" />
              <input
                type="search"
                placeholder="Filter pages"
                value={query}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
                aria-label="Filter documentation pages"
              />
            </label>

            {WIKI_GROUPS.map((group) => {
              const pagesInGroup = filteredPages.filter((pageMeta) => pageMeta.group === group.key);
              if (pagesInGroup.length === 0) return null;
              return (
                <section key={group.key} className="wiki-nav-group">
                  <div className="wiki-nav-group-title">{group.label}</div>
                  <nav className="wiki-nav-list">
                    {pagesInGroup.map((pageMeta) => (
                      <Link
                        key={pageMeta.slug || 'home'}
                        to={wikiHref(pageMeta.slug)}
                        className={clsx('wiki-nav-link', pageMeta.slug === page.slug && 'is-active')}
                        aria-current={pageMeta.slug === page.slug ? 'page' : undefined}
                      >
                        <span className="wiki-nav-icon">{iconForPage(pageMeta)}</span>
                        <span className="wiki-nav-copy">
                          <span className="wiki-nav-label">{pageMeta.title}</span>
                          <span className="wiki-nav-summary">{pageMeta.summary}</span>
                        </span>
                      </Link>
                    ))}
                  </nav>
                </section>
              );
            })}

            {filteredPages.length === 0 && (
              <p className="wiki-nav-empty">No pages match "{query}".</p>
            )}
          </div>
        </aside>

        <main className="wiki-main">
          {isHome ? (
            <HomeLanding page={page} />
          ) : (
            <ArticleView page={page} headings={headings} neighbors={neighbors} pathname={location.pathname} />
          )}
        </main>
      </div>
    </div>
  );
}

function ArticleView({
  page,
  headings,
  neighbors,
  pathname,
}: {
  page: WikiPageMeta;
  headings: HeadingItem[];
  neighbors: { previous: WikiPageMeta | null; next: WikiPageMeta | null };
  pathname: string;
}) {
  return (
    <>
      <header className="wiki-header border-b border-white/10">
        <div className="wiki-header-main">
          <nav className="wiki-breadcrumbs" aria-label="Breadcrumb">
            <Link to="/wiki">Wiki</Link>
            <span aria-hidden="true">/</span>
            <span>{wikiGroupLabel(page.group)}</span>
            <span aria-hidden="true">/</span>
            <span className="is-current">{page.title}</span>
          </nav>
          <p className="wiki-eyebrow">{wikiGroupLabel(page.group)}</p>
          <h1 className="wiki-header-title" data-testid="wiki-page-title">{page.title}</h1>
          <p className="wiki-header-summary">{page.summary}</p>
          <div className="wiki-header-badges">
            <span className="wiki-badge">
              <Clock size={12} aria-hidden="true" />
              <span>{page.estimatedMinutes} min read</span>
            </span>
            <span className="wiki-badge wiki-badge-muted" title={pathname}>{pathname}</span>
          </div>
        </div>
      </header>

      <div className="wiki-content-layout">
        <article className="wiki-article" data-testid="wiki-article">
          <ReactMarkdown components={markdownComponents(page)}>{page.markdown}</ReactMarkdown>

          <PageNav neighbors={neighbors} />
        </article>

        <aside className="wiki-toc border-l border-white/10">
          <div className="wiki-toc-card">
            <div className="wiki-toc-title">On This Page</div>
            {headings.length === 0 ? (
              <p className="wiki-toc-empty">This page does not expose a heading outline yet.</p>
            ) : (
              <nav className="wiki-toc-list">
                {headings.map((heading) => (
                  <a
                    key={heading.id}
                    href={`#${heading.id}`}
                    className={clsx('wiki-toc-link', heading.level === 3 && 'is-nested')}
                  >
                    {heading.title}
                  </a>
                ))}
              </nav>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

function PageNav({ neighbors }: { neighbors: { previous: WikiPageMeta | null; next: WikiPageMeta | null } }) {
  if (!neighbors.previous && !neighbors.next) return null;
  return (
    <nav className="wiki-page-nav" aria-label="Page navigation">
      {neighbors.previous ? (
        <Link to={wikiHref(neighbors.previous.slug)} className="wiki-page-nav-link is-prev">
          <span className="wiki-page-nav-direction">
            <ArrowLeft size={14} aria-hidden="true" />
            <span>Previous</span>
          </span>
          <span className="wiki-page-nav-title">{neighbors.previous.title}</span>
        </Link>
      ) : (
        <span />
      )}
      {neighbors.next ? (
        <Link to={wikiHref(neighbors.next.slug)} className="wiki-page-nav-link is-next">
          <span className="wiki-page-nav-direction">
            <span>Next</span>
            <ArrowRight size={14} aria-hidden="true" />
          </span>
          <span className="wiki-page-nav-title">{neighbors.next.title}</span>
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

function HomeLanding({ page }: { page: WikiPageMeta }) {
  const gettingStarted = WIKI_PAGE_BY_SLUG.get('getting-started');
  const workspace = WIKI_PAGE_BY_SLUG.get('workspace-and-modes');
  const drawing = WIKI_PAGE_BY_SLUG.get('drawing-and-selection');
  const layers = WIKI_PAGE_BY_SLUG.get('layers-frames-and-animation');
  const tilesets = WIKI_PAGE_BY_SLUG.get('tilesets-and-tilemaps');
  const colorPage = WIKI_PAGE_BY_SLUG.get('color-palette-and-import');
  const exportPage = WIKI_PAGE_BY_SLUG.get('export-persistence-and-preferences');
  const shortcuts = WIKI_PAGE_BY_SLUG.get('keyboard-shortcuts-and-commands');
  const dataModel = WIKI_PAGE_BY_SLUG.get('data-model-and-project-format');
  const faq = WIKI_PAGE_BY_SLUG.get('faq-and-troubleshooting');
  const whatsNew = WIKI_PAGE_BY_SLUG.get('whats-new');

  return (
    <div className="wiki-landing">
      <section className="wiki-hero">
        <p className="wiki-eyebrow">Documentation</p>
        <h1 className="wiki-hero-title" data-testid="wiki-page-title">{page.title}</h1>
        <p className="wiki-hero-summary">
          Tile Studio is a browser-based pixel-art editor that combines raster drawing, tileset
          authoring, and frame animation in one document. This handbook walks you from your first
          stroke to shipping production-ready sprite sheets and tilemaps.
        </p>
        <div className="wiki-hero-actions">
          {gettingStarted && (
            <Link to={wikiHref(gettingStarted.slug)} className="wiki-cta is-primary">
              <Play size={14} aria-hidden="true" />
              <span>Start the tutorial</span>
            </Link>
          )}
          <Link to="/" className="wiki-cta">
            <span>Open the editor</span>
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
          <a
            href="https://github.com/thomazcapra/tile-studio"
            target="_blank"
            rel="noreferrer"
            className="wiki-cta is-ghost"
          >
            <span>GitHub</span>
            <ExternalLink size={13} aria-hidden="true" />
          </a>
        </div>
        <ul className="wiki-hero-meta">
          <li>
            <span>{WIKI_PAGES.length}</span>
            <span>pages</span>
          </li>
          <li>
            <span>183</span>
            <span>e2e tests</span>
          </li>
          <li>
            <span>MIT</span>
            <span>licensed</span>
          </li>
        </ul>
      </section>

      <section className="wiki-section">
        <header className="wiki-section-header">
          <h2>Start here</h2>
          <p>New to Tile Studio? These three pages cover the shortest path to being productive.</p>
        </header>
        <div className="wiki-card-grid is-three">
          {gettingStarted && (
            <WikiCard
              to={wikiHref(gettingStarted.slug)}
              icon={<Sparkles size={18} />}
              title="Getting Started"
              body="Create your first sprite, animation, or tileset in five minutes."
              meta={`${gettingStarted.estimatedMinutes} min read`}
            />
          )}
          {workspace && (
            <WikiCard
              to={wikiHref(workspace.slug)}
              icon={<Layers size={18} />}
              title="Workspace and Modes"
              body="Tour the panels and learn how Raster, Tilemap, and Tile mode differ."
              meta={`${workspace.estimatedMinutes} min read`}
            />
          )}
          {drawing && (
            <WikiCard
              to={wikiHref(drawing.slug)}
              icon={<BookOpen size={18} />}
              title="Drawing and Selection"
              body="Tools, brush options, selections, slices, and custom brushes."
              meta={`${drawing.estimatedMinutes} min read`}
            />
          )}
        </div>
      </section>

      <section className="wiki-section">
        <header className="wiki-section-header">
          <h2>What Tile Studio covers</h2>
          <p>One document, three editing workflows. Pick your focus and jump in.</p>
        </header>
        <div className="wiki-feature-grid">
          <FeatureTile
            icon={<BookOpen size={18} />}
            title="Raster drawing"
            body="Pencil, eraser, fill, line, gradient, and text tools with pixel-perfect mode, symmetry, and custom brushes."
          />
          <FeatureTile
            icon={<Layers size={18} />}
            title="Layers and animation"
            body="Blend modes, groups, reference layers, onion skin, tags, and linked cels for complex frame-based work."
          />
          <FeatureTile
            icon={<MapIcon size={18} />}
            title="Tilesets and tilemaps"
            body="Hand-author tiles or generate from raster art with flip-matched deduplication. Paint tilemaps with flip flags."
          />
          <FeatureTile
            icon={<Palette size={18} />}
            title="Palette control"
            body="Preset palettes, octree quantization with dither, sort by hue or luma, and import or export .gpl / .pal / .hex."
          />
          <FeatureTile
            icon={<FileText size={18} />}
            title="Export everywhere"
            body="PNG, WebP, JPEG, frame sequences, sprite sheets with atlas metadata, animated GIF, and Tiled-ready tileset exports."
          />
          <FeatureTile
            icon={<Wrench size={18} />}
            title="Shortcuts and persistence"
            body="Rebindable shortcuts, a Ctrl+K command palette, IndexedDB autosave, and a .tstudio project format you own."
          />
        </div>
      </section>

      <section className="wiki-section">
        <header className="wiki-section-header">
          <h2>Learning paths</h2>
          <p>Read in sequence based on what you want to build.</p>
        </header>
        <div className="wiki-path-grid">
          <PathCard
            title="Draw sprites"
            steps={[gettingStarted, workspace, drawing, colorPage]}
          />
          <PathCard
            title="Animate characters"
            steps={[gettingStarted, layers, exportPage]}
          />
          <PathCard
            title="Build tilesets and maps"
            steps={[gettingStarted, tilesets, exportPage]}
          />
          <PathCard
            title="Understand the internals"
            steps={[dataModel, tilesets, layers]}
          />
        </div>
      </section>

      <section className="wiki-section">
        <header className="wiki-section-header">
          <h2>Reference and support</h2>
          <p>Keep these pages close while working.</p>
        </header>
        <div className="wiki-card-grid is-four">
          {shortcuts && (
            <WikiCard
              to={wikiHref(shortcuts.slug)}
              icon={<FileText size={18} />}
              title="Shortcuts"
              body="Default bindings, the command palette, and how to rebind."
              meta={`${shortcuts.estimatedMinutes} min read`}
            />
          )}
          {dataModel && (
            <WikiCard
              to={wikiHref(dataModel.slug)}
              icon={<FileText size={18} />}
              title="Data Model"
              body="Document structure, tile encoding, and persistence details."
              meta={`${dataModel.estimatedMinutes} min read`}
            />
          )}
          {faq && (
            <WikiCard
              to={wikiHref(faq.slug)}
              icon={<HelpCircle size={18} />}
              title="FAQ"
              body="Troubleshooting tips and answers to common first-session questions."
              meta={`${faq.estimatedMinutes} min read`}
            />
          )}
          {whatsNew && (
            <WikiCard
              to={wikiHref(whatsNew.slug)}
              icon={<LifeBuoy size={18} />}
              title="What's New"
              body="Release notes and the numbered feature wave history."
              meta={`${whatsNew.estimatedMinutes} min read`}
            />
          )}
        </div>
      </section>

      <section className="wiki-section">
        <header className="wiki-section-header">
          <h2>Core concepts</h2>
          <p>A shared vocabulary for the rest of the documentation.</p>
        </header>
        <dl className="wiki-glossary">
          <ConceptDefinition term="Sprite" body="The whole document. Holds size, palette, frames, layers, tilesets, tags, and slices." />
          <ConceptDefinition term="Layer" body="A stack entry. Tile Studio supports raster, tilemap, group, and reference layers." />
          <ConceptDefinition term="Cel" body="The image data for one layer on one frame. The timeline is a grid of cels." />
          <ConceptDefinition term="Tileset" body="A named collection of tiles that all share a grid size." />
          <ConceptDefinition term="Tilemap" body="A grid of tile words. Each word points to a tile index plus flip flags." />
          <ConceptDefinition term="Tag" body="A named frame range with direction and color, used for playback and metadata." />
          <ConceptDefinition term="Slice" body="A persistent named rectangular region on the sprite, exported as metadata." />
          <ConceptDefinition term="Linked cel" body="Multiple cels sharing one image buffer — editing one updates the others." />
        </dl>
      </section>
    </div>
  );
}

function WikiCard({
  to,
  icon,
  title,
  body,
  meta,
}: {
  to: string;
  icon: ReactNode;
  title: string;
  body: string;
  meta?: string;
}) {
  return (
    <Link to={to} className="wiki-card">
      <span className="wiki-card-icon" aria-hidden="true">{icon}</span>
      <div className="wiki-card-body">
        <span className="wiki-card-title">{title}</span>
        <span className="wiki-card-text">{body}</span>
        {meta && <span className="wiki-card-meta">{meta}</span>}
      </div>
      <ArrowRight size={14} className="wiki-card-arrow" aria-hidden="true" />
    </Link>
  );
}

function FeatureTile({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="wiki-feature">
      <span className="wiki-feature-icon" aria-hidden="true">{icon}</span>
      <span className="wiki-feature-title">{title}</span>
      <span className="wiki-feature-body">{body}</span>
    </div>
  );
}

function PathCard({ title, steps }: { title: string; steps: Array<WikiPageMeta | undefined> }) {
  const resolved = steps.filter((s): s is WikiPageMeta => Boolean(s));
  return (
    <div className="wiki-path">
      <span className="wiki-path-title">{title}</span>
      <ol className="wiki-path-steps">
        {resolved.map((step, index) => (
          <li key={step.slug || 'home'}>
            <span className="wiki-path-step-index">{index + 1}</span>
            <Link to={wikiHref(step.slug)} className="wiki-path-step-link">{step.title}</Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ConceptDefinition({ term, body }: { term: string; body: string }) {
  return (
    <div className="wiki-glossary-item">
      <dt>{term}</dt>
      <dd>{body}</dd>
    </div>
  );
}

function filterPages(pages: WikiPageMeta[], query: string): WikiPageMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return pages;
  return pages.filter((p) =>
    p.title.toLowerCase().includes(q) ||
    p.summary.toLowerCase().includes(q) ||
    p.markdown.toLowerCase().includes(q),
  );
}

function markdownComponents(page: WikiPageMeta): Components {
  return {
    a(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
      const href = props.href ?? '';
      const wikiPage = wikiPageFromHref(href);
      if (wikiPage) {
        const [, hash = ''] = href.split('#');
        return (
          <Link to={`${wikiHref(wikiPage.slug)}${hash ? `#${hash}` : ''}`} className="wiki-link">
            {props.children}
          </Link>
        );
      }
      const external = /^https?:\/\//.test(href);
      return (
        <a
          {...props}
          className="wiki-link"
          href={href}
          target={external ? '_blank' : undefined}
          rel={external ? 'noreferrer' : undefined}
        />
      );
    },
    h1(props) {
      return <h1 className="wiki-md-h1">{props.children}</h1>;
    },
    h2(props) {
      const text = flattenText(props.children);
      return <h2 id={slugify(text)} className="wiki-md-h2">{props.children}</h2>;
    },
    h3(props) {
      const text = flattenText(props.children);
      return <h3 id={slugify(`${page.slug}-${text}`)} className="wiki-md-h3">{props.children}</h3>;
    },
    p(props) {
      return <p className="wiki-md-p">{props.children}</p>;
    },
    ul(props) {
      return <ul className="wiki-md-ul">{props.children}</ul>;
    },
    ol(props) {
      return <ol className="wiki-md-ol">{props.children}</ol>;
    },
    li(props) {
      return <li className="wiki-md-li">{props.children}</li>;
    },
    strong(props) {
      return <strong className="wiki-md-strong">{props.children}</strong>;
    },
    code(props) {
      const value = flattenText(props.children);
      const isBlock = value.includes('\n') || Boolean(props.className);
      if (isBlock) return <code className="wiki-code-block">{props.children}</code>;
      if (isKeyLike(value)) {
        return <kbd className="wiki-kbd">{props.children}</kbd>;
      }
      return <code className="wiki-inline-code">{props.children}</code>;
    },
    pre(props) {
      return <pre className="wiki-pre">{props.children}</pre>;
    },
    blockquote(props) {
      return <blockquote className="wiki-blockquote">{props.children}</blockquote>;
    },
  };
}

function extractHeadings(markdown: string): HeadingItem[] {
  const items: HeadingItem[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith('## ')) {
      const title = normalizeHeadingTitle(line.slice(3).trim());
      items.push({ id: slugify(title), title, level: 2 });
    } else if (line.startsWith('### ')) {
      const title = normalizeHeadingTitle(line.slice(4).trim());
      items.push({ id: slugify(title), title, level: 3 });
    }
  }
  return dedupeHeadingIds(items);
}

function dedupeHeadingIds(items: HeadingItem[]): HeadingItem[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const count = seen.get(item.id) ?? 0;
    seen.set(item.id, count + 1);
    return count === 0 ? item : { ...item, id: `${item.id}-${count + 1}` };
  });
}

function flattenText(children: ReactNode): string {
  if (children == null) return '';
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(flattenText).join('');
  if (typeof children === 'object' && 'props' in children) {
    const node = children as { props?: { children?: React.ReactNode } };
    return flattenText(node.props?.children);
  }
  return '';
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeHeadingTitle(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

const KEY_TOKEN_PATTERN = /^([A-Z]|F[1-9]|F1[0-2]|[0-9]|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Space|Enter|Escape|Tab|Shift|Ctrl|Alt|Cmd|Meta|Delete|Backspace|Home|End|PageUp|PageDown|\+|-|=|\[|\]|\/|\\|`|,|\.)$/;

function isKeyLike(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 32) return false;
  if (trimmed.includes(' ')) return false;
  const parts = trimmed.split('+');
  if (parts.length === 0) return false;
  return parts.every((part) => KEY_TOKEN_PATTERN.test(part));
}

function iconForPage(page: WikiPageMeta) {
  if (page.slug === 'faq-and-troubleshooting') return <HelpCircle size={14} />;
  if (page.slug === 'whats-new') return <LifeBuoy size={14} />;
  switch (page.group) {
    case 'start': return <Sparkles size={14} />;
    case 'guide': return <BookOpen size={14} />;
    case 'reference': return <FileText size={14} />;
    case 'support': return <HelpCircle size={14} />;
  }
}
