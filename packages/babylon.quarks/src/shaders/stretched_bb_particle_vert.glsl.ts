import {fogVertexDeclarationGLSL, fogVertexGLSL} from './chunks/fog';
import {sheetVertexDeclarationGLSL, sheetVertexGLSL} from './chunks/sheet';

export default /* glsl */ `
// Per-vertex attributes
attribute vec3 position;
attribute vec2 uv;

// Per-instance attributes
attribute vec3 offset;
attribute vec4 color;
attribute vec3 size;
attribute float rotation;
attribute float uvTile;
attribute vec4 velocity;

// Uniforms
uniform mat4 world;
uniform mat4 view;
uniform mat4 projection;
${sheetVertexDeclarationGLSL}

#ifdef PIVOT
// Streak offset in particle-size units: x from head to tail, y across.
uniform vec3 pivot;
#endif

// Varyings
varying vec2 vUV;
varying vec4 vColor;
#ifdef UV1
// The particle's own UV, never moved by the sheet (UV channel 1).
varying vec2 vUV1;
#endif
#ifdef SOFT_PARTICLES
varying vec4 projPosition;
varying float linearDepth;
#endif

#ifdef SIZE_LIMITS
// Smallest and largest size a particle may have on screen, as fractions of the viewport height.
uniform vec2 sizeLimits;
#endif

${fogVertexDeclarationGLSL}
void main() {
    float lengthFactor = velocity.w;
    // A flipped particle arrives with a negative size: the streak keeps its
    // extent and mirrors its texture instead (see quadUV below).
    float avgSize = (abs(size.x) + abs(size.y)) * 0.5;
    vec4 mvPosition = view * world * vec4(offset, 1.0);
    vec3 viewVelocity = mat3(view * world) * velocity.xyz;
    float vlength = length(viewVelocity);
    // Stretch direction is the velocity direction; only a genuinely motionless particle has none.
    // Deriving it via normalize keeps the stretch aligned even when the speed contribution is ~0
    // (e.g. a speed factor of 0), instead of collapsing the whole burst onto a fixed screen axis.
    vec3 vdir = vlength > 0.000001 ? viewVelocity / vlength : vec3(0.0, 0.0, 1.0);
    // Seen straight along its length a streak has no side to face; any will do.
    vec3 sideRaw = cross(mvPosition.xyz, vdir);
    vec3 side = dot(sideRaw, sideRaw) > 1e-12 ? normalize(sideRaw) : vec3(1.0, 0.0, 0.0);
#ifdef SIZE_LIMITS
    // The streak's width on screen as a fraction of the viewport height, held
    // between the limits; a perspective projection divides by the view depth.
    float limitDepth = abs(projection[2][3]) > 0.0 ? abs(mvPosition.z) : 1.0;
    float screenSize = avgSize * projection[1][1] / (2.0 * limitDepth);
    if (screenSize > 0.0) {
        avgSize *= clamp(screenSize, sizeLimits.x, sizeLimits.y) / screenSize;
    }
#endif
    mvPosition.xyz += position.y * side * avgSize;
#ifdef BEAM
    // The vector runs from the particle to the beam's end: the quad spans it
    // exactly, U from the particle (0) to the end (1), as wide as the size.
    mvPosition.xyz += (position.x + 0.5) * viewVelocity;
#else
    // Equivalent to viewVelocity * (1.0 + lengthFactor / vlength) for moving particles, but the
    // size-based term (vdir * lengthFactor) survives when the velocity contribution vanishes.
    mvPosition.xyz -= (position.x + 0.5) * (viewVelocity + vdir * lengthFactor) * avgSize;
#endif
#ifdef PIVOT
    // In particle-size units along the quad's own axes: x from head to tail, y across.
    mvPosition.xyz += (pivot.y * side - pivot.x * vdir) * avgSize;
#endif
    gl_Position = projection * mvPosition;
${fogVertexGLSL('mvPosition.xyz')}
    vec2 quadUV = vec2(size.x < 0.0 ? 1.0 - uv.x : uv.x, size.y < 0.0 ? 1.0 - uv.y : uv.y);
#ifdef SOFT_PARTICLES
    projPosition = gl_Position;
    // View depth is +z ahead of a left-handed camera and -z ahead of a right-handed one.
    linearDepth = abs(mvPosition.z);
#endif

${sheetVertexGLSL('quadUV')}

#ifdef UV1
    vUV1 = quadUV;
#endif
    vColor = color;
}
`;
