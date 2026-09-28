import type {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture';
import {srgbGlsl, srgbWgsl} from './shaders/srgb';

/**
 * A material's own shading, as a graph of simple operations: what it computes for a particle's
 * colour and alpha from its textures, the particle colour, UVs, time and scene depth. The Unity
 * exporter compiles a Shader Graph into one — UV scrolling, masks, noise distortion, depth fade —
 * and babylon.quarks turns it into the fragment shader that draws the particle.
 *
 * Every node yields a float or a 2-, 3- or 4-vector (`type` is its width) and names its inputs by
 * index into `nodes`; an input always has the width the node needs, the exporter having inserted
 * any `cast`. Values are linear: textures marked `srgb` are decoded when sampled, and the result
 * is converted for output like any particle colour.
 */
export interface MaterialGraph {
    textures: MaterialGraphTexture[];
    nodes: MaterialGraphNode[];
    /** Node giving the linear RGB colour (width 3). */
    color: number;
    /** Node giving alpha (width 1). */
    alpha: number;
    /** Node giving the alpha below which a fragment is discarded, when the material clips. */
    alphaClip?: number;
    /**
     * 'gamma' when the graph works in gamma space, as a Unity project in Gamma colour space does:
     * its colour then goes out as it is. Linear by default.
     */
    space?: 'linear' | 'gamma';
}

export interface MaterialGraphTexture {
    texture?: BaseTexture | null;
    /** The texture holds sRGB colour, decoded to linear when sampled. */
    srgb?: boolean;
    /** What an empty slot samples as. */
    color?: number[];
}

export interface MaterialGraphNode {
    op: string;
    type: 1 | 2 | 3 | 4;
    args?: number[];
    arg?: number;
    uv?: number;
    texture?: number;
    value?: number[];
    index?: number;
    channel?: number;
    mode?: string;
}

/** A generated fragment shader, and what the material must bind for it. */
export interface GraphFragment {
    glsl: string;
    wgsl: string;
    /** Sampler names, `graphTex<i>` per graph texture, plus `depthTexture` when it reads scene depth. */
    samplers: string[];
    uniforms: string[];
    /** Reads the fragment's screen position or the scene depth: needs the vertex stage's projPosition. */
    usesScreen: boolean;
    usesDepth: boolean;
}

export const GRAPH_UNIFORMS = ['graphTime', 'graphCamera', 'graphEye', 'graphForward'];

type Lang = 'glsl' | 'wgsl';

const SWIZZLE = 'xyzw';

function vecType(width: number, lang: Lang): string {
    if (lang === 'glsl') return width === 1 ? 'float' : `vec${width}`;
    return width === 1 ? 'f32' : `vec${width}f`;
}

function literal(v: number): string {
    if (!Number.isFinite(v)) return '0.0';
    const s = String(v);
    return /[.eE]/.test(s) ? s : s + '.0';
}

function isColorSlot(entry: MaterialGraphTexture | undefined): boolean {
    return entry !== undefined && !entry.texture && Array.isArray(entry.color);
}

/** Throws on a graph that does not hold together, rather than emitting shader code that will not compile. */
function check(condition: boolean, message: string): asserts condition {
    if (!condition) throw new Error(`material graph: ${message}`);
}

function reachable(graph: MaterialGraph): Set<number> {
    const keep = new Set<number>();
    const stack = [graph.color, graph.alpha];
    if (graph.alphaClip !== undefined) stack.push(graph.alphaClip);
    while (stack.length > 0) {
        const n = stack.pop()!;
        check(Number.isInteger(n) && n >= 0 && n < graph.nodes.length, `node ${n} out of range`);
        if (keep.has(n)) continue;
        keep.add(n);
        const node = graph.nodes[n];
        for (const dep of [
            ...(node.args ?? []),
            ...(node.arg !== undefined ? [node.arg] : []),
            ...(node.uv !== undefined ? [node.uv] : []),
        ]) {
            check(dep < n, `node ${n} reads node ${dep}, which comes after it`);
            stack.push(dep);
        }
    }
    return keep;
}

function expression(graph: MaterialGraph, n: number, lang: Lang, textureSrgb: boolean[]): string {
    const node = graph.nodes[n];
    const T = (w: number) => vecType(w, lang);
    const ref = (i: number) => `n${i}`;
    const width = (i: number) => graph.nodes[i].type;
    const args = (node.args ?? []).map(ref);
    const u = (name: string) => (lang === 'glsl' ? name : `uniforms.${name}`);
    const vin = (name: string) => (lang === 'glsl' ? name : `fragmentInputs.${name}`);
    const one = (w: number) => (w === 1 ? '1.0' : `${T(w)}(1.0)`);
    const projPosition = vin('projPosition');
    switch (node.op) {
        case 'const': {
            const v = (node.value ?? []).slice(0, node.type).map(literal);
            return node.type === 1 ? v[0] : `${T(node.type)}(${v.join(', ')})`;
        }
        case 'uv':
            return node.channel === 0 || node.channel === undefined
                ? `${T(4)}(${vin('vUV')}, 0.0, 1.0)`
                : `${T(4)}(0.0, 0.0, 0.0, 1.0)`;
        case 'vertexColor':
            return vin('vColor');
        case 'time':
            return u('graphTime');
        case 'cameraPlanes':
            return u('graphCamera');
        case 'cameraPosition':
            return u('graphEye');
        case 'cameraDirection':
            return u('graphForward');
        case 'screenPosition': {
            const ndc = `(${projPosition}.xy / ${projPosition}.w)`;
            switch (node.mode) {
                case 'raw':
                    return `${T(4)}((${projPosition}.xy + ${T(2)}(${projPosition}.w)) * 0.5, ${projPosition}.z, ${projPosition}.w)`;
                case 'center':
                    return `${T(4)}(${ndc}, 0.0, 0.0)`;
                case 'tiled':
                    return `${T(4)}(fract(${ndc} * 0.5 + 0.5), 0.0, 0.0)`;
                default:
                    return `${T(4)}(${ndc} * 0.5 + 0.5, 0.0, 0.0)`;
            }
        }
        case 'sceneDepth':
            return node.mode === 'raw'
                ? 'graphRawDepth()'
                : node.mode === 'eye'
                  ? 'graphEyeDepth()'
                  : `(graphEyeDepth() / ${u('graphCamera')}.y)`;
        case 'sample': {
            const slot = node.texture!;
            const entry = graph.textures[slot];
            check(entry !== undefined, `texture ${slot} missing`);
            if (isColorSlot(entry)) {
                const c = [0, 1, 2, 3].map((i) => literal(entry.color![i] ?? 0));
                return `${T(4)}(${c.join(', ')})`;
            }
            const uv = ref(node.uv!);
            const raw =
                lang === 'glsl'
                    ? `texture2D(graphTex${slot}, ${uv})`
                    : `textureSample(graphTex${slot}, graphTex${slot}Sampler, ${uv})`;
            return textureSrgb[slot] ? `graphDecode(${raw})` : raw;
        }
        case 'component':
            return `${ref(node.arg!)}.${SWIZZLE[node.index ?? 0]}`;
        case 'cast': {
            const from = width(node.arg!);
            const to = node.type;
            const a = ref(node.arg!);
            if (from === 1) return `${T(to)}(${a})`;
            if (from > to) return `${a}.${SWIZZLE.slice(0, to)}`;
            return `${T(to)}(${a}${', 0.0'.repeat(to - from)})`;
        }
        case 'combine':
            return `${T(node.type)}(${args.join(', ')})`;
        case 'add':
            return `(${args[0]} + ${args[1]})`;
        case 'sub':
            return `(${args[0]} - ${args[1]})`;
        case 'mul':
            return `(${args[0]} * ${args[1]})`;
        case 'div':
            return `(${args[0]} / ${args[1]})`;
        case 'pow':
        case 'min':
        case 'max':
        case 'step':
        case 'smoothstep':
        case 'clamp':
        case 'abs':
        case 'fract':
        case 'floor':
        case 'ceil':
        case 'sin':
        case 'cos':
        case 'sqrt':
            return `${node.op}(${args.join(', ')})`;
        case 'lerp':
            return `mix(${args.join(', ')})`;
        case 'normalize':
            return node.type === 1 ? `sign(${args[0]})` : `normalize(${args[0]})`;
        case 'saturate':
            return lang === 'glsl' ? `clamp(${args[0]}, 0.0, 1.0)` : `saturate(${args[0]})`;
        case 'oneMinus':
            return `(${one(node.type)} - ${args[0]})`;
        case 'negate':
            return `(-${args[0]})`;
        case 'round':
            return `floor(${args[0]} + 0.5)`;
        case 'reciprocal':
            return `(${one(node.type)} / ${args[0]})`;
        case 'mod': {
            // Shader Graph's Modulo is HLSL's fmod: the remainder keeps the dividend's sign.
            const q = `(${args[0]} / ${args[1]})`;
            return `(${args[0]} - ${args[1]} * (sign(${q}) * floor(abs(${q}))))`;
        }
        case 'dot':
            return width(node.args![0]) === 1 ? `(${args[0]} * ${args[1]})` : `dot(${args[0]}, ${args[1]})`;
        case 'length':
            return width(node.args![0]) === 1 ? `abs(${args[0]})` : `length(${args[0]})`;
        case 'select':
            return lang === 'glsl'
                ? `(${args[0]} > 0.5 ? ${args[1]} : ${args[2]})`
                : `select(${args[2]}, ${args[1]}, ${args[0]} > 0.5)`;
        case 'eq':
        case 'ne':
        case 'lt':
        case 'le':
        case 'gt':
        case 'ge': {
            const ops: Record<string, string> = {eq: '==', ne: '!=', lt: '<', le: '<=', gt: '>', ge: '>='};
            const test = `${args[0]} ${ops[node.op]} ${args[1]}`;
            return lang === 'glsl' ? `(${test} ? 1.0 : 0.0)` : `select(0.0, 1.0, ${test})`;
        }
    }
    throw new Error(`material graph: unknown operation '${node.op}'`);
}

// A linear graph's colour goes out linear for a post-processed scene and in gamma otherwise; a
// gamma graph's the other way round.
const OUTPUT_GLSL = {
    linear: `
#ifdef LINEAR_OUTPUT
    gl_FragColor = vec4(graphColor, graphAlpha);
#else
    gl_FragColor = vec4(quarksToGamma(graphColor), graphAlpha);
#endif`,
    gamma: `
#ifdef LINEAR_OUTPUT
    gl_FragColor = vec4(quarksToLinear(graphColor), graphAlpha);
#else
    gl_FragColor = vec4(graphColor, graphAlpha);
#endif`,
};

const OUTPUT_WGSL = {
    linear: `
#ifdef LINEAR_OUTPUT
    fragmentOutputs.color = vec4f(graphColor, graphAlpha);
#else
    fragmentOutputs.color = vec4f(quarksToGamma(graphColor), graphAlpha);
#endif`,
    gamma: `
#ifdef LINEAR_OUTPUT
    fragmentOutputs.color = vec4f(quarksToLinear(graphColor), graphAlpha);
#else
    fragmentOutputs.color = vec4f(graphColor, graphAlpha);
#endif`,
};

/**
 * The fragment shader a material graph draws with, in both languages. The vertex stage is the
 * render mode's usual one; it provides vUV and vColor, and projPosition when the graph reads the
 * screen or the scene depth (compile it with SOFT_PARTICLES then).
 */
export function buildGraphFragment(graph: MaterialGraph): GraphFragment {
    const keep = [...reachable(graph)].sort((a, b) => a - b);
    const used = keep.map((n) => graph.nodes[n]);
    const usesDepth = used.some((n) => n.op === 'sceneDepth');
    const usesScreen = usesDepth || used.some((n) => n.op === 'screenPosition');
    // A slot holding only a colour is folded into the code; every other one gets a sampler.
    const textureSlots = [
        ...new Set(
            used.filter((n) => n.op === 'sample' && !isColorSlot(graph.textures[n.texture!])).map((n) => n.texture!)
        ),
    ].sort((a, b) => a - b);
    const srgb = graph.textures.map((t) => t.srgb !== false);
    check(graph.nodes[graph.color]?.type === 3, 'colour output is not a 3-vector');
    check(graph.nodes[graph.alpha]?.type === 1, 'alpha output is not a scalar');

    const build = (lang: Lang): string => {
        const T = (w: number) => vecType(w, lang);
        const lines: string[] = [];
        if (lang === 'glsl') {
            lines.push('varying vec2 vUV;', 'varying vec4 vColor;');
            if (usesScreen) lines.push('varying vec4 projPosition;', 'varying float linearDepth;');
            lines.push(
                'uniform vec4 graphTime;',
                'uniform vec4 graphCamera;',
                'uniform vec3 graphEye;',
                'uniform vec3 graphForward;'
            );
            for (const slot of textureSlots) lines.push(`uniform sampler2D graphTex${slot};`);
            if (usesDepth) lines.push('uniform sampler2D depthTexture;');
            lines.push(srgbGlsl, 'vec4 graphDecode(vec4 c) { return vec4(quarksToLinear(c.rgb), c.a); }');
            if (usesDepth) {
                lines.push(
                    'float graphRawDepth() {',
                    '    vec2 uv = projPosition.xy / projPosition.w * 0.5 + 0.5;',
                    '    float depth = texture2D(depthTexture, uv).r;',
                    '    return graphCamera.w > 0.5 ? depth : 1.0;',
                    '}',
                    'float graphEyeDepth() {',
                    '    float n = graphCamera.x;',
                    '    float f = graphCamera.y;',
                    '    return (f * n) / (f - graphRawDepth() * (f - n));',
                    '}'
                );
            }
            lines.push('void main() {');
        } else {
            lines.push('varying vUV: vec2f;', 'varying vColor: vec4f;');
            if (usesScreen) lines.push('varying projPosition: vec4f;', 'varying linearDepth: f32;');
            lines.push(
                'uniform graphTime: vec4f;',
                'uniform graphCamera: vec4f;',
                'uniform graphEye: vec3f;',
                'uniform graphForward: vec3f;'
            );
            for (const slot of textureSlots)
                lines.push(`var graphTex${slot}Sampler: sampler;`, `var graphTex${slot}: texture_2d<f32>;`);
            if (usesDepth) lines.push('var depthTextureSampler: sampler;', 'var depthTexture: texture_2d<f32>;');
            lines.push(srgbWgsl, 'fn graphDecode(c: vec4f) -> vec4f { return vec4f(quarksToLinear(c.rgb), c.a); }');
            if (usesDepth) {
                lines.push(
                    'fn graphRawDepth(position: vec4f) -> f32 {',
                    '    let uv = position.xy / position.w * 0.5 + 0.5;',
                    '    let depth = textureSample(depthTexture, depthTextureSampler, uv).r;',
                    '    return select(1.0, depth, uniforms.graphCamera.w > 0.5);',
                    '}',
                    'fn graphEyeDepthOf(raw: f32) -> f32 {',
                    '    let n = uniforms.graphCamera.x;',
                    '    let f = uniforms.graphCamera.y;',
                    '    return (f * n) / (f - raw * (f - n));',
                    '}'
                );
            }
            lines.push('@fragment', 'fn main(input: FragmentInputs) -> FragmentOutputs {');
            if (usesDepth) {
                lines.push(
                    '    let graphRaw = graphRawDepth(fragmentInputs.projPosition);',
                    '    let graphEye = graphEyeDepthOf(graphRaw);'
                );
            }
        }
        for (const n of keep) {
            let expr = expression(graph, n, lang, srgb);
            if (lang === 'wgsl') {
                expr = expr.replace(/graphRawDepth\(\)/g, 'graphRaw').replace(/graphEyeDepth\(\)/g, 'graphEye');
                lines.push(`    let n${n}: ${T(graph.nodes[n].type)} = ${expr};`);
            } else {
                lines.push(`    ${T(graph.nodes[n].type)} n${n} = ${expr};`);
            }
        }
        const decl =
            lang === 'glsl'
                ? (name: string, w: number) => `    ${T(w)} ${name}`
                : (name: string, w: number) => `    let ${name}: ${T(w)}`;
        lines.push(`${decl('graphColor', 3)} = n${graph.color};`, `${decl('graphAlpha', 1)} = n${graph.alpha};`);
        if (graph.alphaClip !== undefined) {
            lines.push(`    if (graphAlpha < n${graph.alphaClip}) { discard; }`);
        }
        const space = graph.space === 'gamma' ? 'gamma' : 'linear';
        lines.push(lang === 'glsl' ? OUTPUT_GLSL[space] : OUTPUT_WGSL[space], '}');
        return lines.join('\n');
    };

    const samplers = textureSlots.map((slot) => `graphTex${slot}`);
    if (usesDepth) samplers.push('depthTexture');
    return {glsl: build('glsl'), wgsl: build('wgsl'), samplers, uniforms: [...GRAPH_UNIFORMS], usesScreen, usesDepth};
}

/** A stable short hash of a string, to name a generated shader after its source. */
export function sourceHash(source: string): string {
    let h = 2166136261;
    for (let i = 0; i < source.length; i++) {
        h ^= source.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
}
