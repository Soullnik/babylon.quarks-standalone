import {colorSpaceDeclarationWGSL, particleColorVertexDeclarationWGSL} from './chunks/colorSpace';
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
// The stretch, by columns: the emitter's scale, applied after the particle's turn.
attribute stretchX: vec3f;
attribute stretchY: vec3f;
attribute stretchZ: vec3f;

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
#ifdef MESH_COLOR
// The mesh's vertex colour, linear.
attribute meshColor: vec4f;
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

#ifdef MESH_VIEW_ALIGNED
// A direction in the camera's axes turned into the world's: by the transpose of the view matrix's
// rotation, its inverse, since a view matrix is rigid. Column i of the rotation is view[i].xyz.
fn viewToWorld(v: vec3f, viewMatrix: mat4x4f) -> vec3f {
    return vec3f(dot(viewMatrix[0].xyz, v), dot(viewMatrix[1].xyz, v), dot(viewMatrix[2].xyz, v));
}
#endif

${fogVertexDeclarationWGSL}
${colorSpaceDeclarationWGSL}
${particleColorVertexDeclarationWGSL}
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
    let size = vertexInputs.size;
    let scaledPosition = vertexInputs.position * size;
    let spunPosition = applyQuaternion(scaledPosition, vertexInputs.rotation);
    // Stretched by the emitter's scale after the turn, as Unity draws a mesh particle: along the
    // emitter's axes, or the world's or the camera's for those alignments.
    let stretchX = vertexInputs.stretchX;
    let stretchY = vertexInputs.stretchY;
    let stretchZ = vertexInputs.stretchZ;
    let turnedPosition = stretchX * spunPosition.x + stretchY * spunPosition.y + stretchZ * spunPosition.z;
    // A normal scales by the inverse of the size, so a stretched mesh keeps its normals
    // perpendicular; a flat size counts as a sliver rather than dividing by zero.
    let safeSize = vec3f(
        select(1e-6, size.x, abs(size.x) > 1e-6),
        select(1e-6, size.y, abs(size.y) > 1e-6),
        select(1e-6, size.z, abs(size.z) > 1e-6));
    // A mirrored size (an odd number of negative components) turns the winding inside out, so the
    // normal is turned with it and the fragment's front-face test agrees with the geometry.
    let spunNormal = applyQuaternion(vertexInputs.normal / safeSize, vertexInputs.rotation);
    // The stretch's cofactor matrix keeps the normal perpendicular to the stretched surface: its
    // inverse transpose times its determinant, which is positive.
    let turnedNormal = normalize(
        cross(stretchY, stretchZ) * spunNormal.x +
        cross(stretchZ, stretchX) * spunNormal.y +
        cross(stretchX, stretchY) * spunNormal.z) * sign(safeSize.x * safeSize.y * safeSize.z);
#ifdef MESH_VIEW_ALIGNED
    // A view-aligned mesh is turned in the camera's axes (renderAlignment 'view'), so its x runs
    // right on screen, its y up and its z along the view direction.
    let rotatedPosition = viewToWorld(turnedPosition, uniforms.view);
    let rotatedNormal = viewToWorld(turnedNormal, uniforms.view);
#else
    let rotatedPosition = turnedPosition;
    let rotatedNormal = turnedNormal;
#endif
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
    // The particle colour, times the material's, comes into the working space here, so it is
    // interpolated there too.
    vertexOutputs.vColor = quarksParticleColor(vertexInputs.color);
#ifdef MESH_COLOR
    // Times the mesh's vertex colour, as it is in either working space: Unity converts the
    // particle colour into its Linear colour space but not a mesh's vertex colours.
    vertexOutputs.vColor *= vertexInputs.meshColor;
#endif
}
`;
