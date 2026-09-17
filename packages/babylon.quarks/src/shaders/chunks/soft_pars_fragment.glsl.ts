export default /* glsl */ `
#ifdef SOFT_PARTICLES
    uniform sampler2D depthTexture;
    // (x, y) decode a depth sample into a distance from the camera plane, z
    // selects the reciprocal form used by raw depth-buffer samples.
    // See SoftParticleDepth.ts.
    uniform vec4 depthParams;
    uniform vec2 softParams;

    varying vec4 projPosition;
    varying float linearDepth;

    #define SOFT_NEAR_FADE softParams.x
    #define SOFT_INV_FADE_DISTANCE softParams.y

    float decode_depth(float d) {
        float decoded = depthParams.x * d + depthParams.y;
        return depthParams.z > 0.5 ? 1.0 / decoded : decoded;
    }
#endif
`;
