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

#ifdef UV_TILE
uniform tileCountX: f32;
uniform tileCountY: f32;
#endif

varying vUV: vec2f;
varying vColor: vec4f;
varying vNormal: vec3f;
varying vWorldPos: vec3f;

#ifdef TILE_BLEND
varying vUV2: vec2f;
varying vTileBlend: f32;
#endif

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

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
    let scaledPosition = vertexInputs.position * vertexInputs.size;
    let rotatedPosition = applyQuaternion(scaledPosition, vertexInputs.rotation);
    let rotatedNormal = normalize(applyQuaternion(vertexInputs.normal, vertexInputs.rotation));
    let localPos = rotatedPosition + vertexInputs.offset;

    let worldPos = uniforms.world * vec4f(localPos, 1.0);
    let viewPos = uniforms.view * worldPos;
    let clipPosition = uniforms.projection * viewPos;
    vertexOutputs.position = clipPosition;

    vertexOutputs.vWorldPos = worldPos.xyz;
    vertexOutputs.vNormal = normalize((uniforms.world * vec4f(rotatedNormal, 0.0)).xyz);

#ifdef SOFT_PARTICLES
    vertexOutputs.projPosition = clipPosition;
    vertexOutputs.linearDepth = -viewPos.z;
#endif

#ifdef UV_TILE
    let tc = vec2f(uniforms.tileCountX, uniforms.tileCountY);
    let baseTile = floor(vertexInputs.uvTile);
    let tileU = (baseTile % tc.x) / tc.x;
    let tileV = 1.0 - floor(baseTile / tc.x) / tc.y - 1.0 / tc.y;
    vertexOutputs.vUV = vertexInputs.uv / tc + vec2f(tileU, tileV);
    #ifdef TILE_BLEND
        let nextTile = ceil(vertexInputs.uvTile);
        let nextU = (nextTile % tc.x) / tc.x;
        let nextV = 1.0 - floor(nextTile / tc.x) / tc.y - 1.0 / tc.y;
        vertexOutputs.vUV2 = vertexInputs.uv / tc + vec2f(nextU, nextV);
        vertexOutputs.vTileBlend = fract(vertexInputs.uvTile);
    #endif
#else
    vertexOutputs.vUV = vertexInputs.uv;
#endif

    vertexOutputs.vColor = vertexInputs.color;
}
`;
