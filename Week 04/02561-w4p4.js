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

  const maxSubdivisionLevel = 8;
  const minSubdivisionLevel = 0;
  let subdivisions = 0;
  const subdivisionText = document.getElementById('currentSubdivision');
  subdivisionText.textContent = subdivisions;

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
  const radius = 7; // Orbit radius
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

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: { buffer: uniformBuffer },
      },
    ],
  });

  device.queue.writeBuffer(positionBuffer, 0, flatten(positions));
  device.queue.writeBuffer(indexBuffer, 0, indices);

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
    pass.setIndexBuffer(indexBuffer, 'uint32');
    pass.drawIndexed(indices.length, 3);

    pass.end();
    device.queue.submit([encoder.finish()]);

    requestAnimationFrame(render);
  }
  render();

  // -----------------------------
  // Buttons
  // -----------------------------
  var subdivideButton = document.getElementById('increaseButton');
  var decreaseButton = document.getElementById('decreaseButton');

  // Increase subdivision
  subdivideButton.onclick = () => {
    console.log('Increase Subdivision');
    if (subdivisions < maxSubdivisionLevel) {
      subdivisions++;
      subdivisionText.textContent = subdivisions;
      indices = new Uint32Array(subdivideSphere(positions, indices));
      device.queue.writeBuffer(positionBuffer, 0, flatten(positions));
      device.queue.writeBuffer(indexBuffer, 0, indices);
    }
    requestAnimationFrame(render);
  };

  // Decrease subdivision (note: reversing the subdivision in-place isn't implemented here)
  decreaseButton.onclick = () => {
    console.log('Decrease Subdivision');
    if (subdivisions > minSubdivisionLevel) {
      subdivisions--;
      subdivisionText.textContent = subdivisions;
      indices = new Uint32Array(coarseSphere(indices));
      device.queue.writeBuffer(positionBuffer, 0, flatten(positions));
      device.queue.writeBuffer(indexBuffer, 0, indices);
    }
    requestAnimationFrame(render);
  };
}
