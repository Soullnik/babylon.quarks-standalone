export default /* glsl */ `
#if defined(USE_UV)
    varying vec2 vUv;
    #ifdef TILE_BLEND
        varying vec2 vUvNext;
        varying float vUvBlend;
    #endif
#endif
`;
