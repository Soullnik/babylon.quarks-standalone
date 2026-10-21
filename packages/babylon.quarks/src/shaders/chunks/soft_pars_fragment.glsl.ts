export default /* glsl */ `
#ifdef SOFT_PARTICLES
    uniform sampler2D depthTexture;
    uniform vec4 projParams;
    uniform vec2 softParams;

    varying vec4 projPosition;
    varying float linearDepth;

    #define SOFT_NEAR_FADE softParams.x
    #define SOFT_INV_FADE_DISTANCE softParams.y

    // View depth from a depth sample, with the coefficients BatchedRenderer writes to projParams
    // for the depth texture's encoding (see softDepthParams). Nothing drawn reads as far away.
    float linearize_depth(float d) {
        float denominator = projParams.z * d + projParams.w;
        float depth = abs(denominator) > 1e-8 ? abs((projParams.x * d + projParams.y) / denominator) : 0.0;
        return depth > 0.0 ? depth : 1e30;
    }
#endif
`;
