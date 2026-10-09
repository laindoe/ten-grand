// Original procedural thermal contours, confined to the Voices Heard title card.
(() => {
  'use strict';
  const canvas = document.querySelector('[data-voices-heat]');
  if (!canvas) return;
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, preserveDrawingBuffer: true });
  if (!gl) return; // The CSS gradient remains as a static fallback.
  const vertex = 'attribute vec2 position; void main(){gl_Position=vec4(position,0.,1.);}';
  const fragment = `
    precision mediump float;
    uniform vec2 resolution;
    uniform float time;
    float field(vec2 p) {
      return sin(p.x*3.1 + sin(p.y*2.4 + time*.16)*1.7 + time*.19)
        + sin(p.y*4.3 - time*.13 + cos(p.x*2.6-time*.11)*1.6)
        + .55*sin(p.x*5.2+p.y*3.2+time*.09);
    }
    vec3 thermal(float v) {
      vec3 c = vec3(.015,.015,.025);
      c=mix(c,vec3(.03,.04,1.),smoothstep(.25,.39,v));
      c=mix(c,vec3(.0,.85,.7),smoothstep(.39,.48,v));
      c=mix(c,vec3(.18,1.,.02),smoothstep(.48,.57,v));
      c=mix(c,vec3(1.,.92,.0),smoothstep(.57,.65,v));
      c=mix(c,vec3(1.,.12,.02),smoothstep(.65,.74,v));
      c=mix(c,vec3(1.,.0,.43),smoothstep(.74,.83,v));
      return c;
    }
    void main(){
      vec2 uv=gl_FragCoord.xy/resolution;
      vec2 p=(uv-.5)*vec2(resolution.x/resolution.y,1.)*2.6;
      float v=clamp(.5+field(p)*.20,0.,1.);
      vec3 color=thermal(v);
      // A dark column follows the content on both narrow and wide cards.
      float center=1.-smoothstep(.10,.49,abs(uv.x-.5));
      float brightness=mix(.48,.055,center);
      gl_FragColor=vec4(mix(vec3(.078),color,brightness),1.);
    }`;
  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); return null; }
    return shader;
  }
  const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
  if (!vs || !fs) return;
  const program = gl.createProgram();
  gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const resolution = gl.getUniformLocation(program, 'resolution');
  const time = gl.getUniformLocation(program, 'time');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let visible = false, lost = false, frameId = 0, elapsed = 0, previous = 0;
  function draw() {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(resolution, canvas.width, canvas.height);
    gl.uniform1f(time, reduced.matches ? 0 : elapsed);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  function frame(now) {
    frameId = 0;
    // Limit updates to 30 fps; time only advances while visible.
    if (now - previous >= 1000 / 30) {
      elapsed += previous ? Math.min((now - previous) / 1000, .1) : 0;
      previous = now;
      draw();
    }
    frameId = requestAnimationFrame(frame);
  }
  function sync() {
    cancelAnimationFrame(frameId); frameId = 0; previous = 0;
    if (lost) return;
    draw();
    if (visible && !document.hidden && !reduced.matches) frameId = requestAnimationFrame(frame);
  }
  new ResizeObserver(() => {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(devicePixelRatio || 1, 1.5, 1000 / Math.max(rect.width, rect.height));
    canvas.width = Math.max(1, Math.round(rect.width * scale));
    canvas.height = Math.max(1, Math.round(rect.height * scale));
    sync();
  }).observe(canvas.parentElement);
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }).observe(canvas);
  reduced.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault(); lost = true; cancelAnimationFrame(frameId); canvas.style.visibility = 'hidden';
  });
  // Reloading the page restores animation after context loss; content remains usable.
})();
