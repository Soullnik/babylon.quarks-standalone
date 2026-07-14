import {SceneLoader} from "@babylonjs/core/Loading/sceneLoader";
import {VertexBuffer} from "@babylonjs/core/Buffers/buffer";
import type {Scene} from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF";
import {QuarksEffectEditor} from "babylon.quarks-editor/react";
import type {GeometryData} from "babylon.quarks-editor/react";
import {SHARED_ASSETS, createSharedTexture} from "./shared/common";

/** ?effect=session reads a JSON stashed by the demo viewer's "Open in editor" button. */
function resolveInitialEffect(): unknown {
    const param = new URLSearchParams(window.location.search).get("effect");
    if (param === "session") {
        const stored = sessionStorage.getItem("quarks-editor-effect");
        if (stored) {
            return JSON.parse(stored);
        }
    }
    return undefined;
}

/** Loads a user GLB/glTF and returns its first mesh's vertex buffers for the Mesh render mode. */
async function loadGeometryFromFile(file: File, scene: Scene): Promise<GeometryData> {
    const ext = file.name.toLowerCase().endsWith(".gltf") ? ".gltf" : ".glb";
    const result = await SceneLoader.ImportMeshAsync("", "", file, scene, null, ext);
    try {
        const mesh = result.meshes.find(
            (m) => m.getTotalVertices() > 0 && m.getVerticesData(VertexBuffer.PositionKind)
        );
        if (!mesh) {
            throw new Error("No mesh with geometry found in the file");
        }
        const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
        const normals = mesh.getVerticesData(VertexBuffer.NormalKind);
        const uvs = mesh.getVerticesData(VertexBuffer.UVKind);
        const indices = mesh.getIndices();
        return {
            positions: new Float32Array(positions),
            indices: indices ? new Uint32Array(indices) : undefined,
            uvs: uvs ? new Float32Array(uvs) : undefined,
            normals: normals ? new Float32Array(normals) : undefined,
        };
    } finally {
        // The imported nodes were only needed to read geometry; drop them from the live scene.
        result.meshes.forEach((m) => m.dispose());
        result.skeletons?.forEach((s) => s.dispose());
        result.transformNodes?.forEach((t) => t.dispose());
    }
}

QuarksEffectEditor.Show({
    effectJson: resolveInitialEffect(),
    hostElement: document.getElementById("editor-host")!,
    title: "Effect editor",
    backLink: {href: "./index.html", label: "gallery"},
    textureOptions: [
        {label: "Default particle", url: SHARED_ASSETS.defaultParticle},
        {label: "Texture atlas 1", url: SHARED_ASSETS.atlas},
        {label: "Texture atlas 2", url: SHARED_ASSETS.atlasSecondary},
        {label: "Smoke (4x4 sheet)", url: SHARED_ASSETS.smoke},
    ],
    resolveTexture: (url, scene) => createSharedTexture(scene, url),
    resolveGeometry: loadGeometryFromFile,
    // Debug/testing hook: lets the console (and smoke tests) reach the live binding.
    onReady: (handle) => {
        (window as never as {__quarksEditor: unknown}).__quarksEditor = handle;
    },
});
