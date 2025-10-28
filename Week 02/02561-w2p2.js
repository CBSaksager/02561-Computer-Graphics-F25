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

  var colorMenu = document.getElementById("colorMenu");
  var colors = [
    vec4(0.3921, 0.5843, 0.9294, 1.0), // light blue
    vec4(0.0, 0.0, 0.0, 1.0), // black
    vec4(1.0, 0.0, 0.0, 1.0), // red
    vec4(1.0, 1.0, 0.0, 1.0), // yellow
    vec4(0.0, 1.0, 0.0, 1.0), // green
    vec4(0.0, 0.0, 1.0, 1.0), // blue
    vec4(1.0, 0.0, 1.0, 1.0), // magenta
    vec4(0.0, 1.0, 1.0, 1.0), // cyan
  ];

  var bgcolor = vec4(0.3921, 0.5843, 0.9294, 1.0);
  const point_size = 20 * (2 / canvas.height);

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

    let colorArray = [];
    colorArray.push(
      ...Array(verts_per_point).fill(colors[colorMenu.selectedIndex])
    );

    device.queue.writeBuffer(
      colorBuffer,
      index * sizeof["vec4"],
      flatten(colorArray)
    );

    index += verts_per_point;
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
        shaderLocation: 0,
      },
    ],
  };

  const colorBuffer = device.createBuffer({
    size: max_no_of_points * sizeof["vec4"] * verts_per_point,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });

  const colorBufferLayout = {
    arrayStride: sizeof["vec4"],
    attributes: [
      {
        format: "float32x4",
        offset: 0,
        shaderLocation: 1,
      },
    ],
  };

  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: wgsl,
      entryPoint: "main_vs",
      buffers: [positionBufferLayout, colorBufferLayout],
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
          clearValue: {
            r: bgcolor[0],
            g: bgcolor[1],
            b: bgcolor[2],
            a: bgcolor[3],
          },
        },
      ],
    });

    // Insert render pass commands here
    pass.setPipeline(pipeline);
    pass.setVertexBuffer(0, positionBuffer);
    pass.setVertexBuffer(1, colorBuffer);
    pass.draw(index);

    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  render();

  // -----------------------------
  // Buttons
  // -----------------------------
  var clearButton = document.getElementById("clearButton");
  var clearMenu = document.getElementById("clearMenu");
  clearButton.addEventListener("click", function (event) {
    bgcolor = colors[clearMenu.selectedIndex];
    index = 0;
    render();
  });
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
