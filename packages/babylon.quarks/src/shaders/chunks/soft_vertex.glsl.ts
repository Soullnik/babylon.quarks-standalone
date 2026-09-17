export default /* glsl */ `
#ifdef SOFT_PARTICLES
    projPosition = gl_Position;
    // Distance from the camera plane, positive in left- and right-handed scenes.
    linearDepth = abs(mvPosition.z);
#endif
`;
