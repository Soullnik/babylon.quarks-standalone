export default /* glsl */ `
#ifdef UV_TILE
    attribute float uvTile;
    uniform vec2 tileCount;

    mat3 makeTileTransform(float tileIndex) {
        float col = mod(tileIndex, tileCount.x);
        float row = (tileCount.y - floor(tileIndex / tileCount.x) - 1.0);
        return mat3(
            1.0 / tileCount.x, 0.0, 0.0,
            0.0, 1.0 / tileCount.y, 0.0,
            col / tileCount.x, row / tileCount.y, 1.0
        );
    }
#else
    mat3 makeTileTransform(float tileIndex) {
        return mat3(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0);
    }
#endif

#if defined(USE_UV)
    varying vec2 vUv;
    #ifdef TILE_BLEND
        varying vec2 vUvNext;
        varying float vUvBlend;
    #endif
#endif
`;
