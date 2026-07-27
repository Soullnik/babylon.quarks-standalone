/**
 * Temporary phone-debug log capture for iOS WebKit.
 * Hook console + window errors, show an on-screen panel, copy to clipboard.
 * Remove once the MeshMaterial iOS blank-draw is diagnosed.
 */

const MAX_LINES = 400;
const lines: string[] = [];
let panel: HTMLElement | null = null;
let pre: HTMLPreElement | null = null;
let installed = false;

/** Formats a log argument for the on-screen buffer. */
function formatArg(value: unknown): string {
    if (value instanceof Error) {
        return value.stack || `${value.name}: ${value.message}`;
    }
    if (typeof value === "string") {
        return value;
    }
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

/** Appends one line and refreshes the panel if it is open. */
function push(level: string, args: unknown[]) {
    const stamp = new Date().toISOString().slice(11, 23);
    const body = args.map(formatArg).join(" ");
    lines.push(`[${stamp}] ${level} ${body}`);
    if (lines.length > MAX_LINES) {
        lines.splice(0, lines.length - MAX_LINES);
    }
    if (pre && panel?.classList.contains("is-open")) {
        pre.textContent = lines.join("\n");
        pre.scrollTop = pre.scrollHeight;
    }
}

/** Installs console/window hooks once. Safe to call repeatedly. */
export function installPhoneDebugLog() {
    if (installed) {
        return;
    }
    installed = true;

    const wrap =
        (level: string, original: (...args: unknown[]) => void) =>
        (...args: unknown[]) => {
            try {
                push(level, args);
            } catch {
                // never break the page from the logger itself
            }
            original.apply(console, args);
        };

    console.log = wrap("LOG", console.log.bind(console));
    console.info = wrap("INF", console.info.bind(console));
    console.warn = wrap("WRN", console.warn.bind(console));
    console.error = wrap("ERR", console.error.bind(console));

    window.addEventListener("error", (event) => {
        push("ERR", [event.message, event.filename, `${event.lineno}:${event.colno}`, event.error]);
    });
    window.addEventListener("unhandledrejection", (event) => {
        push("REJ", [event.reason]);
    });

    push("INF", ["phone debug log installed", navigator.userAgent]);
}

/** Builds the floating Logs / Copy UI into the page. */
export function mountPhoneDebugLogUi() {
    installPhoneDebugLog();

    const btn = document.getElementById("phone-log-btn");
    panel = document.getElementById("phone-log-panel");
    pre = document.getElementById("phone-log-pre") as HTMLPreElement | null;
    const copyBtn = document.getElementById("phone-log-copy");
    const closeBtn = document.getElementById("phone-log-close");
    const dumpBtn = document.getElementById("phone-log-dump");
    const tryEnvBtn = document.getElementById("phone-log-try-env");

    btn?.addEventListener("click", () => {
        panel?.classList.toggle("is-open");
        if (pre) {
            pre.textContent = lines.join("\n");
            pre.scrollTop = pre.scrollHeight;
        }
    });

    closeBtn?.addEventListener("click", () => {
        panel?.classList.remove("is-open");
    });

    copyBtn?.addEventListener("click", async () => {
        const text = lines.join("\n");
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                push("INF", ["copied", `${lines.length} lines`]);
                if (pre) {
                    pre.textContent = lines.join("\n");
                }
                copyBtn.textContent = "Copied!";
                setTimeout(() => {
                    copyBtn.textContent = "Copy";
                }, 1500);
                return;
            }
        } catch (e) {
            push("WRN", ["clipboard API failed", e]);
        }
        // iOS fallback: select the pre so the user can Copy from the callout.
        if (pre) {
            const range = document.createRange();
            range.selectNodeContents(pre);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
            push("INF", ["selected log text — use Copy from the iOS menu"]);
        }
    });

    dumpBtn?.addEventListener("click", () => {
        window.dispatchEvent(new CustomEvent("phone-debug-dump"));
    });

    tryEnvBtn?.addEventListener("click", () => {
        (window as {__QUARKS_MESH_ENV__?: boolean}).__QUARKS_MESH_ENV__ = true;
        push("INF", "Try env: __QUARKS_MESH_ENV__=true — reloading MeshMaterialDemo");
        window.dispatchEvent(new CustomEvent("phone-debug-try-env"));
    });
}

/** Public helper for viewer diagnostics. */
export function phoneLog(level: "LOG" | "INF" | "WRN" | "ERR", ...args: unknown[]) {
    push(level, args);
}

/** Returns the captured buffer (for tests / dump). */
export function getPhoneDebugLogText(): string {
    return lines.join("\n");
}
