import {fogVertexDeclarationWGSL, fogVertexWGSL} from './chunks/fog';
import {sheetVertexDeclarationWGSL, sheetVertexWGSL} from './chunks/sheet';

export default /* wgsl */ `
attribute position: vec3f;
attribute uv: vec2f;
attribute normal: vec3f;
attribute offset: vec3f;
attribute color: vec4f;
attribute size: vec3f;
attribute rotation: vec4f;
attribute uvTile: f32;

uniform world: mat4x4f;
uniform view: mat4x4f;
uniform projection: mat4x4f;
${sheetVertexDeclarationWGSL}

varying vUV: vec2f;
varying vColor: vec4f;
#ifdef UV1
#ifdef MESH_UV2
// The mesh's second UV set.
attribute uv2: vec2f;
#endif
// UV channel 1: the mesh's second UV set, or its first when it has none.
varying vUV1: vec2f;
#endif
varying vNormal: vec3f;
varying vWorldPos: vec3f;

#ifdef SOFT_PARTICLES
varying projPosition: vec4f;
varying linearDepth: f32;
#endif

fn applyQuaternion(v: vec3f, q: vec4f) -> vec3f {
    let qVec = q.xyz;
    let qW = q.w;
    let t = 2.0 * cross(qVec, v);
    return v + qW * t + cross(qVec, t);
}

${fogVertexDeclarationWGSL}
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
    let size = vertexInputs.size;
    let scaledPosition = vertexInputs.position * size;
    let rotatedPosition = applyQuaternion(scaledPosition, vertexInputs.rotation);
    // A normal scales by the inverse of the size, so a stretched mesh keeps its normals
    // perpendicular; a flat size counts as a sliver rather than dividing by zero.
    let safeSize = vec3f(
        select(1e-6, size.x, abs(size.x) > 1e-6),
        select(1e-6, size.y, abs(size.y) > 1e-6),
        select(1e-6, size.z, abs(size.z) > 1e-6));
    // A mirrored size (an odd number of negative components) turns the winding inside out, so the
    // normal is turned with it and the fragment's front-face test agrees with the geometry.
    let rotatedNormal = normalize(applyQuaternion(vertexInputs.normal / safeSize, vertexInputs.rotation)) * sign(safeSize.x * safeSize.y * safeSize.z);
    let localPos = rotatedPosition + vertexInputs.offset;

    let worldPos = uniforms.world * vec4f(localPos, 1.0);
    let viewPos = uniforms.view * worldPos;
    let clipPosition = uniforms.projection * viewPos;
    vertexOutputs.position = clipPosition;
${fogVertexWGSL('viewPos.xyz')}

    vertexOutputs.vWorldPos = worldPos.xyz;
    vertexOutputs.vNormal = normalize((uniforms.world * vec4f(rotatedNormal, 0.0)).xyz);

#ifdef SOFT_PARTICLES
    vertexOutputs.projPosition = clipPosition;
    // View depth is +z ahead of a left-handed camera and -z ahead of a right-handed one.
    vertexOutputs.linearDepth = abs(viewPos.z);
#endif

${sheetVertexWGSL('vertexInputs.uv')}

#ifdef UV1
#ifdef MESH_UV2
    vertexOutputs.vUV1 = vertexInputs.uv2;
#else
    vertexOutputs.vUV1 = vertexInputs.uv;
#endif
#endif
    vertexOutputs.vColor = vertexInputs.color;
}
`;
