import {demoManifest} from '../demoManifest';
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
        meta.content = choice === 'system' ? meta.dataset.content : choice === 'dark' ? '#0a0c11' : '#f4f5f8';
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

function setupCode() {
    for (const block of Array.from(document.querySelectorAll<HTMLElement>('pre code[data-lang="ts"]'))) {
        block.innerHTML = highlightTs(block.textContent ?? '');
    }
}

/** `examples/public/previews/<kebab-key>.png`, as `npm run capture:previews` writes it. */
function previewFile(demoKey: string) {
    return demoKey
        .replace(/Demo$/u, '')
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .toLowerCase();
}

function escapeHtml(text: string) {
    return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function demoCard(demo: DemoManifestEntry) {
    const tags = demo.tags.map((tag) => `<li>${escapeHtml(tag)}</li>`).join('');
    return `<li class="demo">
  <a class="demo-link" href="./babylonDemo.html#${encodeURIComponent(demo.key)}">
    <img src="./previews/${previewFile(demo.key)}.png" alt="" loading="lazy" decoding="async" width="640" height="360" />
    <span class="demo-name">${escapeHtml(demo.name)}</span>
  </a>
  <p>${escapeHtml(demo.description)}</p>
  <ul class="demo-tags" aria-label="Tags">${tags}</ul>
</li>`;
}

/** Tags that appear on at least two demos, most common first: the gallery's filter chips. */
function filterTags() {
    const counts = new Map<string, number>();
    for (const demo of demoManifest) {
        for (const tag of demo.tags) {
            counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }
    }
    return [...counts.entries()]
        .filter(([, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([tag]) => tag);
}

function setupGallery() {
    const grid = document.getElementById('demos-grid');
    const search = document.getElementById('demo-search') as HTMLInputElement | null;
    const chips = document.getElementById('demo-filters');
    const status = document.getElementById('demo-status');
    if (!grid) {
        return;
    }
    let activeTag = '';
    if (chips) {
        chips.innerHTML = ['', ...filterTags()]
            .map(
                (tag) =>
                    `<button type="button" class="chip" data-tag="${escapeHtml(tag)}" aria-pressed="${tag === ''}">${
                        tag === '' ? 'All' : escapeHtml(tag)
                    }</button>`
            )
            .join('');
        chips.addEventListener('click', (event) => {
            const chip = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-tag]');
            if (!chip) {
                return;
            }
            activeTag = chip.dataset.tag ?? '';
            for (const other of Array.from(chips.querySelectorAll('[data-tag]'))) {
                other.setAttribute('aria-pressed', String(other === chip));
            }
            render();
        });
    }
    const render = () => {
        const query = (search?.value ?? '').trim().toLowerCase();
        const shown = demoManifest.filter((demo) => {
            if (activeTag && !demo.tags.includes(activeTag)) {
                return false;
            }
            if (!query) {
                return true;
            }
            return `${demo.name} ${demo.description} ${demo.tags.join(' ')}`.toLowerCase().includes(query);
        });
        grid.innerHTML = shown.map(demoCard).join('');
        if (status) {
            status.textContent =
                shown.length === demoManifest.length
                    ? `${demoManifest.length} demos`
                    : `${shown.length} of ${demoManifest.length} demos`;
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
