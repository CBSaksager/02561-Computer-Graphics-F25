struct Uniforms {
    mvp_matrix: array<mat4x4f, 1>,
    m_tex: array<mat4x4f, 1>,
    reflective: u32,
    eye: vec3f,
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
    @location(1) worldPos: vec3f,
}

@vertex
fn main_vs(@location(0) pos: vec4f, @builtin(instance_index) instanceIndex: u32) -> VSout {
    var out: VSout;
    out.position = uniforms.mvp_matrix[instanceIndex] * pos;
    out.texCoord = uniforms.m_tex[instanceIndex] * pos;
    out.worldPos = pos.xyz;
    return out;
}

@fragment
fn main_fs(@location(0) texCoord: vec4f, @location(1) worldPos: vec3f) -> @location(0) vec4f {
    let n = normalize(texCoord.xyz);

    //(pw - e) / ||pw - e||
    let incidentDir = normalize(worldPos - uniforms.eye);
    let reflectDir = reflect(incidentDir, n);

    let sampleDir = select(n, reflectDir, uniforms.reflective == 1u);
    let texColor = textureSample(myTexture, mySampler, sampleDir);
    return vec4f(texColor.xyz, 1.0);
}