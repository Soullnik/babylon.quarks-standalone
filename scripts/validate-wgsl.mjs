/**
 * Compiles every WGSL shader variant the library can emit, using Babylon's own
 * WGSL processor and a real browser shader compiler.
 *
 * Run the examples dev server first (`npm run dev -w examples`), then
 * `node scripts/validate-wgsl.mjs`. Needs a Chromium with WebGPU enabled.
 *
 * Two phases in two pages on purpose: creating a WebGPUEngine can take the
 * WebGPU instance down with it on software adapters, so the page that produces
 * Babylon's processed WGSL is not the page that compiles it.
 */
import {chromium} from 'playwright';
const EXE = process.env.CHROMIUM_PATH;
const PORT = process.env.EXAMPLES_PORT ?? '3010';
const browser = await chromium.launch({args: ['--enable-unsafe-webgpu'], ...(EXE ? {executablePath: EXE} : {})});

// Phase 1: Babylon processes our WGSL into what it would hand the browser.
const page = await browser.newPage();
const logs = [];
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message.slice(0, 300)));
await page.goto(`http://127.0.0.1:${PORT}/wgsl-validate.html`, {waitUntil: 'load'});
try {
    await page.waitForFunction(() => window.__wgslSources !== undefined, {timeout: 120000});
} catch {
    console.log('phase 1 produced nothing:\n' + logs.slice(0, 5).join('\n'));
    await browser.close();
    process.exit(1);
}
const sources = await page.evaluate(() => window.__wgslSources);
await page.close();

// Phase 2: a page with no engine in it, so the WGSL compiler is alive.
const compiler = await browser.newPage();
// Any secure-context page will do; WebGPU needs one, about:blank does not count.
await compiler.goto(`http://127.0.0.1:${PORT}/`);
const results = await compiler.evaluate(async (cases) => {
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter.requestDevice();
    const out = [];
    for (const c of cases) {
        if (c.error) { out.push({name: c.name, ok: false, error: c.error}); continue; }
        let error = null;
        for (const [stage, code] of [['vertex', c.vertex], ['fragment', c.fragment]]) {
            const info = await device.createShaderModule({code}).getCompilationInfo();
            const errs = info.messages.filter((m) => m.type === 'error');
            if (errs.length) {
                error = `${stage} line ${errs[0].lineNum}: ${errs[0].message.trim()}`;
                break;
            }
        }
        out.push({name: c.name, ok: !error, error: error ?? undefined});
    }
    return out;
}, sources);
await browser.close();

// The self-test is invalid WGSL on purpose: if it ever compiles, the harness is
// not compiling anything and no other result means a thing.
const selfTest = results.find((r) => r.name.startsWith('SELF-TEST'));
const real = results.filter((r) => r !== selfTest);
const bad = real.filter((r) => !r.ok);
console.log(selfTest && !selfTest.ok ? 'harness self-test failed to compile, as it must' : 'HARNESS BROKEN: self-test compiled');
console.log(`${real.length - bad.length}/${real.length} shader variants compiled`);
for (const r of bad) console.log(`FAIL ${r.name}\n     ${String(r.error).slice(0, 400)}`);
process.exit(bad.length === 0 && selfTest && !selfTest.ok ? 0 : 1);
