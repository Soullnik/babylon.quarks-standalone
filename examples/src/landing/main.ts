import {ArrowRight, ArrowUpRight, Copy, createIcons, Menu, Moon, Play, Search, Sun} from 'lucide';
import {siGithub, siNpm} from 'simple-icons';
import {demoManifest, previewFile, SECTIONS} from '../demoManifest';
import type {DemoManifestEntry} from '../types';
import {highlightTs} from './highlight';

/** State the demo smoke test reads to know the landing page came up. */
interface LandingHook {
    /** True once the gallery rendered and the hero stage either started or was skipped. */
    ready: boolean;
    /** 'live', 'poster' (reduced motion / no WebGL) or 'failed'. */
    stage: string;
}
const hook: LandingHook = {ready: false, stage: 'pending'};
(window as unknown as {__quarksLanding: LandingHook}).__quarksLanding = hook;

const THEME_KEY = 'quarks-theme';
/** Dark first: additive particles read on a dark ground. Paper is the choice the visitor makes. */
type ThemeChoice = 'light' | 'dark';
const THEME_COLOR: Record<ThemeChoice, string> = {dark: '#0b0d12', light: '#eef0f5'};

function readTheme(): ThemeChoice {
    try {
        return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
    } catch {
        return 'dark';
    }
}

function applyTheme(choice: ThemeChoice) {
    document.documentElement.setAttribute('data-theme', choice);
    const button = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
    if (button) {
        button.dataset.choice = choice;
        const next = choice === 'dark' ? 'paper' : 'dark';
        button.setAttribute('aria-label', `Theme: ${choice === 'dark' ? 'dark' : 'paper'}. Switch to ${next}`);
        button.title = `Switch to the ${next} theme`;
    }
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) {
        meta.content = THEME_COLOR[choice];
    }
}

function setupTheme() {
    let choice = readTheme();
    applyTheme(choice);
    document.querySelector('[data-theme-toggle]')?.addEventListener('click', () => {
        choice = choice === 'dark' ? 'light' : 'dark';
        applyTheme(choice);
        try {
            localStorage.setItem(THEME_KEY, choice);
        } catch {
            // Storage blocked: the choice lasts for this page view only.
        }
    });
}

/**
 * Every icon on the page comes from one set: Lucide glyphs, replaced in place from `data-lucide`,
 * plus the GitHub and npm marks from Simple Icons, which Lucide does not carry. Arrow links, copy
 * buttons and the stage's editor action get their glyph here rather than in the markup, so the
 * markup stays text and the glyphs stay in one place.
 */
function setupIcons() {
    for (const link of Array.from(document.querySelectorAll('.arrow-link'))) {
        link.insertAdjacentHTML('beforeend', '<i data-lucide="arrow-right" class="icon" aria-hidden="true"></i>');
    }
    for (const button of Array.from(document.querySelectorAll('.copy'))) {
        button.insertAdjacentHTML('afterbegin', '<i data-lucide="copy" class="icon" aria-hidden="true"></i>');
    }
    document
        .querySelector('[data-stage-editor]')
        ?.insertAdjacentHTML('beforeend', '<i data-lucide="arrow-up-right" class="icon" aria-hidden="true"></i>');
    for (const mark of Array.from(document.querySelectorAll<HTMLElement>('[data-brand]'))) {
        const brand = mark.dataset.brand === 'github' ? siGithub : mark.dataset.brand === 'npm' ? siNpm : null;
        if (brand) {
            mark.innerHTML = `<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path fill="currentColor" d="${brand.path}"/></svg>`;
        }
    }
    createIcons({
        icons: {ArrowRight, ArrowUpRight, Copy, Menu, Moon, Play, Search, Sun},
        attrs: {'stroke-width': 1.75, 'aria-hidden': 'true'},
    });
}

function setupMenu() {
    const toggle = document.querySelector<HTMLButtonElement>('[data-menu-toggle]');
    const nav = document.getElementById('site-nav');
    if (!toggle || !nav) {
        return;
    }
    const setOpen = (open: boolean) => {
        toggle.setAttribute('aria-expanded', String(open));
        nav.dataset.open = String(open);
        document.documentElement.classList.toggle('menu-open', open);
    };
    toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
    nav.addEventListener('click', (event) => {
        if ((event.target as HTMLElement).closest('a')) {
            setOpen(false);
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || nav.dataset.open !== 'true') {
            return;
        }
        const focusInside = nav.contains(document.activeElement);
        setOpen(false);
        if (focusInside) {
            toggle.focus();
        }
    });
    document.addEventListener('click', (event) => {
        const target = event.target as Node;
        if (nav.dataset.open === 'true' && !nav.contains(target) && !toggle.contains(target)) {
            setOpen(false);
        }
    });
}

/**
 * Copy buttons: `data-copy-target="id"` copies that element's text; `data-copy-panel` copies the
 * code of the visible tab panel in the same `.code-card`.
 */
function copySource(button: HTMLButtonElement) {
    const targetId = button.dataset.copyTarget;
    if (targetId) {
        return document.getElementById(targetId)?.textContent ?? '';
    }
    const card = button.closest('.code-card');
    const panel = card
        ? Array.from(card.querySelectorAll<HTMLElement>('[role="tabpanel"]')).find((p) => !p.hidden)
        : null;
    return panel?.querySelector('code')?.textContent ?? '';
}

function setupCopyButtons() {
    for (const button of Array.from(
        document.querySelectorAll<HTMLButtonElement>('[data-copy-target], [data-copy-panel]')
    )) {
        const label = button.querySelector('.copy-label') ?? button;
        const original = label.textContent;
        button.addEventListener('click', () => {
            const text = copySource(button);
            const done = (ok: boolean) => {
                label.textContent = ok ? 'Copied' : 'Copy failed';
                window.setTimeout(() => (label.textContent = original), 1400);
            };
            if (navigator.clipboard?.writeText) {
                navigator.clipboard.writeText(text.trim()).then(
                    () => done(true),
                    () => done(false)
                );
            } else {
                done(false);
            }
        });
    }
}

/** The index arrow keys, Home and End move to in a row of `count` items, or -1 for other keys. */
function rovingIndex(key: string, index: number, count: number) {
    switch (key) {
        case 'ArrowRight':
            return (index + 1) % count;
        case 'ArrowLeft':
            return (index - 1 + count) % count;
        case 'Home':
            return 0;
        case 'End':
            return count - 1;
        default:
            return -1;
    }
}

/**
 * Tab lists: `[role=tablist]` buttons with `aria-controls` panels; arrows, Home and End move between
 * tabs. A figure with `data-tab-figure="<tab id>"` shows only while that tab is selected.
 */
function setupTabs() {
    for (const list of Array.from(document.querySelectorAll<HTMLElement>('[role="tablist"][data-panels]'))) {
        const tabs = Array.from(list.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
        const select = (tab: HTMLButtonElement, focus: boolean) => {
            for (const other of tabs) {
                const selected = other === tab;
                other.setAttribute('aria-selected', String(selected));
                other.tabIndex = selected ? 0 : -1;
                const panel = document.getElementById(other.getAttribute('aria-controls') ?? '');
                if (panel) {
                    panel.hidden = !selected;
                }
            }
            for (const figure of Array.from(document.querySelectorAll<HTMLElement>('[data-tab-figure]'))) {
                figure.hidden = figure.dataset.tabFigure !== tab.id;
            }
            if (focus) {
                tab.focus();
            }
        };
        for (const [index, tab] of tabs.entries()) {
            tab.addEventListener('click', () => select(tab, false));
            tab.addEventListener('keydown', (event) => {
                const next = rovingIndex(event.key, index, tabs.length);
                if (next >= 0) {
                    event.preventDefault();
                    select(tabs[next], true);
                }
            });
        }
    }
}

/**
 * The stage's effect buttons are a toolbar with one Tab stop (roving tabindex); arrows, Home and
 * End move between them. Until the live stage is up, a click marks the effect it should open on,
 * and on the poster (reduced motion, or a stage that failed) it starts the stage with that effect.
 */
function setupStageControls() {
    const root = document.querySelector<HTMLElement>('[data-stage]');
    if (!root) {
        return;
    }
    const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-effect]'));
    for (const [index, tab] of tabs.entries()) {
        tab.tabIndex = tab.getAttribute('aria-pressed') === 'true' ? 0 : -1;
        tab.addEventListener('keydown', (event) => {
            const next = rovingIndex(event.key, index, tabs.length);
            if (next >= 0) {
                event.preventDefault();
                tabs[next].focus();
            }
        });
        tab.addEventListener('click', () => {
            if (root.dataset.live === 'true') {
                return; // the live stage handles it
            }
            for (const other of tabs) {
                other.setAttribute('aria-pressed', String(other === tab));
                other.tabIndex = other === tab ? 0 : -1;
            }
            if (root.dataset.mode === 'poster') {
                startLiveStage(root);
            }
        });
    }
    root.querySelector('[data-stage-editor]')?.addEventListener('click', () => {
        if (root.dataset.live !== 'true') {
            window.location.href = './editor.html';
        }
    });
    root.querySelector('[data-stage-play]')?.addEventListener('click', () => startLiveStage(root));
}

/**
 * Highlights the listings and wraps each line so the stylesheet can number it (`.ln`). The curve
 * figure's caption names the line of listing 2 that holds the curve, read from the text so it
 * cannot drift from the code.
 */
function setupCode() {
    for (const block of Array.from(document.querySelectorAll<HTMLElement>('pre code[data-lang="ts"]'))) {
        // No token of the highlighter spans a line break, so the lines can be wrapped afterwards.
        block.innerHTML = highlightTs(block.textContent ?? '')
            .split('\n')
            .map((line) => `<span class="ln">${line}</span>`)
            .join('');
    }
    const lines = (document.getElementById('src-code')?.textContent ?? '').split('\n');
    const curveLine = lines.findIndex((line) => line.includes('new Bezier(')) + 1;
    const caption = document.querySelector('[data-curve-line]');
    if (caption && curveLine > 0) {
        caption.textContent = String(curveLine);
    }
}

/**
 * The breakdown legend below the stage describes the Vortex. It records which take the stage is
 * on, so the stylesheet can mark the legend as describing another take than the one running.
 */
function setupBreakdown() {
    const legend = document.querySelector<HTMLElement>('[data-breakdown]');
    const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-stage] [data-effect]'));
    if (!legend || tabs.length === 0) {
        return;
    }
    const sync = () => {
        const active = tabs.find((tab) => tab.getAttribute('aria-pressed') === 'true');
        legend.dataset.activeEffect = active?.dataset.effect ?? 'vortex';
    };
    const observer = new MutationObserver(sync);
    for (const tab of tabs) {
        observer.observe(tab, {attributes: true, attributeFilter: ['aria-pressed']});
    }
    legend.querySelector('[data-breakdown-vortex]')?.addEventListener('click', () => {
        tabs.find((tab) => tab.dataset.effect === 'vortex')?.click();
    });
    sync();
}

function escapeHtml(text: string) {
    return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function demoCard(demo: DemoManifestEntry) {
    const showcase = demo.section === 'showcase';
    const tags = [
        ...(showcase ? [] : [`<li class="demo-category">${escapeHtml(demo.category)}</li>`]),
        ...demo.tags.slice(0, 3).map((tag) => `<li>${escapeHtml(tag)}</li>`),
    ].join('');
    const description = showcase
        ? ''
        : `
  <p>${escapeHtml(demo.description)}</p>`;
    return `<li class="demo${showcase ? ' demo-large' : ''}">
  <a class="demo-link" href="./babylonDemo.html#${encodeURIComponent(demo.key)}">
    <span class="demo-shot"><img src="./previews/${previewFile(demo.key)}" alt="" loading="lazy" decoding="async" width="640" height="360" /></span>
    <span class="demo-name">${escapeHtml(demo.name)}</span>
  </a>${description}
  <ul class="demo-tags" aria-label="Tags">${tags}</ul>
</li>`;
}

/** On a phone the gallery opens on the showcase and the first feature demos, with a button for the rest. */
const PHONE_FEATURES = 6;
const phone = window.matchMedia?.('(max-width: 640px)');

/**
 * The gallery: the showcase as large cards, then every feature demo in one dense grid, in the
 * manifest's section and category order. The chips pick a section; the search matches names,
 * descriptions, categories and tags. With a filter or a search on, every card is the same size.
 */
function setupGallery() {
    const grid = document.getElementById('demos-grid');
    const search = document.getElementById('demo-search') as HTMLInputElement | null;
    const chips = document.getElementById('demo-filters');
    const status = document.getElementById('demo-status');
    if (!grid) {
        return;
    }
    let activeSection = '';
    let expanded = false;
    if (chips) {
        chips.innerHTML = [{id: '', title: 'All'}, ...SECTIONS]
            .map(
                ({id, title}) =>
                    `<button type="button" class="chip" data-section="${id}" aria-pressed="${id === ''}">${escapeHtml(title)}</button>`
            )
            .join('');
        chips.addEventListener('click', (event) => {
            const chip = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-section]');
            if (!chip) {
                return;
            }
            activeSection = chip.dataset.section ?? '';
            for (const other of Array.from(chips.querySelectorAll('[data-section]'))) {
                other.setAttribute('aria-pressed', String(other === chip));
            }
            render();
        });
    }
    const render = () => {
        const query = (search?.value ?? '').trim().toLowerCase();
        const matches = (demo: DemoManifestEntry) =>
            (!activeSection || demo.section === activeSection) &&
            (!query ||
                `${demo.name} ${demo.description} ${demo.category} ${demo.tags.join(' ')}`
                    .toLowerCase()
                    .includes(query));
        const cards = SECTIONS.flatMap((section) =>
            section.categories.flatMap((category) =>
                demoManifest.filter(
                    (demo) => demo.section === section.id && demo.category === category && matches(demo)
                )
            )
        );
        const filtered = Boolean(activeSection || query);
        grid.toggleAttribute('data-filtered', filtered);
        let shown = cards;
        let hidden = 0;
        if (!filtered && !expanded && phone?.matches) {
            const showcase = cards.filter((demo) => demo.section === 'showcase');
            const features = cards.filter((demo) => demo.section !== 'showcase');
            shown = [...showcase, ...features.slice(0, PHONE_FEATURES)];
            hidden = features.length - PHONE_FEATURES;
        }
        const parts = shown.map(demoCard);
        if (cards.length === 0) {
            parts.push(
                `<li class="demo-empty">No demo matches “${escapeHtml(query)}”. <button type="button" class="text-button" data-clear-search>Clear the search</button></li>`
            );
        } else if (hidden > 0) {
            parts.push(
                `<li class="demo-more"><button type="button" class="text-button" data-show-all>Show all ${hidden + PHONE_FEATURES} feature demos</button></li>`
            );
        }
        grid.innerHTML = parts.join('');
        if (status) {
            status.textContent =
                cards.length === demoManifest.length
                    ? `${demoManifest.length} demos`
                    : `${cards.length} of ${demoManifest.length} demos`;
        }
    };
    grid.addEventListener('click', (event) => {
        const target = event.target as HTMLElement;
        if (target.closest('[data-clear-search]') && search) {
            search.value = '';
            render();
            search.focus();
        } else if (target.closest('[data-show-all]')) {
            expanded = true;
            render();
        }
    });
    phone?.addEventListener('change', render);
    search?.addEventListener('input', render);
    render();
}

function setCount(name: string, value: number) {
    for (const node of Array.from(document.querySelectorAll(`[data-count="${name}"]`))) {
        node.textContent = String(value);
    }
}

let stageStarting = false;

/** Leaves poster mode and mounts the live stage, once. */
function startLiveStage(root: HTMLElement) {
    if (stageStarting) {
        return;
    }
    stageStarting = true;
    const play = root.querySelector<HTMLElement>('[data-stage-play]');
    if (play) {
        play.hidden = true;
    }
    delete root.dataset.mode;
    hook.stage = 'pending';
    void runStage(root);
}

async function runStage(root: HTMLElement) {
    try {
        const {mountHeroStage, libraryCounts} = await import('./heroStage');
        const counts = libraryCounts();
        setCount('behaviors', counts.behaviors);
        setCount('shapes', counts.shapes);
        await mountHeroStage(root);
        hook.stage = 'live';
    } catch (error) {
        console.warn('The live stage could not start; showing the poster instead.', error);
        showPoster(root);
        hook.stage = 'failed';
        stageStarting = false;
    }
}

/** The still poster with a Play button, for reduced motion or after the stage failed to start. */
function showPoster(root: HTMLElement) {
    root.dataset.mode = 'poster';
    const play = root.querySelector<HTMLElement>('[data-stage-play]');
    if (play) {
        play.hidden = false;
    }
}

async function startStage() {
    const root = document.querySelector<HTMLElement>('[data-stage]');
    if (!root) {
        hook.stage = 'none';
        return;
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        showPoster(root);
        hook.stage = 'poster';
        return;
    }
    stageStarting = true;
    await runStage(root);
}

setupTheme();
setupIcons();
setupMenu();
setupCopyButtons();
setupTabs();
setupStageControls();
setupBreakdown();
setupCode();
setupGallery();
setCount('demos', demoManifest.length);

// Start the stage after first paint so the page text never waits on Babylon.
const kick = () => {
    void startStage().finally(() => {
        hook.ready = true;
    });
};
if (document.readyState === 'complete') {
    window.requestAnimationFrame(kick);
} else {
    window.addEventListener('load', () => window.requestAnimationFrame(kick), {once: true});
}
