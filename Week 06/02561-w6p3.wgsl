struct Uniforms {
    mvp_matrix: array<mat4x4f, 1>,
    camera_position: vec3f,
    // Lighting parameters
    L_e: f32,
    L_a: f32,
    k_d: f32,
    k_s: f32,
    shininess: f32,
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
    let viewDir = normalize(uniforms.camera_position - pos.xyz);

    let reflectDir = reflect(- omega_i, n);

    let diffuseColor = vec3f(0.8, 0.2, 0.2);
    let specularColor = vec3f(1.0, 1.0, 1.0);
    let k_d_tex = texColor.xyz * uniforms.k_d;
    let k_a = k_d_tex;
    let k_s = specularColor * uniforms.k_s;

    let L_e = vec3f(1.0, 1.0, 1.0) * uniforms.L_e;
    let L_i = L_e;
    let L_a = vec3f(1.0, 1.0, 1.0) * uniforms.L_a;

    // Phong reflection model
    let L_ra = k_a * L_a;
    let L_rd = k_d_tex * L_e * max(dot(n, omega_i), 0.0);
    let L_rs = k_s * L_e * pow(max(dot(viewDir, reflectDir), 0.0), uniforms.shininess);

    // Avoid highlights on backside
    let L_rs_select = select(vec3f(0.0, 0.0, 0.0), L_rs, dot(n, omega_i) > 0.0);
    let L_o = L_ra + L_rd + L_rs_select;

    return vec4f(L_o, 1.0);
}