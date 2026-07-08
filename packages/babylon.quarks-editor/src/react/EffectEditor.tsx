import React, {useSyncExternalStore} from 'react';
import {EffectBinding} from '../core/binding';
import {
    ColorOverLifeModule,
    EmissionModule,
    MainModule,
    RendererModule,
    ShapeModule,
    SizeOverLifeModule,
} from './modules';
import type {GeometryData, GeometryOption, TextureOption} from './modules';
import {
    CollisionModule,
    ColorBySpeedModule,
    EmitDirectionModule,
    ForceOverLifeModule,
    GravityModule,
    InheritVelocityModule,
    LimitSpeedOverLifeModule,
    NoiseModule,
    OrbitOverLifeModule,
    RotationBySpeedModule,
    RotationOverLifeModule,
    SizeBySpeedModule,
    SpeedOverLifeModule,
    TextureSheetModule,
    TurbulenceModule,
    VelocityOverLifeModule,
    WidthOverTrailModule,
} from './behaviorModules';
import {SubEmittersModule} from './SubEmittersModule';
import {theme} from './theme';
import type {ParticleSystem} from 'babylon.quarks';

export interface EffectEditorProps {
    binding: EffectBinding;
    /** Currently selected system, lifted up so the timeline panel and this module stack agree. */
    selectedSystem: ParticleSystem;
    /** Texture presets offered in the Renderer module (host supplies the loader). */
    textureOptions?: TextureOption[];
    /** Mesh presets offered for the Mesh render mode (host supplies the geometry buffers). */
    geometryOptions?: GeometryOption[];
    resolveTexture?: (url: string) => unknown;
    /** Host loader for "Load from file…" in the Mesh render mode (e.g. a GLB importer). */
    resolveGeometry?: (file: File) => Promise<GeometryData>;
}

/**
 * Shuriken-style effect editor: a stacked module inspector for the selected system.
 * Embed it anywhere React runs — the standalone examples page or a BabylonJS Editor plugin.
 * Module order mirrors Unity's Particle System inspector.
 */
export function EffectEditor(props: EffectEditorProps) {
    useSyncExternalStore(
        (onStoreChange) => props.binding.subscribe(onStoreChange),
        () => props.binding.getRevision()
    );
    const allSystems = [props.binding.system, ...props.binding.subSystems];
    // Selection survives re-renders but falls back to root if the system was removed/replaced.
    const activeSystem = allSystems.includes(props.selectedSystem) ? props.selectedSystem : props.binding.system;

    // Inspector edits go through a per-system binding; changes route into the root
    // binding's undo history and re-render via the subscription below.
    const binding = React.useMemo(() => {
        if (activeSystem === props.binding.system) {
            return props.binding;
        }
        const nested = new EffectBinding(activeSystem);
        nested.onBeforeChange = () => props.binding.onBeforeChange?.();
        return nested;
    }, [props.binding, activeSystem]);
    useSyncExternalStore(
        (onStoreChange) => binding.subscribe(onStoreChange),
        () => binding.getRevision()
    );

    return (
        <div style={{fontFamily: theme.font, color: theme.text}}>
            <MainModule binding={binding} />
            <EmissionModule binding={binding} />
            <ShapeModule binding={binding} />
            <EmitDirectionModule binding={binding} />
            <VelocityOverLifeModule binding={binding} />
            <SpeedOverLifeModule binding={binding} />
            <LimitSpeedOverLifeModule binding={binding} />
            <InheritVelocityModule binding={binding} />
            <ForceOverLifeModule binding={binding} />
            <GravityModule binding={binding} />
            <OrbitOverLifeModule binding={binding} />
            <ColorOverLifeModule binding={binding} />
            <ColorBySpeedModule binding={binding} />
            <SizeOverLifeModule binding={binding} />
            <SizeBySpeedModule binding={binding} />
            <RotationOverLifeModule binding={binding} />
            <RotationBySpeedModule binding={binding} />
            <NoiseModule binding={binding} />
            <TurbulenceModule binding={binding} />
            <CollisionModule binding={binding} />
            <WidthOverTrailModule binding={binding} />
            <SubEmittersModule binding={binding} rootBinding={props.binding} />
            <TextureSheetModule binding={binding} />
            <RendererModule
                binding={binding}
                textureOptions={props.textureOptions}
                geometryOptions={props.geometryOptions}
                resolveTexture={props.resolveTexture}
                resolveGeometry={props.resolveGeometry}
            />
        </div>
    );
}
