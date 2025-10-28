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
  const wgslcode = await fetch(wgslfile, {
    cache: 'reload',
  }).then((r) => r.text());
  const wgsl = device.createShaderModule({
    code: wgslcode,
  });

  // Points and position buffer
  const point_size = 20 * (2 / canvas.height);
  var positions = [vec2(0, 0)];
  var colors = [vec3(0, 0, 0)];

  // Circle
  const radius = 0.5 - point_size;
  const num_points = 100; // More points = smoother circle

  for (let i = 0; i <= num_points; i++) {
    const theta = (2 * Math.PI * i) / num_points;

    const x1 = radius * Math.cos(theta);
    const y1 = radius * Math.sin(theta);

    // Push (edge, center, edge)
    positions.push(vec2(x1, y1), positions[0], vec2(x1, y1));
    colors.push(vec3(1, 0.6, 0), vec3(1, 0, 0), vec3(1, 0.6, 0));
  }
  positions.pop();
  colors.pop();

  const positionBuffer = device.createBuffer({
    size: flatten(positions).byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(
    positionBuffer,
    /*bufferOffset=*/ 0,
    flatten(positions)
  );

  const positionBufferLayout = {
    arrayStride: sizeof['vec2'],
    attributes: [
      {
        format: 'float32x2',
        offset: 0,
        shaderLocation: 0, // Position, see vertex shader
      },
    ],
  };

  // Color buffer
  const colorBuffer = device.createBuffer({
    size: flatten(colors).byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(colorBuffer, /*bufferOffset=*/ 0, flatten(colors));

  const colorBufferLayout = {
    arrayStride: sizeof['vec3'],
    attributes: [
      {
        format: 'float32x3',
        offset: 0,
        shaderLocation: 1, // Color, see fragment shader
      },
    ],
  };

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: wgsl,
      entryPoint: 'main_vs',
      buffers: [positionBufferLayout, colorBufferLayout],
    },
    fragment: {
      module: wgsl,
      entryPoint: 'main_fs',
      targets: [{ format: canvasFormat }],
    },
    primitive: { topology: 'triangle-list' },
  });

  // Uniforms and bind group
  let bytelength = 5 * sizeof['vec4']; // Buffers are allocated in vec4 chunks
  let uniforms = new ArrayBuffer(bytelength);
  const uniformBuffer = device.createBuffer({
    size: uniforms.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
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

  function render(time) {
    const t = time * 0.01;
    const amplitude = 1 - radius; // Goes to the edge
    const speed = 0.3;

    const uniformFloats = new Float32Array(uniforms);
    uniformFloats[0] = Math.cos(t * speed) * amplitude; // y offset

    device.queue.writeBuffer(uniformBuffer, 0, uniforms);

    // Create a render pass in a command buffer and submit it
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: {
            r: 0.3921,
            g: 0.5843,
            b: 0.9294,
            a: 1.0,
          },
        },
      ],
    });

    // Insert render pass commands here
    pass.setPipeline(pipeline);
    pass.setVertexBuffer(0, positionBuffer);
    pass.setVertexBuffer(1, colorBuffer);
    pass.setBindGroup(0, bindGroup);
    pass.draw(positions.length);

    pass.end();
    device.queue.submit([encoder.finish()]);

    requestAnimationFrame(render);
  }

  render();
}
