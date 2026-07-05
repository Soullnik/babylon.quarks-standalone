import React, {useEffect, useReducer, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Engine} from '@babylonjs/core/Engines/engine';
import {Scene} from '@babylonjs/core/scene';
import {ArcRotateCamera} from '@babylonjs/core/Cameras/arcRotateCamera';
import {Vector3 as BVector3} from '@babylonjs/core/Maths/math.vector';
import {Color4} from '@babylonjs/core/Maths/math.color';
import type {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {
    BatchedRenderer,
    ColorOverLife,
    ConeEmitter,
    ConstantColor,
    ConstantValue,
    IntervalValue,
    ParticleSystem,
    RenderMode,
    Vector4,
} from 'babylon.quarks';
import {EffectBinding} from '../core/binding';
import {EffectHistory} from '../core/history';
import {loadEffectFromJson} from '../core/loadEffect';
import {DEFAULT_GRADIENT_STOPS, buildGradient} from '../core/colors';
import {EffectEditor} from './EffectEditor';
import type {TextureOption} from './modules';
import {buttonStyle, theme} from './theme';

export interface EffectEditorHostHandle {
    binding: EffectBinding;
    history: EffectHistory;
    scene: Scene;
    renderer: BatchedRenderer;
    importJson: (json: unknown) => void;
    exportJson: () => string;
}

export interface EffectEditorHostProps {
    /** Quarks JSON export to open; a default effect is created when omitted. */
    effectJson?: unknown;
    /** When set, a Save button appears and receives the serialized effect. */
    onSave?: (json: string) => void;
    /** Called once the engine/scene/binding are live (and after every import). */
    onReady?: (handle: EffectEditorHostHandle) => void;
    title?: string;
    textureOptions?: TextureOption[];
    resolveTexture?: (url: string, scene: Scene) => unknown;
}

function createDefaultEffect(scene: Scene, resolveTexture?: (url: string, scene: Scene) => unknown, textureUrl?: string): ParticleSystem {
    const system = new ParticleSystem({
        scene,
        duration: 4,
        looping: true,
        startLife: new IntervalValue(1.2, 1.8),
        startSpeed: new IntervalValue(3, 5),
        startSize: new IntervalValue(0.25, 0.5),
        startColor: new ConstantColor(new Vector4(1, 1, 1, 1)),
        emissionOverTime: new ConstantValue(80),
        shape: new ConeEmitter({radius: 0.3, angle: 0.5}),
        renderMode: RenderMode.BillBoard,
        texture: (textureUrl && resolveTexture ? resolveTexture(textureUrl, scene) : undefined) as never,
        transparent: true,
        blendMode: 1,
    });
    system.addBehavior(new ColorOverLife(buildGradient(DEFAULT_GRADIENT_STOPS)));
    return system;
}

/** Disposes an effect's systems and its remaining group tree (otherwise the groups leak). */
function disposeEffect(root: TransformNode, systems: ParticleSystem[], renderer: BatchedRenderer): void {
    for (const system of systems) {
        renderer.deleteSystem(system);
        system.dispose();
    }
    // Disposing the systems already disposed their emitter nodes; dispose the leftover group
    // tree too. Skip when the root IS a disposed emitter (default single-system effect).
    if (!systems.some((system) => system.emitter === root)) {
        root.dispose(false, true);
    }
}

/**
 * Self-contained effect editor: live Babylon preview + hierarchy/inspector sidebar.
 * Designed for embedding — see QuarksEffectEditor.Show for the NME-style entry point.
 */
export function EffectEditorHost(props: EffectEditorHostProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const counterRef = useRef<HTMLSpanElement>(null);
    const importRef = useRef<HTMLInputElement>(null);
    const stateRef = useRef<{engine: Engine; scene: Scene; renderer: BatchedRenderer; binding: EffectBinding; history: EffectHistory} | null>(null);
    const [binding, setBinding] = useState<EffectBinding | null>(null);
    const [, force] = useReducer((x: number) => x + 1, 0);
    const playbackRef = useRef({paused: false, speed: 1, stepQueued: false, elapsed: 0});
    const [paused, setPaused] = useState(false);
    const [speed, setSpeed] = useState(1);

    useEffect(() => {
        const engine = new Engine(canvasRef.current!, true);
        const scene = new Scene(engine);
        scene.clearColor = new Color4(0.03, 0.04, 0.09, 1);
        const camera = new ArcRotateCamera('cam', -Math.PI / 2, 1.15, 9, new BVector3(0, 1.4, 0), scene);
        camera.attachControl(canvasRef.current!, true);
        camera.wheelDeltaPercentage = 0.01;
        const renderer = new BatchedRenderer('quarks-editor', scene);
        const history = new EffectHistory();

        const mount = (nextBinding: EffectBinding) => {
            history.attach(nextBinding);
            nextBinding.subscribe(force);
            stateRef.current = {engine, scene, renderer, binding: nextBinding, history};
            setBinding(nextBinding);
            props.onReady?.(makeHandle());
        };

        const makeHandle = (): EffectEditorHostHandle => ({
            // Live getter: stays correct after presets/imports/undo replace the binding.
            get binding() {
                return stateRef.current!.binding;
            },
            history,
            scene,
            renderer,
            importJson,
            exportJson: () => stateRef.current!.binding.exportJSON('EditorEffect'),
        });

        const importJson = (json: unknown) => {
            const current = stateRef.current!.binding;
            // Load first so a bad/empty JSON leaves the current effect intact.
            const {root, systems} = loadEffectFromJson(scene, renderer, json);
            if (systems.length === 0) {
                disposeEffect(root, systems, renderer);
                throw new Error('No particle systems found in the JSON.');
            }
            disposeEffect(current.root, [current.system, ...current.subSystems], renderer);
            const main = systems.find((s) => !s.onlyUsedByOther) ?? systems[0];
            mount(new EffectBinding(main, systems.filter((s) => s !== main), root));
        };

        let initial: EffectBinding;
        if (props.effectJson) {
            const {root, systems} = loadEffectFromJson(scene, renderer, props.effectJson);
            const main = systems.find((s) => !s.onlyUsedByOther) ?? systems[0];
            initial = new EffectBinding(main, systems.filter((s) => s !== main), root);
        } else {
            const system = createDefaultEffect(scene, props.resolveTexture, props.textureOptions?.[0]?.url);
            renderer.addSystem(system);
            initial = new EffectBinding(system);
        }
        mount(initial);

        engine.runRenderLoop(() => {
            const playback = playbackRef.current;
            let delta = (engine.getDeltaTime() / 1000) * playback.speed;
            if (playback.paused) {
                delta = playback.stepQueued ? 1 / 60 : 0;
                playback.stepQueued = false;
            }
            if (delta > 0) {
                renderer.update(delta);
                playback.elapsed += delta;
            }
            scene.render();
            const b = stateRef.current!.binding;
            let count = b.system.particleNum;
            for (const sub of b.subSystems) {
                count += sub.particleNum;
            }
            if (counterRef.current) {
                counterRef.current.textContent = `${count} particles · ${playback.elapsed.toFixed(2)}s`;
            }
        });

        const onResize = () => engine.resize();
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                const json = e.shiftKey ? history.redo() : history.undo();
                if (json) {
                    importJson(json);
                }
                force();
            }
        };
        window.addEventListener('resize', onResize);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('resize', onResize);
            window.removeEventListener('keydown', onKey);
            engine.dispose();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const state = stateRef.current;
    const historyAction = (json: unknown | null) => {
        if (json && state) {
            const current = state.binding;
            const {root, systems} = loadEffectFromJson(state.scene, state.renderer, json);
            disposeEffect(current.root, [current.system, ...current.subSystems], state.renderer);
            const main = systems.find((s) => !s.onlyUsedByOther) ?? systems[0];
            const next = new EffectBinding(main, systems.filter((s) => s !== main), root);
            state.history.attach(next);
            next.subscribe(force);
            state.binding = next;
            setBinding(next);
        }
        force();
    };

    const overlayButton: React.CSSProperties = {
        ...buttonStyle,
        background: 'rgba(20, 30, 60, 0.55)',
        padding: '6px 10px',
        minWidth: 34,
    };

    return (
        <div style={{display: 'flex', width: '100%', height: '100%', fontFamily: theme.font, color: theme.text, background: '#070b16'}}>
            <div style={{position: 'relative', flex: 1, minWidth: 0}}>
                <canvas ref={canvasRef} style={{width: '100%', height: '100%', display: 'block', touchAction: 'none', outline: 'none'}} />
                {/* Unity-style playback bar floating over the viewport. */}
                <div
                    style={{
                        position: 'absolute',
                        top: 12,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 8px',
                        borderRadius: 12,
                        border: `1px solid ${theme.border}`,
                        background: 'rgba(7, 11, 22, 0.72)',
                        backdropFilter: 'blur(10px)',
                        WebkitBackdropFilter: 'blur(10px)',
                    }}
                >
                    <button
                        style={overlayButton}
                        title={paused ? 'Play' : 'Pause'}
                        onClick={() => {
                            playbackRef.current.paused = !paused;
                            setPaused(!paused);
                        }}
                    >
                        {paused ? '▶' : '⏸'}
                    </button>
                    <button style={overlayButton} title="Step one frame" disabled={!paused} onClick={() => (playbackRef.current.stepQueued = true)}>
                        ⏭
                    </button>
                    <button
                        style={overlayButton}
                        title="Restart"
                        onClick={() => {
                            binding?.restart();
                            playbackRef.current.elapsed = 0;
                        }}
                    >
                        ⟲
                    </button>
                    <select
                        style={{...overlayButton, padding: '6px 4px'}}
                        title="Playback speed"
                        value={speed}
                        onChange={(e) => {
                            const next = Number(e.target.value);
                            playbackRef.current.speed = next;
                            setSpeed(next);
                        }}
                    >
                        {[0.1, 0.25, 0.5, 1, 2, 4].map((s) => (
                            <option key={s} value={s}>
                                ×{s}
                            </option>
                        ))}
                    </select>
                    <span ref={counterRef} style={{fontSize: 12, color: theme.textDim, fontVariantNumeric: 'tabular-nums', paddingLeft: 4, minWidth: 120}} />
                </div>
            </div>
            <aside style={{width: 340, flexShrink: 0, borderLeft: `1px solid ${theme.border}`, background: theme.panelBg, display: 'flex', flexDirection: 'column'}}>
                <div style={{padding: '12px 14px 10px', borderBottom: `1px solid ${theme.border}`}}>
                    <div style={{fontSize: 16, fontWeight: 600}}>{props.title ?? 'Effect editor'}</div>
                    <div style={{display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10}}>
                        <button style={buttonStyle} title="Undo (Ctrl+Z)" disabled={!state?.history.canUndo} onClick={() => historyAction(state!.history.undo())}>↶</button>
                        <button style={buttonStyle} title="Redo (Ctrl+Shift+Z)" disabled={!state?.history.canRedo} onClick={() => historyAction(state!.history.redo())}>↷</button>
                        <button
                            style={buttonStyle}
                            onClick={() => {
                                if (!binding) return;
                                const blob = new Blob([binding.exportJSON('EditorEffect')], {type: 'application/json'});
                                const link = document.createElement('a');
                                link.href = URL.createObjectURL(blob);
                                link.download = 'effect.json';
                                link.click();
                                URL.revokeObjectURL(link.href);
                            }}
                        >
                            Export
                        </button>
                        <button style={buttonStyle} onClick={() => importRef.current?.click()}>Import</button>
                        {props.onSave && (
                            <button style={buttonStyle} onClick={() => binding && props.onSave!(binding.exportJSON('EditorEffect'))}>
                                Save
                            </button>
                        )}
                        <input
                            ref={importRef}
                            type="file"
                            accept=".json,application/json"
                            hidden
                            onChange={async (e) => {
                                const file = e.target.files?.[0];
                                e.target.value = '';
                                if (!file || !state) return;
                                try {
                                    const json = JSON.parse(await file.text());
                                    historyAction(json);
                                    state.history.clear();
                                    force();
                                } catch (err) {
                                    console.error('Failed to import effect JSON:', err);
                                }
                            }}
                        />
                    </div>
                </div>
                <div style={{flex: 1, overflowY: 'auto', padding: '6px 14px 20px'}}>
                    {binding && (
                        <EffectEditor
                            binding={binding}
                            textureOptions={props.textureOptions}
                            resolveTexture={props.resolveTexture && state ? (url) => props.resolveTexture!(url, state.scene) : undefined}
                        />
                    )}
                </div>
            </aside>
        </div>
    );
}

/** NME-style imperative entry point for hosts like BabylonJS Editor windows. */
export const QuarksEffectEditor = {
    Show(options: EffectEditorHostProps & {hostElement: HTMLElement}): {dispose: () => void} {
        const {hostElement, ...props} = options;
        const root = createRoot(hostElement);
        root.render(<EffectEditorHost {...props} />);
        return {dispose: () => root.unmount()};
    },
};
