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

  // prettier-ignore
  const vertices = new Float32Array([
    // Bottom face (z=0)
    0, 0, 0,  // 0
    1, 0, 0,  // 1
    1, 1, 0,  // 2
    0, 1, 0,  // 3
    // Top face (z=1)
    0, 0, 1,  // 4
    1, 0, 1,  // 5
    1, 1, 1,  // 6
    0, 1, 1,  // 7
  ]);

  // prettier-ignore
  // Wireframe indices
  let wire_indices = new Uint32Array([
    0, 1, 1, 2, 2, 3, 3, 0, // front
    2, 3, 3, 7, 7, 6, 6, 2, // right
    0, 3, 3, 7, 7, 4, 4, 0, // down
    1, 2, 2, 6, 6, 5, 5, 1, // up
    4, 5, 5, 6, 6, 7, 7, 4, // back
    0, 1, 1, 5, 5, 4, 4, 0 // left
  ]);

  const vertexBuffer = device.createBuffer({
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vertexBuffer, 0, vertices);

  const indexBuffer = device.createBuffer({
    size: wire_indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, wire_indices);

  const vertexBufferLayout = {
    arrayStride: 3 * 4,
    attributes: [
      {
        format: 'float32x3',
        offset: 0,
        shaderLocation: 0, // Position, see vertex shader
      },
    ],
  };

  const eye = vec3(0, 0, 7); // Camera position
  const at = vec3(0, 0, 0); // Look-at point
  const up = vec3(0, 1, 0); // Up vector

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
  const view = lookAt(eye, at, up);

  // Models
  const centering = translate(-0.5, -0.5, -0.5);
  const model_cube = mult(translate(0, 0, 0), mult(rotateY(30), centering)); // center

  const models = [model_cube];
  const mvps = models.map((model) => mult(projection, mult(view, model)));

  // Uniform buffer
  const uniformBuffer = device.createBuffer({
    size: sizeof['mat4'] * 3,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: wgsl,
      entryPoint: 'main_vs',
      buffers: [vertexBufferLayout],
    },
    fragment: {
      module: wgsl,
      entryPoint: 'main_fs',
      targets: [{ format: canvasFormat }],
    },
    primitive: { topology: 'line-list' },
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
  device.queue.writeBuffer(uniformBuffer, 0, flatten(mvps[0]));

  // Create a render pass in a command buffer and submit it
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0.3921, g: 0.5843, b: 0.9294, a: 1.0 },
      },
    ],
  });

  pass.setBindGroup(0, bindGroup);
  pass.setPipeline(pipeline);
  pass.setVertexBuffer(0, vertexBuffer);
  pass.setIndexBuffer(indexBuffer, 'uint32');
  pass.drawIndexed(wire_indices.length, 3);

  pass.end();
  device.queue.submit([encoder.finish()]);
}
