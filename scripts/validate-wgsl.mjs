/**
 * Compiles every WGSL shader variant the library can emit, using Babylon's own
 * WGSL processor and a real browser shader compiler.
 *
 * Serve the examples first (`npm run dev -w examples`, or a preview of the
 * built examples, which is what CI does), then `node scripts/validate-wgsl.mjs`.
 * Needs a Chromium with WebGPU: Playwright's own, the headless shell included,
 * or one named in `CHROMIUM_PATH`. No GPU is needed; Chromium's SwiftShader
 * adapter compiles WGSL like any other, which is how this runs in CI.
 *
 * Two phases in two pages on purpose: creating a WebGPUEngine can take the
 * WebGPU instance down with it on software adapters, so the page that produces
 * Babylon's processed WGSL is not the page that compiles it.
 */
import {chromium} from 'playwright';
import {examplesBase} from './examplesBase.mjs';
const EXE = process.env.CHROMIUM_PATH;
const PORT = process.env.EXAMPLES_PORT ?? '3010';
/** Variants compiled at once. Each compile is a round trip to the GPU process; one at a time takes ten minutes. */
const CHUNK = 64;
/** Phase 2 normally takes seconds; a wedged GPU process would otherwise hold the run for ever. */
const COMPILE_TIMEOUT = 5 * 60 * 1000;
const started = Date.now();
const base = await examplesBase(PORT);
const browser = await chromium.launch({args: ['--enable-unsafe-webgpu'], ...(EXE ? {executablePath: EXE} : {})});

// Phase 1: Babylon processes our WGSL into what it would hand the browser.
const page = await browser.newPage();
const logs = [];
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message.slice(0, 300)));
await page.goto(`${base}wgsl-validate.html`, {waitUntil: 'load'});
try {
    await page.waitForFunction(() => window.__wgslSources !== undefined, {timeout: 120000});
} catch {
    console.log('phase 1 produced nothing:\n' + logs.slice(0, 5).join('\n'));
    await browser.close();
    process.exit(1);
}
const sources = await page.evaluate(() => window.__wgslSources);
await page.close();
console.log(`${sources.length} cases produced in ${Date.now() - started}ms`);

// Phase 2: a page with no engine in it, so the WGSL compiler is alive.
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
        {cases: sources, chunk: CHUNK}
    ),
    new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`phase 2 took over ${COMPILE_TIMEOUT}ms`)), COMPILE_TIMEOUT)
    ),
]).catch(async (e) => {
    console.log(String(e.message ?? e));
    await browser.close();
    process.exit(1);
});
await browser.close();
if (compiled === null) {
    console.log('no WebGPU adapter: the browser was started without WebGPU, or its software adapter is missing');
    process.exit(1);
}
if (compiled.lost !== null) {
    console.log(`WebGPU device lost during compilation, so the results mean nothing: ${compiled.lost}`);
    process.exit(1);
}
const results = compiled.out;

// The self-test is invalid WGSL on purpose: if it ever compiles, the harness is
// not compiling anything and no other result means a thing.
const selfTest = results.find((r) => r.name.startsWith('SELF-TEST'));
const real = results.filter((r) => r !== selfTest);
const bad = real.filter((r) => !r.ok);
const harnessOk = selfTest !== undefined && !selfTest.ok && real.length > 0;
console.log(
    selfTest === undefined
        ? 'HARNESS BROKEN: no self-test result'
        : selfTest.ok
          ? 'HARNESS BROKEN: self-test compiled'
          : 'harness self-test failed to compile, as it must'
);
if (real.length === 0) {
    console.log('HARNESS BROKEN: no shader variants to compile');
}
console.log(`${real.length - bad.length}/${real.length} shader variants compiled in ${Date.now() - started}ms`);
for (const r of bad) console.log(`FAIL ${r.name}\n     ${String(r.error).slice(0, 400)}`);
process.exit(bad.length === 0 && harnessOk ? 0 : 1);
