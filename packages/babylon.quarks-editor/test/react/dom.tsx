/**
 * Mounts editor React components into jsdom and drives them through the DOM, the way a user
 * does: typing into number inputs, ticking checkboxes, picking select options, opening module
 * foldouts. React's `act` flushes each change; `binding` changes re-render through the
 * subscription in the component under test.
 */
import React, {act} from 'react';
import {createRoot, Root} from 'react-dom/client';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no 2D canvas; the curve and mesh previews skip drawing when getContext gives null.
// Left in place for the file: jest gives every test file its own jsdom.
HTMLCanvasElement.prototype.getContext = (() => null) as never;

/** The text a module header shows as its title. */
function headerTitle(header: Element): string | null {
    for (const span of Array.from(header.querySelectorAll('span'))) {
        const first = span.firstChild;
        if (first && first.nodeType === Node.TEXT_NODE && first.textContent) {
            return first.textContent;
        }
    }
    return null;
}

/** Titles of every module foldout in `container`, in order. */
export function moduleTitles(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll('header'))
        .map(headerTitle)
        .filter((t): t is string => t !== null);
}

export interface Mounted {
    container: HTMLElement;
    /** Re-renders with new props, or the same element after an external change. */
    render(element: React.ReactElement): void;
    unmount(): void;
}

/** Renders `element` into a fresh container appended to the document body. */
export function mount(element: React.ReactElement): Mounted {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    const render = (next: React.ReactElement) => {
        act(() => root.render(next));
    };
    render(element);
    return {
        container,
        render,
        unmount() {
            act(() => root.unmount());
            container.remove();
        },
    };
}

/** The inspector row whose label reads `label` exactly, or throws naming the rows present. */
export function rowOf(container: HTMLElement, label: string): HTMLElement {
    const labels = Array.from(container.querySelectorAll('span span')).filter(
        (span) => span.textContent === label && span.parentElement?.parentElement
    );
    const row = labels[0]?.parentElement?.parentElement ?? null;
    if (!row) {
        const present = Array.from(container.querySelectorAll('span span'))
            .map((s) => s.textContent)
            .filter((t): t is string => !!t);
        throw new Error(`no row "${label}"; rows: ${present.join(' | ')}`);
    }
    return row;
}

/** True when a row with that label is on screen. */
export function hasRow(container: HTMLElement, label: string): boolean {
    return Array.from(container.querySelectorAll('span span')).some((span) => span.textContent === label);
}

/** The inputs and selects of a row, in DOM order. */
export function controlsOf(row: HTMLElement): Array<HTMLInputElement | HTMLSelectElement> {
    return Array.from(row.querySelectorAll('input, select'));
}

const inputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
const selectValueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;

/** Types `text` into a number or text input as a user would, so React's onChange runs. */
export function type(input: Element, text: string): void {
    act(() => {
        inputValueSetter.call(input, text);
        input.dispatchEvent(new Event('input', {bubbles: true}));
    });
}

/** Picks an option of a select by its value. */
export function pick(select: Element, value: string): void {
    act(() => {
        selectValueSetter.call(select, value);
        select.dispatchEvent(new Event('change', {bubbles: true}));
    });
}

/** Clicks a checkbox, button or foldout header. */
export function click(element: Element): void {
    act(() => {
        (element as HTMLElement).click();
    });
}

/** Opens a module foldout by its title (a no-op when already open) and returns its section. */
export function openModule(container: HTMLElement, title: string): HTMLElement {
    const header = Array.from(container.querySelectorAll('header')).find((h) => headerTitle(h) === title);
    if (!header) {
        throw new Error(`no module "${title}"`);
    }
    const section = header.parentElement!;
    if (!section.querySelector('header + div')) {
        click(header);
    }
    return section;
}

/** The enable checkbox in a module's header. */
export function moduleToggle(section: HTMLElement): HTMLInputElement {
    const toggle = section.querySelector('header input[type=checkbox]');
    if (!toggle) {
        throw new Error('module has no enable checkbox');
    }
    return toggle as HTMLInputElement;
}

/** Labels of every inspector row in `root`, in order. */
export function rowLabels(root: HTMLElement): string[] {
    return Array.from(root.querySelectorAll('span span'))
        .map((s) => s.textContent ?? '')
        .filter((t) => t.length > 0);
}
