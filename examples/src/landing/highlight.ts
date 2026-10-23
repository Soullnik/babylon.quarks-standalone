const KEYWORDS = new Set([
    'import',
    'from',
    'export',
    'const',
    'let',
    'new',
    'await',
    'async',
    'return',
    'function',
    'if',
    'else',
    'for',
    'of',
    'type',
    'true',
    'false',
    'null',
    'undefined',
]);

// One alternative per token class, tried left to right at each position.
const TOKEN =
    /(\/\/[^\n]*)|('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)(\s*\()?/g;

function escapeHtml(text: string) {
    return text.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));
}

/**
 * Highlights a TypeScript snippet for the landing page's code samples: comments, strings,
 * numbers, keywords, types (capitalised names) and calls. Returns HTML with `<span class="tok-*">`
 * wrappers; everything else is escaped text.
 */
export function highlightTs(source: string): string {
    let html = '';
    let last = 0;
    for (const match of source.matchAll(TOKEN)) {
        const index = match.index ?? 0;
        html += escapeHtml(source.slice(last, index));
        last = index + match[0].length;
        const [whole, comment, string, number, word, call] = match;
        if (comment) {
            html += `<span class="tok-comment">${escapeHtml(comment)}</span>`;
        } else if (string) {
            html += `<span class="tok-string">${escapeHtml(string)}</span>`;
        } else if (number) {
            html += `<span class="tok-number">${number}</span>`;
        } else if (word) {
            const kind = KEYWORDS.has(word) ? 'keyword' : /^[A-Z]/.test(word) ? 'type' : call ? 'call' : '';
            html += kind ? `<span class="tok-${kind}">${word}</span>` : word;
            if (call) {
                html += escapeHtml(call);
            }
        } else {
            html += escapeHtml(whole);
        }
    }
    return html + escapeHtml(source.slice(last));
}
