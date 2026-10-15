// Shared procedural thermal contours for community headers and campaign cards.
(() => {
  'use strict';
  document.querySelectorAll('[data-voices-heat]').forEach((canvas) => {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, preserveDrawingBuffer: true });
  if (!gl) return; // The CSS gradient remains as a static fallback.
  const vertex = 'attribute vec2 position; void main(){gl_Position=vec4(position,0.,1.);}';
  const fragment = `
    precision mediump float;
    uniform vec2 resolution;
    uniform float time;
    uniform float patternScale;
    uniform float intensity;
    uniform float darkCenter;
    uniform float cta;
    uniform vec2 ctaCenter;
    uniform vec2 ctaRadius;
    uniform float wordmark;
    uniform float header;
    float field(vec2 p) {
      return sin(p.x*3.1 + sin(p.y*2.4 + time*.16)*1.7 + time*.19)
        + sin(p.y*4.3 - time*.13 + cos(p.x*2.6-time*.11)*1.6)
        + .55*sin(p.x*5.2+p.y*3.2+time*.09);
    }
    vec3 thermal(float v) {
      vec3 c=vec3(69./255.,205./255.,246./255.);
      c=mix(c,vec3(0.,205./255.,232./255.),smoothstep(0.,.12,v));
      c=mix(c,vec3(20./255.,201./255.,128./255.),smoothstep(.12,.27,v));
      c=mix(c,vec3(184./255.,239./255.,25./255.),smoothstep(.27,.42,v));
      c=mix(c,vec3(1.,220./255.,0.),smoothstep(.42,.58,v));
      c=mix(c,vec3(1.,50./255.,32./255.),smoothstep(.58,.82,v));
      c=mix(c,vec3(235./255.,21./255.,40./255.),smoothstep(.82,1.,v));
      return c;
    }
    vec3 wordmarkThermal(float v) { return thermal(v); }
    void main(){
      vec2 uv=gl_FragCoord.xy/resolution;
      if (wordmark > .5) {
        // Three soft fields join and separate while a slow warp stretches
        // their contours. Color follows field strength, not a moving circle.
        vec2 q=uv;
        q += .035*vec2(sin(uv.y*11.+time*.29), cos(uv.x*9.-time*.23));
        vec2 travel=vec2(.5+.29*sin(time*.17), .5+.22*sin(time*.21+.8));
        vec2 a=travel+vec2(.07*cos(time*.33), .09*sin(time*.27));
        vec2 b=travel+vec2(.13*sin(time*.25+1.7), .16*cos(time*.31));
        vec2 c=travel+vec2(.17*cos(time*.19+2.3), .13*sin(time*.37+1.1));
        vec2 da=(q-a)/vec2(.13,.22);
        vec2 db=(q-b)/vec2(.11,.18);
        vec2 dc=(q-c)/vec2(.10,.16);
        float density=exp(-dot(da,da)*2.)
          + .85*exp(-dot(db,db)*2.) + .7*exp(-dot(dc,dc)*2.);
        float coverage=smoothstep(.19,.38,density);
        vec3 color=wordmarkThermal(clamp((density-.19)*.85, 0., 1.));
        gl_FragColor=vec4(mix(vec3(1.),color,coverage),1.);
        return;
      }
      vec2 p=(uv-.5)*vec2(resolution.x/resolution.y,1.)*patternScale;
      float v=clamp(.5+field(p)*.20,0.,1.);
      vec3 color=thermal(v);
      if (header > .5) {
        // Saturated thermal pools with a compact transition between color bands.
        v=smoothstep(.12,.88,v);
        color=thermal(v);
        // Warp the shaded region with the same field as the colored pools.
        // Attenuate their color rather than painting a flat dark oval over it.
        vec2 flow=vec2(field(p*.65),field(p*.65+vec2(2.7,1.9)));
        vec2 shelter=(uv-vec2(darkCenter,.43)+flow*.045)/vec2(.46,.72);
        float shade=exp(-dot(shelter,shelter)*1.75);
        float contours=.5+.5*sin(field(p)*.8);
        vec3 shaded=mix(color,vec3(.025,.24,.23),shade*.58);
        shaded*=1.-shade*(.72+.08*contours);
        if (cta > .5) {
          // Fit one soft dark pool around the icon and label together above,
          // or just the centered label in the bottom dock.
          vec2 pool=(uv-ctaCenter+flow*.018)/ctaRadius;
          float distanceSquared=dot(pool,pool);
          float coverage=exp(-distanceSquared*distanceSquared*.8);
          // Keep the thermal colors visible through a gentler teal shade.
          shaded=mix(color,vec3(.025,.24,.23),coverage*.28);
          shaded*=1.-coverage*(.42+.03*contours);
        }
        gl_FragColor=vec4(shaded,1.);
        return;
      }
      // A dark column follows the content on both narrow and wide cards.
      float center=1.-smoothstep(.10,.49,abs(uv.x-darkCenter));
      float brightness=mix(.75,.08,center)*intensity;
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
  const isWordmark = canvas.dataset.heatVariant === 'wordmark';
  gl.uniform1f(gl.getUniformLocation(program, 'wordmark'), isWordmark ? 1 : 0);
  const isHeader = canvas.parentElement.classList.contains('cw-hero') || canvas.dataset.heatVariant === 'header';
  gl.uniform1f(gl.getUniformLocation(program, 'header'), isHeader ? 1 : 0);
  const patternScale = Number(canvas.dataset.heatScale) || (isHeader ? 1.8 : 2.6);
  const patternScaleUniform = gl.getUniformLocation(program, 'patternScale');
  const intensity = gl.getUniformLocation(program, 'intensity');
  const darkCenter = gl.getUniformLocation(program, 'darkCenter');
  const isCta = canvas.parentElement.matches('.archive-community, .archive-dock__wall');
  gl.uniform1f(gl.getUniformLocation(program, 'cta'), isCta ? 1 : 0);
  const ctaCenter = gl.getUniformLocation(program, 'ctaCenter');
  const ctaRadius = gl.getUniformLocation(program, 'ctaRadius');
  const ctaContent = Array.from(canvas.parentElement.querySelectorAll(
    '.archive-community__icon, .archive-community__text, .archive-dock__label'
  ));
  const mobile = matchMedia('(max-width: 759px)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let visible = false, lost = false, frameId = 0, elapsed = 0, previous = 0;
  function draw() {
    if (isCta && ctaContent.length) {
      const bounds = canvas.getBoundingClientRect();
      const panels = ctaContent.map(element => element.getBoundingClientRect());
      const left = Math.min(...panels.map(panel => panel.left));
      const right = Math.max(...panels.map(panel => panel.right));
      const top = Math.min(...panels.map(panel => panel.top));
      const bottom = Math.max(...panels.map(panel => panel.bottom));
      const width = Math.max(bounds.width, 1), height = Math.max(bounds.height, 1);
      gl.uniform2f(ctaCenter, ((left + right) / 2 - bounds.left) / width,
        1 - ((top + bottom) / 2 - bounds.top) / height);
      gl.uniform2f(ctaRadius, (right - left) / (2 * width) + .15,
        Math.max(1.1, (bottom - top) / (2 * height) + .5));
    }
    // Broader thermal pools on desktop headers; preserve mobile sizing.
    gl.uniform1f(patternScaleUniform, patternScale * (isHeader && !mobile.matches ? 0.65 : 1));
    gl.uniform1f(darkCenter, .5);
    gl.uniform1f(intensity, isHeader ? (mobile.matches ? 1. : .85) : 1);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(resolution, canvas.width, canvas.height);
    gl.uniform1f(time, reduced.matches ? 0 : elapsed * (isHeader ? 0.5 : 1));
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (isWordmark) canvas.parentElement.classList.add('has-heat');
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
    if (isWordmark) canvas.parentElement.classList.remove('has-heat');
  });
  // Reloading the page restores animation after context loss; content remains usable.
  });
})();

