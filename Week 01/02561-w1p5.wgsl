struct VSOut {
    @builtin(position) position: vec4f,
    @location(0) color: vec3f,
}

;

struct Uniforms {
    x_offset: f32,
}

;
@group(0) @binding(0)
var<uniform> uniforms: Uniforms;

@vertex
fn main_vs(@location(0) inPos: vec2f, @location(1) inColor: vec3f) -> VSOut {
    var vsOut: VSOut;

    let pos = vec2f(inPos.x + uniforms.x_offset, inPos.y);

    vsOut.position = vec4f(pos, 0.0, 1.0);
    vsOut.color = inColor;
    return vsOut;
}

@fragment
fn main_fs(@location(0) inColor: vec3f) -> @location(0) vec4f {
    return vec4f(inColor, 1.0);
}