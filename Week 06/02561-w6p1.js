'use strict';

function createCheckerboardTexture(texSize, rows, columns) {
  var myTexels = new Uint8Array(texSize * texSize * 4);
  for (var i = 0; i < texSize; i++) {
    for (var j = 0; j < texSize; j++) {
      var patchx = Math.floor((i / texSize) * rows);
      var patchy = Math.floor((j / texSize) * columns);
      var c = patchx % 2 == patchy % 2 ? 255 : 0;

      var idx = 4 * (i * texSize + j);
      myTexels[idx] = c; // R
      myTexels[idx + 1] = c; // G
      myTexels[idx + 2] = c; // B
      myTexels[idx + 3] = 255; // A
    }
  }
  return myTexels;
}

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
  let positions = [
    vec3(-4, -1, -1),
    vec3(4, -1, -1),
    vec3(4, -1, -21),
    vec3(-4, -1, -21),
  ];

  // prettier-ignore
  let indices = new Uint32Array([
    0, 1, 2,
    0, 2, 3,
  ]);

  const positionBuffer = device.createBuffer({
    size: sizeof['vec3'] * positions.length,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });

  const positionBufferLayout = {
    arrayStride: sizeof['vec3'],
    attributes: [
      {
        format: 'float32x3',
        offset: 0,
        shaderLocation: 0, // Position, see vertex shader
      },
    ],
  };

  // Texture stuff
  const textureCoords = [
    vec2(-1.5, 0.0),
    vec2(2.5, 0.0),
    vec2(2.5, 10),
    vec2(-1.5, 10),
  ];
  const textureCoordBuffer = device.createBuffer({
    size: sizeof['vec2'] * textureCoords.length,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  const textureCoordBufferLayout = {
    arrayStride: sizeof['vec2'],
    attributes: [
      {
        format: 'float32x2',
        offset: 0,
        shaderLocation: 1, // TexCoords, see vertex shader
      },
    ],
  };

  const texSize = 64;
  const myTexels = createCheckerboardTexture(texSize, 8, 8);
  const texture = device.createTexture({
    format: 'rgba8unorm',
    size: [texSize, texSize, 1],
    usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
  });
  device.queue.writeTexture(
    { texture },
    myTexels,
    { offset: 0, bytesPerRow: texSize * 4, rowsPerImage: texSize },
    [texSize, texSize, 1]
  );

  texture.sampler = device.createSampler({
    addressModeU: 'repeat',
    addressModeV: 'repeat',
    minFilter: 'nearest',
    magFilter: 'nearest',
    mipmapFilter: 'nearest',
  });

  const indexBuffer = device.createBuffer({
    size: sizeof['vec3'] * indices.length,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });

  // Write buffers
  device.queue.writeBuffer(positionBuffer, 0, flatten(positions));
  device.queue.writeBuffer(textureCoordBuffer, 0, flatten(textureCoords));
  device.queue.writeBuffer(indexBuffer, 0, indices);

  const backgroundColor = { r: 0.3921, g: 0.5843, b: 0.9294, a: 1.0 };

  const fovy = 90;
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
  const radius = 7; // Orbit radius

  // Models
  const centering = translate(0, 0, 0);
  const model = centering;

  // Uniform buffer
  const uniformBuffer = device.createBuffer({
    size: sizeof['mat4'] * 1,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: wgsl,
      entryPoint: 'main_vs',
      buffers: [positionBufferLayout, textureCoordBufferLayout],
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
      {
        binding: 1,
        resource: texture.sampler,
      },
      {
        binding: 2,
        resource: texture.createView(),
      },
    ],
  });

  function render() {
    angle += 0.0; // Update orbit angle
    const eye = vec3(radius * Math.sin(angle), 2, 0); // Camera position
    const at = vec3(0, 2, 0); // Look-at point
    const up = vec3(0, 1, 0); // Up vector

    const view = lookAt(eye, at, up);
    const mvp = mult(projection, mult(view, model));

    device.queue.writeBuffer(uniformBuffer, 0, flatten(mvp));
    // device.queue.writeBuffer(positionBuffer, 0, flatten(positions));
    // device.queue.writeBuffer(indexBuffer, 0, indices);

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
    pass.setVertexBuffer(1, textureCoordBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint32');
    pass.drawIndexed(indices.length, 1);

    pass.end();
    device.queue.submit([encoder.finish()]);

    requestAnimationFrame(render);
  }
  render();
}
