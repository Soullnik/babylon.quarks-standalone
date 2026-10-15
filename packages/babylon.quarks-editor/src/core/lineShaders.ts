// LinesMesh loads its "color" shader with a dynamic import. Under Vite's dev pre-bundling that
// import can resolve to a second copy of Babylon's ShaderStore, so the shader registers where
// Babylon never looks, it falls back to fetching `src/Shaders/color.fragment.fx`, gets the
// page's HTML back and the selection rings never render. Registering the shader up front, from
// the same module graph as the rest of the editor, makes the lookup succeed either way.
import '@babylonjs/core/Shaders/color.fragment';
import '@babylonjs/core/Shaders/color.vertex';
