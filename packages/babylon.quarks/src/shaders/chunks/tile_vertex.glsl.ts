export default /* glsl */ `
#ifdef UV_TILE
    mat3 tileTransform = makeTileTransform(floor(uvTile));
    #ifdef TILE_BLEND
        mat3 nextTileTransform = makeTileTransform(ceil(uvTile));
        vUvBlend = fract(uvTile);
    #endif
#else
    mat3 tileTransform = makeTileTransform(0.0);
#endif

#if defined(USE_UV)
    vUv = (tileTransform * vec3(uv, 1.0)).xy;
    #if defined(TILE_BLEND) && defined(UV_TILE)
        vUvNext = (nextTileTransform * vec3(uv, 1.0)).xy;
    #endif
#endif
`;
