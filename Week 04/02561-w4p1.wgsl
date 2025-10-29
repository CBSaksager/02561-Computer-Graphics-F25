struct Uniforms {
    mvp_matrix: array<mat4x4f, 3>,
}

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;

@vertex
fn main_vs(@location(0) pos: vec3f, @builtin(instance_index) instanceIndex: u32) -> @builtin(position) vec4f {
    return uniforms.mvp_matrix[instanceIndex] * vec4f(pos, 1.0);
}

@fragment
fn main_fs() -> @location(0) vec4f {
    return vec4f(0.0, 0.0, 0.0, 1.0);
}