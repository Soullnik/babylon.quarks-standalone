import type {Texture} from '@babylonjs/core/Materials/Textures/texture.js';
import {useState} from 'react';
import {SelectField} from './fields.js';
import type {TextureOption} from './modules.js';
import {PromptDialog} from './PromptDialog.js';

/** A texture-like object the host's `resolveTexture` returned; only its `url` is read here. */
type TextureLike = {url?: string} | null | undefined;

/** The url a texture-like object was loaded from, or '' for none. */
export function textureUrlOf(texture: unknown): string {
    return (texture as TextureLike)?.url ?? '';
}

/**
 * Picks a texture for one slot: a host preset, a custom URL, a file from disk, or none. The
 * current texture stays selectable when it is not among the presets. Used by the Renderer
 * module for the map and for the ramp, mask and noise of the texture effects.
 */
export function TextureSelect(props: {
    /** The slot's current texture (anything with a `url`), or null for none. */
    value: unknown;
    textureOptions?: TextureOption[];
    /** Turns a URL or `data:` URI into a texture; null or undefined when it cannot. */
    loadTexture: (url: string) => Texture | null | undefined;
    /** The picked texture, or null for none. */
    onChange: (texture: Texture | null) => void;
    /** Label of the "none" entry. Default "(none)". */
    noneLabel?: string;
    /** Shows a thumbnail of the current texture under the select. Default false. */
    preview?: boolean;
    /** Title of the custom URL prompt. Default "Texture URL". */
    promptTitle?: string;
}) {
    const currentUrl = textureUrlOf(props.value);
    const options = props.textureOptions ?? [];
    const isPreset = options.some((o) => o.url === currentUrl);
    const [prompting, setPrompting] = useState(false);
    const apply = (url: string) => {
        const texture = props.loadTexture(url);
        if (texture) {
            props.onChange(texture);
        }
    };
    return (
        <>
            <SelectField
                value={!currentUrl ? '__none' : isPreset ? currentUrl : '__current'}
                options={[
                    {value: '__none', label: props.noneLabel ?? '(none)'},
                    ...(currentUrl && !isPreset
                        ? [{value: '__current', label: `(current) ${currentUrl.slice(-24)}`}]
                        : []),
                    ...options.map((o) => ({value: o.url, label: o.label})),
                    {value: '__url', label: 'Custom URL…'},
                    {value: '__file', label: 'Load from file…'},
                ]}
                onChange={(url) => {
                    if (url === '__current') {
                        return;
                    }
                    if (url === '__none') {
                        props.onChange(null);
                        return;
                    }
                    if (url === '__url') {
                        setPrompting(true);
                        return;
                    }
                    if (url === '__file') {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/*';
                        input.onchange = () => {
                            const file = input.files?.[0];
                            if (!file) {
                                return;
                            }
                            const reader = new FileReader();
                            reader.onload = () => apply(reader.result as string);
                            reader.readAsDataURL(file);
                        };
                        input.click();
                        return;
                    }
                    apply(url);
                }}
            />
            {prompting && (
                <PromptDialog
                    title={props.promptTitle ?? 'Texture URL'}
                    defaultValue={currentUrl}
                    placeholder="https://…"
                    onSubmit={(url) => {
                        apply(url);
                        setPrompting(false);
                    }}
                    onCancel={() => setPrompting(false)}
                />
            )}
            {props.preview && currentUrl && (
                <img
                    src={currentUrl}
                    alt="texture preview"
                    style={{
                        width: 64,
                        height: 64,
                        marginTop: 6,
                        objectFit: 'contain',
                        borderRadius: 6,
                        border: '1px solid #2b3761',
                        background: 'repeating-conic-gradient(#2a3252 0% 25%, #171d33 0% 50%) 0 0 / 12px 12px',
                    }}
                />
            )}
        </>
    );
}
