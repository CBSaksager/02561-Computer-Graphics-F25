'use strict';
window.onload = function () {
  main();
};

async function main() {
  const gpu = navigator.gpu;
  const adapter = await gpu.requestAdapter();
  const device = await adapter.requestDevice();
  const canvas = document.getElementById('my-canvas');
  const context = canvas.getContext('webgpu');
  const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device: device,
    format: canvasFormat,
  });

  const wgslfile = document.getElementById('wgsl').src;
  const wgslcode = await fetch(wgslfile, { cache: 'reload' }).then((r) =>
    r.text()
  );
  const wgsl = device.createShaderModule({
    code: wgslcode,
  });

  // Get slider elements
  const L_e_slider = document.querySelector('#emittedRadiance input');
  const L_a_slider = document.querySelector('#ambientRadiance input');
  const k_d_slider = document.querySelector('#diffuseCoefficient input');
  const k_s_slider = document.querySelector('#specularCoefficient input');
  const shininess_slider = document.querySelector('#shininess input');

  // Add input event listeners for immediate response
  L_e_slider.addEventListener('input', (e) => {
    L_e = parseFloat(e.target.value);
  });

  L_a_slider.addEventListener('input', (e) => {
    L_a = parseFloat(e.target.value);
  });

  k_d_slider.addEventListener('input', (e) => {
    k_d = parseFloat(e.target.value);
  });

  k_s_slider.addEventListener('input', (e) => {
    k_s = parseFloat(e.target.value);
  });

  shininess_slider.addEventListener('input', (e) => {
    shininess = parseFloat(e.target.value);
  });

  // OBJ Model
  const obj_filename = 'Mana_Mushroom_1.obj';
  const obj = await readOBJFile(obj_filename, 1.0, true);

  const positions = obj.vertices;
  const positionBuffer = device.createBuffer({
    size: sizeof['vec4'] * positions.length,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });

  const positionBufferLayout = {
    arrayStride: sizeof['vec4'],
    attributes: [
      {
        format: 'float32x4',
        offset: 0,
        shaderLocation: 0, // Position, see vertex shader
      },
    ],
  };
  device.queue.writeBuffer(positionBuffer, 0, flatten(positions));

  const indices = obj.indices;
  const indexBuffer = device.createBuffer({
    size: sizeof['vec4'] * indices.length,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, indices);

  const colors = obj.colors;
  const colorBuffer = device.createBuffer({
    size: sizeof['vec4'] * colors.length,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  const colorBufferLayout = {
    arrayStride: sizeof['vec4'],
    attributes: [
      {
        format: 'float32x4',
        offset: 0,
        shaderLocation: 1, // Color, see vertex shader
      },
    ],
  };
  device.queue.writeBuffer(colorBuffer, 0, flatten(colors));

  const normals = obj.normals;
  const normalBuffer = device.createBuffer({
    size: sizeof['vec4'] * normals.length,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  const normalBufferLayout = {
    arrayStride: sizeof['vec4'],
    attributes: [
      {
        format: 'float32x4',
        offset: 0,
        shaderLocation: 2, // Normal, see vertex shader
      },
    ],
  };
  device.queue.writeBuffer(normalBuffer, 0, flatten(normals));

  const backgroundColor = { r: 0.3921, g: 0.5843, b: 0.9294, a: 1.0 };

  // Lighting parameters
  let L_e = 1.0;
  let L_a = 0.1;
  let k_d = 0.8;
  let k_s = 1.0;
  let shininess = 10.0;

  const fovy = 45;
  const aspect = canvas.width / canvas.height;
  const near = 0.1;
  const far = 100;

  // prettier-ignore
  const mst = mat4(
    1.0, 0.0, 0.0, 0.0,
    0.0, 1.0, 0.0, 0.0,
    0.0, 0.0, 0.5, 0.5,
    0.0, 0.0, 0.0, 1.0,
  );

  // prettier-ignore
  let projection = perspective(fovy, aspect, near, far);
  projection = mult(mst, projection);

  // Camera orbit
  let angle = 0; // Orbit angle
  const radius = 5; // Orbit radius
  let orbitEnabled = false; // Orbit control
  const orbitButton = document.getElementById('orbitButton');
  orbitButton.onclick = () => {
    orbitEnabled = !orbitEnabled;
    orbitButton.textContent = orbitEnabled ? 'Orbit: ON' : 'Orbit: OFF';
  };

  // Models
  const centering = translate(0, 0, 0);
  const model = centering;

  // Uniform buffer
  const uniformBuffer = device.createBuffer({
    size: sizeof['mat4'] + 4 * 8,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: wgsl,
      entryPoint: 'main_vs',
      buffers: [positionBufferLayout, colorBufferLayout, normalBufferLayout],
    },
    fragment: {
      module: wgsl,
      entryPoint: 'main_fs',
      targets: [{ format: canvasFormat }],
    },
    primitive: {
      topology: 'triangle-list',
      cullMode: 'back',
    },
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: 'less',
      format: 'depth24plus',
    },
  });

  const msaaCount = 1;
  const depthTexture = device.createTexture({
    size: { width: canvas.width, height: canvas.height },
    format: 'depth24plus',
    sampleCount: msaaCount,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: { buffer: uniformBuffer },
      },
    ],
  });

  function render() {
    if (orbitEnabled) {
      angle += 0.01; // Update orbit angle
    }
    const eye = vec3(radius * Math.sin(angle), 0, radius * Math.cos(angle)); // Camera position
    const at = vec3(0, 0, 0); // Look-at point
    const up = vec3(0, 1, 0); // Up vector

    const view = lookAt(eye, at, up);
    const mvp = mult(projection, mult(view, model));

    const uniformData = new Float32Array([
      ...flatten(eye),
      L_e,
      L_a,
      k_d,
      k_s,
      shininess,
    ]);

    device.queue.writeBuffer(uniformBuffer, 0, flatten(mvp));
    device.queue.writeBuffer(uniformBuffer, sizeof['mat4'], uniformData);
    // Create a render pass in a command buffer and submit it
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: {
            r: backgroundColor.r,
            g: backgroundColor.g,
            b: backgroundColor.b,
            a: backgroundColor.a,
          },
        },
      ],
      depthStencilAttachment: {
        view: depthTexture.createView(),
        depthLoadOp: 'clear',
        depthClearValue: 1.0,
        depthStoreOp: 'store',
      },
    });

    pass.setBindGroup(0, bindGroup);
    pass.setPipeline(pipeline);
    pass.setVertexBuffer(0, positionBuffer);
    pass.setVertexBuffer(1, colorBuffer);
    pass.setVertexBuffer(2, normalBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint32');
    pass.drawIndexed(indices.length);

    pass.end();
    device.queue.submit([encoder.finish()]);

    requestAnimationFrame(render);
  }
  render();
}
