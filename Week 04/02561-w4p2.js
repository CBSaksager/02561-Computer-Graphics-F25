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
  const centering = translate(0, 0, 0);

  const models = [centering];
  const mvps = models.map((model) => mult(projection, mult(view, model)));

  // Uniform buffer
  const uniformBuffer = device.createBuffer({
    size: sizeof['mat4'] * mvps.length,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(uniformBuffer, 0, flatten(mvps[0]));

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
    primitive: { topology: 'triangle-list' },
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
    device.queue.writeBuffer(positionBuffer, 0, flatten(positions));
    device.queue.writeBuffer(indexBuffer, 0, indices);
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
    });

    pass.setBindGroup(0, bindGroup);
    pass.setPipeline(pipeline);
    pass.setVertexBuffer(0, positionBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint32');
    pass.drawIndexed(indices.length, 3);

    pass.end();
    device.queue.submit([encoder.finish()]);
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
    }
    requestAnimationFrame(render);
  };
}
