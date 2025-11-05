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

struct VSout {
    @builtin(position) position: vec4f,
    @location(0) color: vec4f,
}

@vertex
fn main_vs(@location(0) pos: vec4f, @builtin(instance_index) instanceIndex: u32) -> VSout {
    var out: VSout;
    out.position = uniforms.mvp_matrix[instanceIndex] * pos;
    out.color = pos;
    return out;
}

@fragment
fn main_fs(@location(0) pos: vec4f) -> @location(0) vec4f {
    let normal = normalize(pos.xyz);

    // Light
    let lightDir = vec3f(0.0, 0.0, - 1.0);
    let omega_i = - lightDir;
    let viewDir = normalize(uniforms.camera_position - pos.xyz);

    let reflectDir = reflect(- omega_i, normal);

    let diffuseColor = vec3f(0.8, 0.2, 0.2);
    let specularColor = vec3f(1.0, 1.0, 1.0);
    let k_d = diffuseColor * uniforms.k_d;
    let k_a = k_d;
    let k_s = specularColor * uniforms.k_s;

    let L_e = vec3f(1.0, 1.0, 1.0) * uniforms.L_e;
    let L_i = L_e;
    let L_a = vec3f(1.0, 1.0, 1.0) * uniforms.L_a;

    // Phong reflection model
    let L_ra = k_a * L_a;
    let L_rd = k_d * L_e * max(dot(normal, omega_i), 0.0);
    let L_rs = k_s * L_e * pow(max(dot(viewDir, reflectDir), 0.0), uniforms.shininess);

    // Avoid highlights on backside
    let L_rs_select = select(vec3f(0.0, 0.0, 0.0), L_rs, dot(normal, omega_i) > 0.0);

    let L_o = L_ra + L_rd + L_rs_select;

    return vec4f(L_o, 1.0);
}