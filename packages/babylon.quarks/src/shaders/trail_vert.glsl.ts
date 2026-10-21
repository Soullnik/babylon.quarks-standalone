import {fogVertexDeclarationGLSL, fogVertexGLSL} from './chunks/fog';

export default /* glsl */ `
attribute vec3 position;
attribute vec3 previous;
attribute vec3 next;
attribute float side;
attribute float width;
attribute vec2 uv;
attribute vec4 color;

uniform mat4 view;
uniform mat4 projection;

varying vec2 vUV;
varying vec4 vColor;
#ifdef UV1
// Along the trail and across it, without the sheet's cell (UV channel 1).
attribute vec2 uv2;
varying vec2 vUV1;
#endif

#ifdef SOFT_PARTICLES
varying vec4 projPosition;
varying float linearDepth;
#endif

// The unit tangent of a segment, or zero for a segment of no length.
vec3 trailDirection(vec3 d) {
    float l = dot(d, d);
    return l > 1e-12 ? d * inversesqrt(l) : vec3(0.0);
}

// The direction a ribbon point is widened along, in view space: across the trail's tangent and
// the line of sight, as Unity's View alignment and Niagara's ribbon facing do. Stays finite at
// repeated points, at a hairpin and for a segment pointing at the camera.
vec3 trailSide(vec3 previousPoint, vec3 point, vec3 nextPoint) {
    vec3 incoming = trailDirection(point - previousPoint);
    vec3 outgoing = trailDirection(nextPoint - point);
    vec3 tangent = incoming + outgoing;
    if (dot(tangent, tangent) < 1e-6) {
        // A hairpin turns the two directions against each other: face the way it now goes.
        tangent = dot(outgoing, outgoing) > 0.0 ? outgoing : incoming;
    }
    // The line of sight: to the point for a perspective camera, the view axis for an orthographic one.
    vec3 sight = projection[3][3] > 0.5 ? vec3(0.0, 0.0, 1.0) : point;
    vec3 side = cross(tangent, sight);
    if (dot(side, side) < 1e-12) {
        side = cross(tangent, vec3(0.0, 0.0, 1.0));
    }
    if (dot(side, side) < 1e-12) {
        side = vec3(1.0, 0.0, 0.0);
    }
    return normalize(side);
}

${fogVertexDeclarationGLSL}
void main() {
    vec3 point = (view * vec4(position, 1.0)).xyz;
    // A swept trail lays its vertices out on the CPU and gives them no width.
    if (width > 0.0) {
        vec3 previousPoint = (view * vec4(previous, 1.0)).xyz;
        vec3 nextPoint = (view * vec4(next, 1.0)).xyz;
        point += trailSide(previousPoint, point, nextPoint) * (0.5 * width * side);
    }
    gl_Position = projection * vec4(point, 1.0);
${fogVertexGLSL('point')}
#ifdef SOFT_PARTICLES
    projPosition = gl_Position;
    // View depth is +z ahead of a left-handed camera and -z ahead of a right-handed one.
    linearDepth = abs(point.z);
#endif
    vUV = uv;
#ifdef UV1
    vUV1 = uv2;
#endif
    vColor = color;
}
`;
