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
import type {TextureOption} from './modules';
import {
    ColorBySpeedModule,
    ForceOverLifeModule,
    GravityModule,
    LimitSpeedOverLifeModule,
    NoiseModule,
    OrbitOverLifeModule,
    RotationBySpeedModule,
    RotationOverLifeModule,
    SizeBySpeedModule,
    SpeedOverLifeModule,
    TextureSheetModule,
    WidthOverTrailModule,
} from './behaviorModules';
import {SubEmittersModule} from './SubEmittersModule';
import {EffectHierarchy} from './EffectHierarchy';
import {theme} from './theme';

export interface EffectEditorProps {
    binding: EffectBinding;
    /** Texture presets offered in the Renderer module (host supplies the loader). */
    textureOptions?: TextureOption[];
    resolveTexture?: (url: string) => unknown;
}

/**
 * Shuriken-style effect editor: a Unity-like hierarchy of systems (root + children)
 * with a stacked module inspector for the selected system. Embed it anywhere React
 * runs — the standalone examples page or a BabylonJS Editor plugin.
 * Module order mirrors Unity's Particle System inspector.
 */
export function EffectEditor(props: EffectEditorProps) {
    useSyncExternalStore(
        (onStoreChange) => props.binding.subscribe(onStoreChange),
        () => props.binding.getRevision()
    );
    const [selectedIndex, setSelectedIndex] = React.useState(0);
    const systems = [props.binding.system, ...props.binding.subSystems];
    const clampedIndex = Math.min(selectedIndex, systems.length - 1);
    const selectedSystem = systems[clampedIndex];

    // Inspector edits go through a per-system binding; changes route into the root
    // binding's undo history and re-render via the subscription below.
    const binding = React.useMemo(() => {
        if (clampedIndex === 0) {
            return props.binding;
        }
        const nested = new EffectBinding(selectedSystem);
        nested.onBeforeChange = () => props.binding.onBeforeChange?.();
        return nested;
    }, [props.binding, selectedSystem, clampedIndex]);
    useSyncExternalStore(
        (onStoreChange) => binding.subscribe(onStoreChange),
        () => binding.getRevision()
    );

    return (
        <div style={{fontFamily: theme.font, color: theme.text}}>
            <EffectHierarchy binding={props.binding} selectedIndex={clampedIndex} onSelect={setSelectedIndex} />
            <MainModule binding={binding} />
            <EmissionModule binding={binding} />
            <ShapeModule binding={binding} />
            <SpeedOverLifeModule binding={binding} />
            <LimitSpeedOverLifeModule binding={binding} />
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
            <WidthOverTrailModule binding={binding} />
            <SubEmittersModule binding={binding} rootBinding={props.binding} />
            <TextureSheetModule binding={binding} />
            <RendererModule binding={binding} textureOptions={props.textureOptions} resolveTexture={props.resolveTexture} />
        </div>
    );
}
