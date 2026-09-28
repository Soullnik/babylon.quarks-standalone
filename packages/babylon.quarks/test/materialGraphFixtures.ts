/**
 * Material graphs for tests and for the WGSL validation page: one reading every operation and
 * input the shader generator knows, and the smallest useful one.
 */
import type {MaterialGraph, MaterialGraphNode} from '../src/materialGraph';

type Width = 1 | 2 | 3 | 4;

/** Builds a graph node by node, each call returning the new node's index. */
class GraphBuilder {
    readonly nodes: MaterialGraphNode[] = [];

    node(node: MaterialGraphNode): number {
        return this.nodes.push(node) - 1;
    }

    const(...value: number[]): number {
        return this.node({op: 'const', type: value.length as Width, value});
    }

    op(op: string, type: Width, ...args: number[]): number {
        return this.node({op, type, args});
    }

    cast(arg: number, type: Width): number {
        return this.node({op: 'cast', type, arg});
    }

    component(arg: number, index: number): number {
        return this.node({op: 'component', type: 1, arg, index});
    }
}

/**
 * Every operation, every input (UV, particle colour, time, camera, screen position and scene depth
 * in each mode) and every kind of texture slot: sRGB, linear and a folded constant colour.
 */
export function kitchenSinkGraph(space?: 'linear' | 'gamma'): MaterialGraph {
    const b = new GraphBuilder();
    const uv4 = b.node({op: 'uv', type: 4, channel: 0});
    const uv1 = b.node({op: 'uv', type: 4, channel: 1});
    const uv = b.cast(uv4, 2);
    const time = b.node({op: 'time', type: 4});
    const t = b.component(time, 0);
    const scroll = b.op('mul', 2, b.const(0.1, 0.2), b.cast(t, 2));
    const scrolled = b.op('add', 2, b.op('add', 2, uv, scroll), b.cast(uv1, 2));
    const main = b.node({op: 'sample', type: 4, texture: 0, uv: scrolled});
    const noise = b.node({op: 'sample', type: 4, texture: 1, uv});
    const blank = b.node({op: 'sample', type: 4, texture: 2, uv});
    const vertex = b.node({op: 'vertexColor', type: 4});
    const mixed = b.op('mul', 4, b.op('mul', 4, b.op('mul', 4, main, noise), blank), vertex);

    // One scalar run through every operation.
    const s = b.component(mixed, 3);
    const half = b.const(0.5);
    const one = b.const(1);
    const zero = b.const(0);
    let x = b.op('pow', 1, s, half);
    x = b.op('min', 1, x, one);
    x = b.op('max', 1, x, zero);
    x = b.op('step', 1, half, x);
    x = b.op('smoothstep', 1, zero, one, x);
    x = b.op('clamp', 1, x, zero, one);
    for (const op of [
        'abs',
        'fract',
        'floor',
        'ceil',
        'sin',
        'cos',
        'sqrt',
        'saturate',
        'oneMinus',
        'negate',
        'round',
    ]) {
        x = b.op(op, 1, x);
    }
    x = b.op('normalize', 1, x);
    x = b.op('reciprocal', 1, b.op('add', 1, x, b.const(2)));
    x = b.op('mod', 1, x, b.const(0.3));
    x = b.op('div', 1, b.op('sub', 1, x, half), b.const(4));
    x = b.op('lerp', 1, x, one, half);
    for (const op of ['eq', 'ne', 'lt', 'le', 'gt', 'ge']) {
        x = b.op('add', 1, x, b.op(op, 1, x, half));
    }
    x = b.op('select', 1, b.op('gt', 1, x, half), x, half);

    // Vector forms, the camera and the screen.
    const rgb = b.cast(mixed, 3);
    const eye = b.node({op: 'cameraPosition', type: 3});
    const forward = b.node({op: 'cameraDirection', type: 3});
    const planes = b.node({op: 'cameraPlanes', type: 4});
    const facing = b.op('dot', 1, b.op('normalize', 3, eye), forward);
    const reach = b.op('length', 1, b.op('sub', 3, rgb, eye));
    const screen = ['default', 'raw', 'center', 'tiled'].map((mode) => b.node({op: 'screenPosition', type: 4, mode}));
    const depth = ['linear01', 'raw', 'eye'].map((mode) => b.node({op: 'sceneDepth', type: 1, mode}));
    let screenSum = b.component(planes, 1);
    for (const p of screen) screenSum = b.op('add', 1, screenSum, b.component(p, 3));
    for (const d of depth) screenSum = b.op('add', 1, screenSum, d);
    const glow = b.op('dot', 1, b.op('mul', 1, facing, reach), screenSum);
    const tintVec = b.node({op: 'combine', type: 3, args: [x, glow, b.op('oneMinus', 1, x)]});
    const color = b.op('lerp', 3, rgb, tintVec, b.cast(half, 3));
    const alpha = b.op('saturate', 1, b.op('mul', 1, s, x));
    // A node nothing reads, which the generator must drop.
    b.op('sin', 1, s);
    return {
        textures: [{srgb: true}, {srgb: false}, {color: [1, 0.5, 0.25, 1]}],
        nodes: b.nodes,
        color,
        alpha,
        alphaClip: b.const(0.01),
        ...(space ? {space} : {}),
    };
}

/** A texture times the particle colour: no screen, no depth. */
export function minimalGraph(): MaterialGraph {
    const b = new GraphBuilder();
    const uv = b.cast(b.node({op: 'uv', type: 4, channel: 0}), 2);
    const main = b.op('mul', 4, b.node({op: 'sample', type: 4, texture: 0, uv}), b.node({op: 'vertexColor', type: 4}));
    return {textures: [{srgb: true}], nodes: b.nodes, color: b.cast(main, 3), alpha: b.component(main, 3)};
}
