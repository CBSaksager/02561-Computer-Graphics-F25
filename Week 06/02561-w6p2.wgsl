struct Uniforms {
    mvp_matrix: array<mat4x4f, 1>,
}

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;

// Texture and sampler bindings
@group(0) @binding(1)
var mySampler: sampler;
@group(0) @binding(2)
var myTexture: texture_2d<f32>;

struct VSout {
    @builtin(position) position: vec4f,
    @location(0) texCoord: vec2f,
}

@vertex
fn main_vs(@location(0) pos: vec4f, @location(1) texCoord: vec2f, @builtin(instance_index) instanceIndex: u32) -> VSout {
    var out: VSout;
    out.position = uniforms.mvp_matrix[instanceIndex] * pos;
    out.texCoord = texCoord;
    return out;
}

@fragment
fn main_fs(@location(0) texCoord: vec2f) -> @location(0) vec4f {
    let texture = textureSample(myTexture, mySampler, texCoord);
    return texture;
}