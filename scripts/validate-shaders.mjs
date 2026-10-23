/**
 * Compiles every shader variant the library can emit (`shaderVariants()`), in
 * GLSL and in WGSL, through Babylon's own shader processing and a real browser
 * shader compiler.
 *
 * Serve the examples first (`npm run dev -w examples`, or a preview of the
 * built examples, which is what CI does), then `node scripts/validate-shaders.mjs`.
 * Needs a Chromium: Playwright's own, the headless shell included, or one
 * named in `CHROMIUM_PATH`. No GPU is needed; Chromium's SwiftShader compiles
 * GLSL (through ANGLE) and WGSL like any other adapter, which is how this runs
 * in CI.
 *
 *   --lang=glsl,wgsl   the languages to compile (default both)
 *
 * GLSL compiles and links on the WebGL2 engine in the page itself, so a
 * mismatch between a vertex and a fragment shader is caught there. WGSL takes
 * two pages on purpose: creating a WebGPUEngine can take the WebGPU instance
 * down with it on software adapters, so the page that produces Babylon's
 * processed WGSL is not the page that compiles it.
 */
import {chromium} from 'playwright';
import {examplesBase} from './examplesBase.mjs';
const EXE = process.env.CHROMIUM_PATH;
const PORT = process.env.EXAMPLES_PORT ?? '3010';
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const LANGUAGES = (arg('lang') ?? 'glsl,wgsl').split(',').filter((l) => l === 'glsl' || l === 'wgsl');
/** Variants compiled at once. Each compile is a round trip to the GPU process; one at a time takes ten minutes. */
const CHUNK = 64;
/** A page normally finishes in a minute or two; a wedged GPU process would otherwise hold the run for ever. */
const PAGE_TIMEOUT = 8 * 60 * 1000;
const started = Date.now();
const base = await examplesBase(PORT);
const browser = await chromium.launch({
    args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
        '--enable-unsafe-webgpu',
    ],
    ...(EXE ? {executablePath: EXE} : {}),
});

/** Phase 1: Babylon builds every variant in `language`; GLSL is compiled there and then. */
async function produce(language) {
    const page = await browser.newPage();
    const logs = [];
    page.on('pageerror', (e) => logs.push('pageerror: ' + e.message.slice(0, 300)));
    // 'commit' rather than 'load': the page's module awaits its work, which can hold the load event.
    await page.goto(`${base}shader-validate.html?lang=${language}`, {waitUntil: 'commit', timeout: 60000});
    try {
        await page.waitForFunction(() => window.__shaderSources !== undefined, undefined, {timeout: PAGE_TIMEOUT});
    } catch (e) {
        console.log(
            `${language}: the page produced nothing (${String(e.message ?? e).split('\n')[0]}):\n` +
                logs.slice(0, 5).join('\n')
        );
        await browser.close();
        process.exit(1);
    }
    const sources = await page.evaluate(() => window.__shaderSources);
    await page.close();
    console.log(`${language}: ${sources.cases.length} cases produced in ${Date.now() - started}ms`);
    return sources.cases;
}

/** Phase 2 (WGSL): a page with no engine in it, so the WGSL compiler is alive. */
async function compileWGSL(cases) {
    const compiler = await browser.newPage();
    // Any secure-context page will do; WebGPU needs one, about:blank does not count.
    await compiler.goto(base);
    const compiled = await Promise.race([
        compiler.evaluate(
            async ({cases, chunk}) => {
                const adapter = navigator.gpu ? await navigator.gpu.requestAdapter() : null;
                if (!adapter) {
                    return null;
                }
                const device = await adapter.requestDevice();
                // A lost device compiles nothing and reports no errors, which would read as a pass.
                let lost = null;
                device.lost.then((info) => {
                    lost = info.message || info.reason || 'device lost';
                });
                const compile = async (c) => {
                    if (c.error) {
                        return {name: c.name, ok: false, error: c.error};
                    }
                    const stages = [
                        ['vertex', c.vertex],
                        ['fragment', c.fragment],
                    ];
                    try {
                        const infos = await Promise.all(
                            stages.map(async ([stage, code]) => [
                                stage,
                                await device.createShaderModule({code}).getCompilationInfo(),
                            ])
                        );
                        for (const [stage, info] of infos) {
                            const errs = info.messages.filter((m) => m.type === 'error');
                            if (errs.length) {
                                return {
                                    name: c.name,
                                    ok: false,
                                    error: `${stage} line ${errs[0].lineNum}: ${errs[0].message.trim()}`,
                                };
                            }
                        }
                    } catch (e) {
                        return {name: c.name, ok: false, error: String(e)};
                    }
                    return {name: c.name, ok: true};
                };
                const out = [];
                for (let i = 0; i < cases.length; i += chunk) {
                    out.push(...(await Promise.all(cases.slice(i, i + chunk).map(compile))));
                }
                await new Promise((resolve) => setTimeout(resolve, 0)); // let a pending `lost` settle
                return {out, lost};
            },
            {cases, chunk: CHUNK}
        ),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`WGSL compilation took over ${PAGE_TIMEOUT}ms`)), PAGE_TIMEOUT)
        ),
    ]).catch(async (e) => {
        console.log(String(e.message ?? e));
        await browser.close();
        process.exit(1);
    });
    await compiler.close();
    if (compiled === null) {
        console.log('no WebGPU adapter: the browser was started without WebGPU, or its software adapter is missing');
        process.exit(1);
    }
    if (compiled.lost !== null) {
        console.log(`WebGPU device lost during compilation, so the results mean nothing: ${compiled.lost}`);
        process.exit(1);
    }
    return compiled.out;
}

/**
 * Checks one language's results: the self-test must have failed, something real must have
 * compiled, and nothing real may have failed. Returns whether the language passed.
 */
function report(language, results) {
    // The self-test is invalid source on purpose: if it ever compiles, the harness is
    // not compiling anything and no other result means a thing.
    const selfTest = results.find((r) => r.name.startsWith('SELF-TEST'));
    const real = results.filter((r) => r !== selfTest);
    const bad = real.filter((r) => !r.ok);
    const harnessOk = selfTest !== undefined && !selfTest.ok && real.length > 0;
    console.log(
        selfTest === undefined
            ? `${language}: HARNESS BROKEN: no self-test result`
            : selfTest.ok
              ? `${language}: HARNESS BROKEN: self-test compiled`
              : `${language}: harness self-test failed to compile, as it must`
    );
    if (real.length === 0) {
        console.log(`${language}: HARNESS BROKEN: no shader variants to compile`);
    }
    console.log(`${language}: ${real.length - bad.length}/${real.length} shader variants compiled`);
    for (const r of bad) console.log(`FAIL ${language} ${r.name}\n     ${String(r.error).slice(0, 400)}`);
    return bad.length === 0 && harnessOk;
}

let ok = LANGUAGES.length > 0;
if (!ok) {
    console.log('--lang names no language: use glsl, wgsl or glsl,wgsl');
}
for (const language of LANGUAGES) {
    const cases = await produce(language);
    const results =
        language === 'glsl'
            ? cases.map((c) => ({name: c.name, ok: !c.error, error: c.error}))
            : await compileWGSL(cases);
    ok = report(language, results) && ok;
}
await browser.close();
console.log(`done in ${Date.now() - started}ms`);
process.exit(ok ? 0 : 1);
