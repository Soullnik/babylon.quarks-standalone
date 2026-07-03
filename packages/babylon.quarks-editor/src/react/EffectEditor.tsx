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
import {theme} from './theme';

/**
 * Shuriken-style stacked module editor for a babylon.quarks ParticleSystem.
 * Embed it anywhere React runs — the standalone examples page or a BabylonJS Editor plugin.
 */
export function EffectEditor(props: {binding: EffectBinding}) {
    useSyncExternalStore(
        (onStoreChange) => props.binding.subscribe(onStoreChange),
        () => props.binding.getRevision()
    );
    return (
        <div style={{fontFamily: theme.font, color: theme.text}}>
            <MainModule binding={props.binding} />
            <EmissionModule binding={props.binding} />
            <ShapeModule binding={props.binding} />
            <SizeOverLifeModule binding={props.binding} />
            <ColorOverLifeModule binding={props.binding} />
            <RendererModule binding={props.binding} />
        </div>
    );
}
