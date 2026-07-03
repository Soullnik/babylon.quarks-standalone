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
    ForceOverLifeModule,
    GravityModule,
    LimitSpeedOverLifeModule,
    NoiseModule,
    RotationOverLifeModule,
    SpeedOverLifeModule,
    TextureSheetModule,
} from './behaviorModules';
import {SubEmittersModule} from './SubEmittersModule';
import {theme} from './theme';

export interface EffectEditorProps {
    binding: EffectBinding;
    /** Texture presets offered in the Renderer module (host supplies the loader). */
    textureOptions?: TextureOption[];
    resolveTexture?: (url: string) => unknown;
}

/**
 * Shuriken-style stacked module editor for a babylon.quarks ParticleSystem.
 * Embed it anywhere React runs — the standalone examples page or a BabylonJS Editor plugin.
 * Module order mirrors Unity's Particle System inspector.
 */
export function EffectEditor(props: EffectEditorProps) {
    useSyncExternalStore(
        (onStoreChange) => props.binding.subscribe(onStoreChange),
        () => props.binding.getRevision()
    );
    const binding = props.binding;
    return (
        <div style={{fontFamily: theme.font, color: theme.text}}>
            <MainModule binding={binding} />
            <EmissionModule binding={binding} />
            <ShapeModule binding={binding} />
            <SpeedOverLifeModule binding={binding} />
            <LimitSpeedOverLifeModule binding={binding} />
            <ForceOverLifeModule binding={binding} />
            <GravityModule binding={binding} />
            <ColorOverLifeModule binding={binding} />
            <SizeOverLifeModule binding={binding} />
            <RotationOverLifeModule binding={binding} />
            <NoiseModule binding={binding} />
            <SubEmittersModule binding={binding} />
            <TextureSheetModule binding={binding} />
            <RendererModule binding={binding} textureOptions={props.textureOptions} resolveTexture={props.resolveTexture} />
        </div>
    );
}
