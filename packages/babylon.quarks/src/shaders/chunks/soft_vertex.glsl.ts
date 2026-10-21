export default /* glsl */ `
#ifdef SOFT_PARTICLES
    projPosition = gl_Position;
    // View depth is +z ahead of a left-handed camera and -z ahead of a right-handed one.
    linearDepth = abs(mvPosition.z);
#endif
`;
