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
uniform lineWidth: f32;
uniform resolution: vec2f;
uniform sizeAttenuation: f32;

varying vUV: vec2f;
varying vColor: vec4f;

fn fix(i: vec4f, aspect: f32) -> vec2f {
    var res = i.xy / i.w;
    res.x *= aspect;
    return res;
}

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
    let aspect = uniforms.resolution.x / uniforms.resolution.y;
    var finalPosition = uniforms.projection * uniforms.view * vec4f(vertexInputs.position, 1.0);
    let prevPos = uniforms.projection * uniforms.view * vec4f(vertexInputs.previous, 1.0);
    let nextPos = uniforms.projection * uniforms.view * vec4f(vertexInputs.next, 1.0);

    let currentP = fix(finalPosition, aspect);
    let prevP = fix(prevPos, aspect);
    let nextP = fix(nextPos, aspect);

    let w = uniforms.lineWidth * vertexInputs.width;
    var dir: vec2f;
    if (distance(nextP, currentP) < 0.0001) {
        dir = normalize(currentP - prevP);
    } else if (distance(prevP, currentP) < 0.0001) {
        dir = normalize(nextP - currentP);
    } else {
        let dir1 = normalize(currentP - prevP);
        let dir2 = normalize(nextP - currentP);
        dir = normalize(dir1 + dir2);
    }
    var normal = vec4f(-dir.y, dir.x, 0.0, 1.0);
    normal.x *= 0.5 * w;
    normal.y *= 0.5 * w;
    normal = normal * uniforms.projection;
    if (uniforms.sizeAttenuation == 0.0) {
        let screen = (vec4f(uniforms.resolution, 0.0, 1.0) * uniforms.projection).xy;
        normal.x = normal.x * finalPosition.w / screen.x;
        normal.y = normal.y * finalPosition.w / screen.y;
    }
    finalPosition.x += normal.x * vertexInputs.side;
    finalPosition.y += normal.y * vertexInputs.side;

    vertexOutputs.position = finalPosition;
    vertexOutputs.vUV = vertexInputs.uv;
    vertexOutputs.vColor = vertexInputs.color;
}
`;
