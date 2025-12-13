'use strict';

function subdivideSphere(positions, indices) {
  var triangles = indices.length / 3;
  var newIndices = [];
  for (let i = 0; i < triangles; i++) {
    var i0 = indices[i * 3 + 0];
    var i1 = indices[i * 3 + 1];
    var i2 = indices[i * 3 + 2];
    const c01 = positions.length;
    const c12 = positions.length + 1;
    const c20 = positions.length + 2;
    positions.push(normalize(add(positions[i0], positions[i1])));
    positions.push(normalize(add(positions[i1], positions[i2])));
    positions.push(normalize(add(positions[i2], positions[i0])));
    newIndices.push(i0, c01, c20, c20, c01, c12, c12, c01, i1, c20, c12, i2);
  }
  return newIndices;
}

function coarseSphere(indices) {
  var triangles = indices.length / 12;
  var newIndices = [];
  for (let i = 0; i < triangles; i++) {
    var i0 = indices[i * 12 + 0];
    var i1 = indices[i * 12 + 8];
    var i2 = indices[i * 12 + 11];
    newIndices.push(i0, i1, i2);
  }
  return newIndices;
}

function getInputs() {
  const textureEdgeMode = document.getElementById('TextEdgeMode').value;
  const minFilter = document.getElementById('minFilter').value;
  const magFilter = document.getElementById('magFilter').value;
  const mipmapFilter = document.getElementById('mipmapFilter').value;
  const mipmapEnabled = document.getElementById('mipmapEnabled').checked;

  return {
    textureEdgeMode,
    minFilter,
    magFilter,
    mipmapFilter,
    mipmapEnabled,
  };
}

function renderOnChange(e) {
  document.getElementById('TextEdgeMode').onchange = e;
  document.getElementById('minFilter').onchange = e;
  document.getElementById('magFilter').onchange = e;
  document.getElementById('mipmapFilter').onchange = e;
  document.getElementById('mipmapEnabled').onchange = e;
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

  const M_SQRT2 = Math.sqrt(2.0);
  const M_SQRT6 = Math.sqrt(6.0);
  // prettier-ignore
  let positions = [
    vec3(0.0, 0.0, 1.0),
    vec3(0.0, 2.0 * M_SQRT2 / 3.0, -1.0 / 3.0),
    vec3(-M_SQRT6 / 3.0, -M_SQRT2 / 3.0, -1.0 / 3.0),
    vec3(M_SQRT6 / 3.0, -M_SQRT2 / 3.0, -1.0 / 3.0),
  ];

  // prettier-ignore
  let indices = new Uint32Array([
    0, 1, 2,
    0, 3, 1,
    1, 3, 2,
    0, 2, 3
  ]);

  const cubemap = ['textures/cm_left.png', // POSITIVE_X
    'textures/cm_right.png', // NEGATIVE_X
    'textures/cm_top.png', // POSITIVE_Y
    'textures/cm_bottom.png', // NEGATIVE_Y
    'textures/cm_back.png', // POSITIVE_Z
    'textures/cm_front.png']; // NEGATIVE_Z

  let imgs = await Promise.all(
    cubemap.map(async (src) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.src = src;
        img.onload = () => {
          resolve(img);
        };
      });
    })
  );

  const quadPositions = [
    vec3(-1, -1, 0.999),
    vec3(-1, 1, 0.999),
    vec3(1, -1, 0.999),
    vec3(1, 1, 0.999),
  ]

  const quadIndices = new Uint32Array([
    0, 2, 1,
    2, 3, 1,
  ]);

  const initialSubdivisions = 6;
  for (let i = 0; i < initialSubdivisions; ++i) {
    indices = new Uint32Array(subdivideSphere(positions, indices));
  }
  const maxSubdivisionLevel = 8;

  const positionBuffer = device.createBuffer({
    size: sizeof['vec3'] * 4 ** (maxSubdivisionLevel + 1),
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });

  const indexBuffer = device.createBuffer({
    size: sizeof['vec3'] * 4 ** (maxSubdivisionLevel + 1),
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
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

  const backgroundColor = { r: 0, g: 0, b: 0, a: 1.0 };

  const fovy = 120;
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
  const radius = 3.5; // Orbit radius
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
    size: sizeof['mat4'] * 2,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const uniformBufferBg = device.createBuffer({
    size: sizeof['mat4'] * 2,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  let cubeSampler;
  function updateTexture() {
    const settings = getInputs();

    cubeSampler = device.createSampler({
      addressModeU: settings.textureEdgeMode,
      addressModeV: settings.textureEdgeMode,
      minFilter: settings.minFilter,
      magFilter: settings.magFilter,
      mipmapFilter: settings.mipmapFilter,
    });
  }
  updateTexture();

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: wgsl,
      entryPoint: 'main_vs',
      buffers: [positionBufferLayout],
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

  device.queue.writeBuffer(positionBuffer, 0, flatten(positions));
  device.queue.writeBuffer(indexBuffer, 0, indices);

  const cubeTex = device.createTexture({
    dimension: '2d',
    size: [imgs[0].width, imgs[0].height, 6],
    format: "rgba8unorm",
    usage: GPUTextureUsage.COPY_DST
      | GPUTextureUsage.TEXTURE_BINDING
      | GPUTextureUsage.RENDER_ATTACHMENT
  });

  imgs.forEach((image, i) => {
    device.queue.copyExternalImageToTexture(
      { source: image, flipY: true },
      { texture: cubeTex, origin: [0, 0, i] },
      { width: image.width, height: image.height }
    );
  });

  function render() {
    if (orbitEnabled) {
      angle += 0.005; // Update orbit angle
    }
    const eye = vec3(radius * Math.sin(angle), 0, radius * Math.cos(angle)); // Camera position
    const at = vec3(0, 0, 0); // Look-at point
    const up = vec3(0, 1, 0); // Up vector

    const view = lookAt(eye, at, up);
    const mvp_sphere = mult(projection, mult(view, model));
    const m_tex_sphere = mat4();
    const mvp_quad = mat4();

    const invProjection = inverse(projection);
    const invViewRotation = inverse(view);
    invViewRotation[0][3] = 0;
    invViewRotation[1][3] = 0;
    invViewRotation[2][3] = 0;
    invViewRotation[3][3] = 0;

    const m_tex_quad = mult(invViewRotation, invProjection);

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: { buffer: uniformBuffer },
        },
        {
          binding: 1,
          resource: cubeSampler,
        },
        {
          binding: 2,
          resource: cubeTex.createView({ dimension: 'cube' }),
        },
      ],
    });

    const bindGroupBg = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: { buffer: uniformBufferBg },
        },
        {
          binding: 1,
          resource: cubeSampler,
        },
        {
          binding: 2,
          resource: cubeTex.createView({ dimension: 'cube' }),
        },
      ],
    });

    device.queue.writeBuffer(uniformBuffer, 0, flatten(mvp_sphere));
    device.queue.writeBuffer(uniformBuffer, 64, flatten(m_tex_sphere));
    device.queue.writeBuffer(uniformBufferBg, 0, flatten(mvp_quad));
    device.queue.writeBuffer(uniformBufferBg, 64, flatten(m_tex_quad));

    device.queue.writeBuffer(positionBuffer, 0, flatten(quadPositions));
    device.queue.writeBuffer(indexBuffer, 0, quadIndices);
    device.queue.writeBuffer(positionBuffer, 4 * 3 * 4, flatten(positions));
    device.queue.writeBuffer(indexBuffer, 4 * 6, indices);

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

    pass.setPipeline(pipeline);
    pass.setVertexBuffer(0, positionBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint32');

    pass.setBindGroup(0, bindGroup);
    pass.drawIndexed(indices.length, 1, 6, 4);

    pass.setBindGroup(0, bindGroupBg);
    pass.drawIndexed(quadIndices.length, 1);

    pass.end();
    device.queue.submit([encoder.finish()]);

    requestAnimationFrame(render);
  }

  function updateAndRender() {
    updateTexture();
    render();
    const settings = getInputs();
    // Log each setting key and value
    Object.entries(settings).forEach(([key, value]) => {
      console.log(key);
      console.log(value);
    });
  }

  renderOnChange(updateAndRender);
  render();
}