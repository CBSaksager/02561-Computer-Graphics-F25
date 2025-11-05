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

    let normal = normalize(pos.xyz);

    // Light
    let lightDir = vec3f(0.0, 0.0, - 1.0);
    let lightEmission = vec3f(1.0, 1.0, 1.0);

    // diffuse reflection coefficient (material colour)
    let kd = 1.0;

    // Compute incident light direction: omega_i = l = -lightDir
    let omega_i = - lightDir;

    // The light reflected from a perfectly diffuse object is:
    // L_r,d = k_d L_i max(n * ωi, 0).
    let lightDiffuse = kd * lightEmission * max(dot(normal, omega_i), 0.0);

    // Convert position to color for visualization
    out.color = vec4f(lightDiffuse, 1.0);
    return out;
}

@fragment
fn main_fs(@location(0) color: vec4f) -> @location(0) vec4f {
    return color;
}