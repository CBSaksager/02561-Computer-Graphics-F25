struct Uniforms {
    mvp_matrix: array<mat4x4f, 1>,
}

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;

struct VSout {
    @builtin(position) position: vec4f,
    @location(0) color: vec4f,
}

@vertex
fn main_vs(@location(0) pos: vec4f, @builtin(instance_index) instanceIndex: u32) -> VSout {
    var out: VSout;
    out.position = uniforms.mvp_matrix[instanceIndex] * pos;
    // Convert position to color for visualization
    out.color = 0.5 * pos + 0.5;
    return out;
}

@fragment
fn main_fs(@location(0) color: vec4f) -> @location(0) vec4f {
    return color;
}