export default /* wgsl */ `
// Per-vertex attributes
attribute position: vec3f;
attribute uv: vec2f;

// Per-instance attributes
attribute offset: vec3f;
attribute color: vec4f;
attribute size: vec3f;
attribute rotation: f32;
attribute uvTile: f32;

// Uniforms
uniform world: mat4x4f;
uniform view: mat4x4f;
uniform projection: mat4x4f;

#ifdef UV_TILE
uniform tileCountX: f32;
uniform tileCountY: f32;
#endif

// Varyings
varying vUV: vec2f;
varying vColor: vec4f;
#ifdef TILE_BLEND
varying vUV2: vec2f;
varying vTileBlend: f32;
#endif
#ifdef SOFT_PARTICLES
varying projPosition: vec4f;
varying linearDepth: f32;
#endif

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
    let c = cos(vertexInputs.rotation);
    let s = sin(vertexInputs.rotation);

    let alignedPosition = vertexInputs.position.xy * vertexInputs.size.xy;
    let rotatedPosition = vec2f(
        c * alignedPosition.x - s * alignedPosition.y,
        s * alignedPosition.x + c * alignedPosition.y);

#ifdef HORIZONTAL
    var mvPosition = uniforms.world * vec4f(vertexInputs.offset, 1.0);
    mvPosition.x += rotatedPosition.x;
    mvPosition.z -= rotatedPosition.y;
    mvPosition = uniforms.view * mvPosition;
#elif defined(VERTICAL)
    var mvPosition = uniforms.world * vec4f(vertexInputs.offset, 1.0);
    mvPosition.y += rotatedPosition.y;
    mvPosition = uniforms.view * mvPosition;
    mvPosition.x += rotatedPosition.x;
#else
    var mvPosition = uniforms.view * uniforms.world * vec4f(vertexInputs.offset, 1.0);
    mvPosition.x += rotatedPosition.x;
    mvPosition.y += rotatedPosition.y;
#endif

    let clipPosition = uniforms.projection * mvPosition;
    vertexOutputs.position = clipPosition;
#ifdef SOFT_PARTICLES
    vertexOutputs.projPosition = clipPosition;
    vertexOutputs.linearDepth = -mvPosition.z;
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
