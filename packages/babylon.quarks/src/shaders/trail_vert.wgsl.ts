import {fogVertexDeclarationWGSL, fogVertexWGSL} from './chunks/fog';

export default /* wgsl */ `
attribute position: vec3f;
attribute previous: vec3f;
attribute next: vec3f;
attribute side: f32;
attribute width: f32;
attribute uv: vec2f;
attribute color: vec4f;

uniform view: mat4x4f;
uniform projection: mat4x4f;

varying vUV: vec2f;
varying vColor: vec4f;
#ifdef UV1
// Along the trail and across it, without the sheet's cell (UV channel 1).
attribute uv2: vec2f;
varying vUV1: vec2f;
#endif

#ifdef SOFT_PARTICLES
varying projPosition: vec4f;
varying linearDepth: f32;
#endif

// The unit tangent of a segment, or zero for a segment of no length.
fn trailDirection(d: vec3f) -> vec3f {
    let l = dot(d, d);
    return select(vec3f(0.0), d * inverseSqrt(max(l, 1e-24)), l > 1e-12);
}

// The direction a ribbon point is widened along, in view space: across the trail's tangent and
// the line of sight, as Unity's View alignment and Niagara's ribbon facing do. Stays finite at
// repeated points, at a hairpin and for a segment pointing at the camera.
fn trailSide(previousPoint: vec3f, point: vec3f, nextPoint: vec3f) -> vec3f {
    let incoming = trailDirection(point - previousPoint);
    let outgoing = trailDirection(nextPoint - point);
    var tangent = incoming + outgoing;
    if (dot(tangent, tangent) < 1e-6) {
        // A hairpin turns the two directions against each other: face the way it now goes.
        tangent = select(incoming, outgoing, dot(outgoing, outgoing) > 0.0);
    }
    // The line of sight: to the point for a perspective camera, the view axis for an orthographic one.
    let sight = select(point, vec3f(0.0, 0.0, 1.0), uniforms.projection[3][3] > 0.5);
    var side = cross(tangent, sight);
    if (dot(side, side) < 1e-12) {
        side = cross(tangent, vec3f(0.0, 0.0, 1.0));
    }
    if (dot(side, side) < 1e-12) {
        side = vec3f(1.0, 0.0, 0.0);
    }
    return normalize(side);
}

${fogVertexDeclarationWGSL}
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
    var point = (uniforms.view * vec4f(vertexInputs.position, 1.0)).xyz;
    // A swept trail lays its vertices out on the CPU and gives them no width.
    if (vertexInputs.width > 0.0) {
        let previousPoint = (uniforms.view * vec4f(vertexInputs.previous, 1.0)).xyz;
        let nextPoint = (uniforms.view * vec4f(vertexInputs.next, 1.0)).xyz;
        point += trailSide(previousPoint, point, nextPoint) * (0.5 * vertexInputs.width * vertexInputs.side);
    }
    let clipPosition = uniforms.projection * vec4f(point, 1.0);
    vertexOutputs.position = clipPosition;
${fogVertexWGSL('point')}
#ifdef SOFT_PARTICLES
    vertexOutputs.projPosition = clipPosition;
    // View depth is +z ahead of a left-handed camera and -z ahead of a right-handed one.
    vertexOutputs.linearDepth = abs(point.z);
#endif
    vertexOutputs.vUV = vertexInputs.uv;
#ifdef UV1
    vertexOutputs.vUV1 = vertexInputs.uv2;
#endif
    vertexOutputs.vColor = vertexInputs.color;
}
`;
