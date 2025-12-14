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

@group(0) @binding(3)
var normalMap: texture_2d<f32>;
@group(0) @binding(4)
var normalSampler: sampler;

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

    // Normal mapping
    let pi = radians(180.0);
    let u = 0.5 - atan2(n.z, n.x) / (2.0 * pi);
    let v = acos(n.y) / pi;
    let uv = vec2f(u, v);

    var normalMapColor = textureSample(normalMap, normalSampler, uv).xyz;
    normalMapColor = normalMapColor * 2.0 - 1.0;
    normalMapColor = normalize(rotate_to_normal(n, normalMapColor));
    normalMapColor = select(n, normalMapColor, uniforms.reflective == 1u);

    // Reflection vector calculation
    let incidentDir = normalize(worldPos - uniforms.eye);
    let reflectDir = reflect(incidentDir, normalMapColor);
    let sampleDir = select(n, reflectDir, uniforms.reflective == 1u);
    let texColor = textureSample(myTexture, mySampler, sampleDir);
    return vec4f(texColor.xyz, 1.0);
}

fn rotate_to_normal(n: vec3f, v: vec3f) -> vec3f {
    let sgn_nz = sign(n.z + 1.0e-16);
    let a = - 1.0 / (1.0 + abs(n.z));
    let b = n.x * n.y * a;
    return vec3f(1.0 + n.x * n.x * a, b, - sgn_nz * n.x) * v.x + vec3f(sgn_nz * b, sgn_nz * (1.0 + n.y * n.y * a), - n.y) * v.y + n * v.z;
}