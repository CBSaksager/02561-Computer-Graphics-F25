struct Uniforms {
    mvp_matrix: array<mat4x4f, 1>,
}

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;

@group(0) @binding(1)
var mySampler: sampler;

@group(0) @binding(2)
var myTexture: texture_2d<f32>;

struct VSout {
    @builtin(position) position: vec4f,
    @location(0) pos: vec4f,
    @location(1) normal: vec3f,
}

@vertex
fn main_vs(@location(0) pos: vec4f, @builtin(instance_index) instanceIndex: u32) -> VSout {
    var out: VSout;
    out.position = uniforms.mvp_matrix[instanceIndex] * pos;
    out.pos = pos;
    out.normal = normalize(pos.xyz);
    return out;
}

@fragment
fn main_fs(@location(0) pos: vec4f, @location(1) normal: vec3f) -> @location(0) vec4f {
    let n = normalize(normal);

    // Slides: Spherical inverse mapping
    const PI = radians(180.0);
    let u = 0.5 - atan2(n.z, n.x) / (2.0 * PI);
    let v = acos(n.y) / PI;
    let uv = vec2f(u, v);

    let texColor = textureSample(myTexture, mySampler, uv);

    // Light
    let lightDir = vec3f(0.0, 0.0, - 1.0);
    let omega_i = - lightDir;
    let light_Emission = vec3f(1.0, 1.0, 1.0);

    let L_d = texColor.xyz * light_Emission * max(dot(n, omega_i), 0.0) + 0.3 * texColor.xyz;

    return vec4f(L_d, 1.0);
}