import {QuarksEffectEditor} from "babylon.quarks-editor/react";
import {SHARED_ASSETS, createSharedTexture} from "./shared/common";

QuarksEffectEditor.Show({
    hostElement: document.getElementById("editor-host")!,
    title: "Effect editor",
    textureOptions: [
        {label: "Default particle", url: SHARED_ASSETS.defaultParticle},
        {label: "Texture atlas 1", url: SHARED_ASSETS.atlas},
        {label: "Texture atlas 2", url: SHARED_ASSETS.atlasSecondary},
        {label: "Smoke (4x4 sheet)", url: SHARED_ASSETS.smoke},
    ],
    resolveTexture: (url, scene) => createSharedTexture(scene, url),
    effectPresets: [
        {label: "Explosion (Unity export)", url: "ps.json"},
        {label: "Acid Boiling", url: "AcidBoiling.json"},
        {label: "Sub Emitter", url: "subEmitter2.json"},
    ],
    // Debug/testing hook: lets the console (and smoke tests) reach the live binding.
    onReady: (handle) => {
        (window as never as {__quarksEditor: unknown}).__quarksEditor = handle;
    },
});
