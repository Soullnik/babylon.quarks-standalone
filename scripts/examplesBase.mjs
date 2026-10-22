/**
 * Where the examples app is served, base path included.
 *
 * The app is built under a base path on GitHub Actions (`/<repository>/`, see
 * `examples/vite.config.ts`) and at `/` elsewhere, and the preview server
 * answers a request outside the base with a 404 page that loads without an
 * error. A script that opened `/babylonDemo.html` there would test that page.
 * So this asks the server: `/` redirects to the base when there is one.
 *
 * @param {string} port the port the examples are served on
 * @returns {Promise<string>} the origin with the base path, ending in `/`
 */
export async function examplesBase(port) {
    const origin = `http://127.0.0.1:${port}`;
    const response = await fetch(`${origin}/`, {redirect: 'manual'}).catch(() => {
        throw new Error(`nothing serves the examples at ${origin}: run \`npm run dev -w examples\` first`);
    });
    if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location') ?? '/';
        return new URL(location, origin).href;
    }
    if (!response.ok) {
        throw new Error(`the examples server at ${origin} answered ${response.status}`);
    }
    return `${origin}/`;
}
