struct Uniforms {
    mvp_matrix: array<mat4x4f, 1>,
    m_tex: array<mat4x4f, 1>,
}

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;

@group(0) @binding(1)
var mySampler: sampler;

@group(0) @binding(2)
var myTexture: texture_cube<f32>;

struct VSout {
    @builtin(position) position: vec4f,
    @location(0) texCoord: vec4f,
}

@vertex
fn main_vs(@location(0) pos: vec4f, @builtin(instance_index) instanceIndex: u32) -> VSout {
    var out: VSout;
    out.position = uniforms.mvp_matrix[instanceIndex] * pos;
    out.texCoord = uniforms.m_tex[instanceIndex] * pos;
    return out;
}

@fragment
fn main_fs(@location(0) texCoord: vec4f) -> @location(0) vec4f {
    let n = normalize(texCoord.xyz);
    let texColor = textureSample(myTexture, mySampler, n);
    return vec4f(texColor.xyz, 1.0);
}