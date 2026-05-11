export default /* glsl */ `
#ifdef SOFT_PARTICLES

    vec2 p2 = projPosition.xy / projPosition.w;
    p2 = 0.5 * p2 + 0.5;

    float readDepth = texture2D(depthTexture, p2.xy).r;
    float viewDepth = linearize_depth(readDepth);
    float softParticlesFade = saturate(SOFT_INV_FADE_DISTANCE * ((viewDepth - SOFT_NEAR_FADE) - linearDepth));

    gl_FragColor *= softParticlesFade;
#endif
`;
