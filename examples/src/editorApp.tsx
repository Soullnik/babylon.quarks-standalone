import {VertexBuffer} from '@babylonjs/core/Buffers/buffer';
import {SceneLoader} from '@babylonjs/core/Loading/sceneLoader';
import type {Scene} from '@babylonjs/core/scene';
import type {GeometryData} from 'babylon.quarks-editor/react';
import {QuarksEditorWorkspace, QuarksEffectEditor} from 'babylon.quarks-editor/react';
import {SHARED_ASSETS, createSharedTexture} from './shared/common';
import './shared/loaders';

/** ?effect=session reads a JSON stashed by the demo viewer's "Open in editor" button. */
function resolveInitialEffect(): unknown {
    const param = new URLSearchParams(window.location.search).get('effect');
    if (param === 'session') {
        const stored = sessionStorage.getItem('quarks-editor-effect');
        if (stored) {
            return JSON.parse(stored);
        }
    }
    return undefined;
}

/** Loads a user GLB/glTF and returns its first mesh's vertex buffers for the Mesh render mode. */
async function loadGeometryFromFile(file: File, scene: Scene): Promise<GeometryData> {
    const ext = file.name.toLowerCase().endsWith('.gltf') ? '.gltf' : '.glb';
    const result = await SceneLoader.ImportMeshAsync('', '', file, scene, null, ext);
    try {
        const mesh = result.meshes.find(
            (m) => m.getTotalVertices() > 0 && m.getVerticesData(VertexBuffer.PositionKind)
        );
        if (!mesh) {
            throw new Error('No mesh with geometry found in the file');
        }
        const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
        const normals = mesh.getVerticesData(VertexBuffer.NormalKind);
        const uvs = mesh.getVerticesData(VertexBuffer.UVKind);
        const uvs2 = mesh.getVerticesData(VertexBuffer.UV2Kind);
        const indices = mesh.getIndices();
        return {
            positions: new Float32Array(positions),
            indices: indices ? new Uint32Array(indices) : undefined,
            uvs: uvs ? new Float32Array(uvs) : undefined,
            uvs2: uvs2 ? new Float32Array(uvs2) : undefined,
            normals: normals ? new Float32Array(normals) : undefined,
        };
    } finally {
        // The imported nodes were only needed to read geometry; drop them from the live scene.
        result.meshes.forEach((m) => m.dispose());
        result.skeletons?.forEach((s) => s.dispose());
        result.transformNodes?.forEach((t) => t.dispose());
    }
}

const editorProps = {
    hostElement: document.getElementById('editor-host')!,
    title: 'Effect editor',
    backLink: {href: './index.html', label: 'gallery'},
    textureOptions: [
        {label: 'Default particle', url: SHARED_ASSETS.defaultParticle},
        {label: 'Texture atlas 1', url: SHARED_ASSETS.atlas},
        {label: 'Texture atlas 2', url: SHARED_ASSETS.atlasSecondary},
        {label: 'Smoke (4x4 sheet)', url: SHARED_ASSETS.smoke},
    ],
    resolveTexture: (url: string, scene: Scene) => createSharedTexture(scene, url),
    resolveGeometry: loadGeometryFromFile,
    // Debug/testing hook: lets the console (and smoke tests) reach the live binding.
    onReady: (handle: unknown) => {
        (window as never as {__quarksEditor: unknown}).__quarksEditor = handle;
    },
};

const initialEffect = resolveInitialEffect();
if (initialEffect) {
    // "Open in editor" from the demo viewer: a one-off effect, edited in memory.
    QuarksEffectEditor.Show({...editorProps, effectJson: initialEffect});
} else {
    // #project=<id> reopens a project after a reload.
    const projectFromHash = new URLSearchParams(window.location.hash.slice(1)).get('project');
    QuarksEditorWorkspace.Show({
        ...editorProps,
        projectId: projectFromHash,
        onProjectChange: (id) => {
            const url = `${window.location.pathname}${window.location.search}${id ? `#project=${encodeURIComponent(id)}` : ''}`;
            history.replaceState(null, '', url);
        },
    });
}
