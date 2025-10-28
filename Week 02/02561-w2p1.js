"use strict";
window.onload = function () {
  main();
};
async function main() {
  const gpu = navigator.gpu;
  const adapter = await gpu.requestAdapter();
  const device = await adapter.requestDevice();
  const canvas = document.getElementById("webgl");
  const context = canvas.getContext("webgpu");
  const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device: device,
    format: canvasFormat,
  });

  const wgslfile = document.getElementById("wgsl").src;
  const wgslcode = await fetch(wgslfile, { cache: "reload" }).then(
    (r) => r.text()
  );
  const wgsl = device.createShaderModule({
    code: wgslcode,
  });

  const point_size = 20 * (2 / canvas.height);

  var offset = vec2(0.0, 0.0); // v_t
  var velocity = vec2(0.0, 0.0); // w_t
  var mousepos = vec2(0.0, 0.0);
  var index = 0;

  canvas.addEventListener("click", function (ev) {
    var positions = [];
    var bbox = ev.target.getBoundingClientRect();
    // Get the click position
    mousepos = vec2(
      (2 * (ev.clientX - bbox.left)) / canvas.width - 1,
      (2 * (canvas.height - ev.clientY + bbox.top - 1)) /
        canvas.height -
        1
    );
    add_point(positions, mousepos, point_size);

    device.queue.writeBuffer(
      positionBuffer,
      index * sizeof["vec2"],
      flatten(positions)
    );
    index += verts_per_point;

    console.log("clicked on " + mousepos);
    console.log("positions: " + positions.length);
    render();
  });

  const max_no_of_points = 5000;
  const verts_per_point = 6; // 2 triangles per point
  const positionBuffer = device.createBuffer({
    size: max_no_of_points * sizeof["vec2"] * verts_per_point,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });

  const positionBufferLayout = {
    arrayStride: sizeof["vec2"],
    attributes: [
      {
        format: "float32x2",
        offset: 0,
        shaderLocation: 0, // Position, see vertex shader
      },
    ],
  };

  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: wgsl,
      entryPoint: "main_vs",
      buffers: [positionBufferLayout],
    },
    fragment: {
      module: wgsl,
      entryPoint: "main_fs",
      targets: [{ format: canvasFormat }],
    },
    primitive: { topology: "triangle-list" },
  });

  function render() {
    // Create a render pass in a command buffer and submit it
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0.3921, g: 0.5843, b: 0.9294, a: 1.0 },
        },
      ],
    });

    // Insert render pass commands here
    pass.setPipeline(pipeline);
    pass.setVertexBuffer(0, positionBuffer);
    pass.draw(index);

    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  render();
}

function add_point(array, point, size) {
  const offset = size / 2;
  var point_coords = [
    vec2(point[0] - offset, point[1] - offset),
    vec2(point[0] + offset, point[1] - offset),
    vec2(point[0] - offset, point[1] + offset),
    vec2(point[0] - offset, point[1] + offset),
    vec2(point[0] + offset, point[1] - offset),
    vec2(point[0] + offset, point[1] + offset),
  ];
  array.push.apply(array, point_coords);
}
