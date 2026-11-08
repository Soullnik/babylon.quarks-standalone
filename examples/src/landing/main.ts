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
type ThemeChoice = 'system' | 'light' | 'dark';

function readTheme(): ThemeChoice {
    try {
        const stored = localStorage.getItem(THEME_KEY);
        return stored === 'light' || stored === 'dark' ? stored : 'system';
    } catch {
        return 'system';
    }
}

function applyTheme(choice: ThemeChoice) {
    const root = document.documentElement;
    if (choice === 'system') {
        root.removeAttribute('data-theme');
    } else {
        root.setAttribute('data-theme', choice);
    }
    const button = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
    if (button) {
        button.dataset.choice = choice;
        const label = {system: 'Theme: system', light: 'Theme: light', dark: 'Theme: dark'}[choice];
        button.setAttribute('aria-label', `${label}. Switch theme`);
        button.title = label;
    }
    // The browser chrome follows an explicit choice; with "system" each meta's media query decides.
    for (const meta of Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'))) {
        meta.dataset.media ??= meta.media;
        meta.dataset.content ??= meta.content;
        meta.media = choice === 'system' ? meta.dataset.media : 'all';
        meta.content = choice === 'system' ? meta.dataset.content : choice === 'dark' ? '#161513' : '#f1ece2';
    }
}

function setupTheme() {
    let choice = readTheme();
    applyTheme(choice);
    document.querySelector('[data-theme-toggle]')?.addEventListener('click', () => {
        const order: ThemeChoice[] = ['system', 'light', 'dark'];
        choice = order[(order.indexOf(choice) + 1) % order.length];
        applyTheme(choice);
        try {
            if (choice === 'system') {
                localStorage.removeItem(THEME_KEY);
            } else {
                localStorage.setItem(THEME_KEY, choice);
            }
        } catch {
            // Storage blocked: the choice lasts for this page view only.
        }
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
        const original = button.textContent;
        button.addEventListener('click', () => {
            const text = copySource(button);
            const done = (ok: boolean) => {
                button.textContent = ok ? 'Copied' : 'Copy failed';
                window.setTimeout(() => (button.textContent = original), 1400);
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

/** Tab lists: `[role=tablist]` buttons with `aria-controls` panels; arrows, Home and End move between tabs. */
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

/** Highlights the listings and wraps each line so the stylesheet can number it (`.ln`). */
function setupCode() {
    for (const block of Array.from(document.querySelectorAll<HTMLElement>('pre code[data-lang="ts"]'))) {
        // No token of the highlighter spans a line break, so the lines can be wrapped afterwards.
        block.innerHTML = highlightTs(block.textContent ?? '')
            .split('\n')
            .map((line) => `<span class="ln">${line}</span>`)
            .join('');
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
    sync();
}

function escapeHtml(text: string) {
    return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function demoCard(demo: DemoManifestEntry) {
    const tags = demo.tags.map((tag) => `<li>${escapeHtml(tag)}</li>`).join('');
    return `<li class="demo">
  <a class="demo-link" href="./babylonDemo.html#${encodeURIComponent(demo.key)}">
    <span class="demo-shot"><img src="./previews/${previewFile(demo.key)}" alt="" loading="lazy" decoding="async" width="640" height="360" /></span>
    <span class="demo-name">${escapeHtml(demo.name)}</span>
  </a>
  <p>${escapeHtml(demo.description)}</p>
  <ul class="demo-tags" aria-label="Tags">${tags}</ul>
</li>`;
}

/**
 * The gallery: the showcase, then the feature demos, each under its category's heading. The chips
 * pick a section; the search matches names, descriptions, categories and tags.
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
        let count = 0;
        const groups: string[] = [];
        for (const section of SECTIONS) {
            for (const category of section.categories) {
                const cards = demoManifest.filter(
                    (demo) => demo.section === section.id && demo.category === category && matches(demo)
                );
                if (cards.length === 0) {
                    continue;
                }
                count += cards.length;
                groups.push(
                    `<li class="demo-group"><h3>${escapeHtml(category)}<span>${escapeHtml(section.title)}</span></h3></li>`,
                    ...cards.map(demoCard)
                );
            }
        }
        grid.innerHTML = groups.join('');
        if (status) {
            status.textContent =
                count === demoManifest.length
                    ? `${demoManifest.length} demos`
                    : `${count} of ${demoManifest.length} demos`;
        }
    };
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
