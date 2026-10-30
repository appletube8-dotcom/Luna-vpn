/* Luna design study. Color + elevation: NASA's Scientific Visualization Studio. */
(() => {
  'use strict';
  const body = document.body;
  const mainCanvas = document.querySelector('#moon');
  const detailCanvas = document.querySelector('#detail-moon');
  const motion = document.querySelector('#motion');
  const stage = document.querySelector('#moon-stage');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = reduced.matches;
  let view = 'nasa';
  let longitude = -0.08;
  let dragStart = null;
  let visible = true;
  let last = 0;
  let frame = 0;
  let ready = false;
  let lastPaint = 0;
  const renderers = [];
  const vertex = `attribute vec2 aPosition;
varying vec2 vUv;
void main(){ vUv=aPosition*.5+.5; gl_Position=vec4(aPosition,0.,1.); }`;
  const fragment = `precision highp float;
varying vec2 vUv;
uniform sampler2D uColor;
uniform sampler2D uHeight;
uniform vec2 uSize;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uLongitude;
uniform float uLatitude;
uniform float uTilt;
uniform float uDetail;
const float PI=3.141592653589793;
vec2 mapUV(vec3 n){ return vec2(fract(.5+atan(n.x,n.z)/(2.*PI)),clamp(.5-asin(clamp(n.y,-1.,1.))/PI,.001,.999)); }
vec3 basis(vec3 n){
 float a=uLongitude,b=uLatitude;
 vec3 right=vec3(cos(a),0.,-sin(a));
 vec3 up=vec3(-sin(b)*sin(a),cos(b),-sin(b)*cos(a));
 vec3 front=vec3(cos(b)*sin(a),sin(b),cos(b)*cos(a));
 return right*n.x+up*n.y+front*n.z;
}
void main(){
 vec2 p=(vUv*uSize-uCenter)/uRadius;
 float r2=dot(p,p);
 if(r2>=1.){gl_FragColor=vec4(0.);return;}
 float aa=1.7/uRadius;
 float alpha=1.-smoothstep(1.-aa,1.,sqrt(r2));
 vec3 n=vec3(p,sqrt(max(0.,1.-r2)));
 float st=sin(uTilt),ct=cos(uTilt);
 vec3 screenN=vec3(ct*n.x-st*n.y,st*n.x+ct*n.y,n.z);
 vec3 local=basis(screenN);
 vec2 uv=mapUV(local);
 vec3 color=texture2D(uColor,uv).rgb;
 vec3 tangent=normalize(vec3(local.z,0.,-local.x)+vec3(.00001,0.,0.));
 vec3 bitangent=normalize(cross(local,tangent));
 float stepSize=.004;
 float hx=texture2D(uHeight,mapUV(normalize(local+tangent*stepSize))).r-texture2D(uHeight,mapUV(normalize(local-tangent*stepSize))).r;
 float hy=texture2D(uHeight,mapUV(normalize(local+bitangent*stepSize))).r-texture2D(uHeight,mapUV(normalize(local-bitangent*stepSize))).r;
 vec3 bumped=normalize(local-(tangent*hx+bitangent*hy)*1.6);
 vec3 light=basis(vec3(-.22,.22,.95));
 float diffuse=max(dot(bumped,normalize(light)),0.);
 float brightness=.36+.76*pow(diffuse,.55);
 float limb=mix(.84,1.,smoothstep(0.,.34,n.z));
 color=max(vec3(0.),(pow(max(color,vec3(0.)),vec3(1.1))-.4)*1.35+.4);
 color=mix(vec3(dot(color,vec3(.299,.587,.114))),color,.40);
 color*=vec3(1.06,1.025,.955)*brightness*limb;
 color=clamp(color,0.,1.);
 gl_FragColor=vec4(color,alpha);
}`;

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Moon asset unavailable'));
      img.src = url;
    });
  }

  function createRenderer(canvas, images, detail) {
    const gl = canvas.getContext('webgl', {alpha: true, antialias: false, depth: false, premultipliedAlpha: false, powerPreference: 'low-power'});
    if (!gl) throw new Error('WebGL unavailable');
    canvas.dataset.renderer = 'webgl';
    function shader(type, source) {
      const s = gl.createShader(type);
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    const program = gl.createProgram();
    const shaders = [shader(gl.VERTEX_SHADER, vertex), shader(gl.FRAGMENT_SHADER, fragment)];
    shaders.forEach(s => gl.attachShader(program, s));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    shaders.forEach(s => gl.deleteShader(s));
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    const attribute = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(attribute);
    gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
    images.forEach((img, i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      gl.uniform1i(gl.getUniformLocation(program, i === 0 ? 'uColor' : 'uHeight'), i);
    });
    const names = ['uSize','uCenter','uRadius','uLongitude','uLatitude','uTilt','uDetail'];
    const uniforms = Object.fromEntries(names.map(name => [name, gl.getUniformLocation(program, name)]));
    let inView = true;
    const observer = new IntersectionObserver(entries => {inView = entries[0].isIntersecting; if (inView) requestDraw();}, {rootMargin: '100px'});
    observer.observe(canvas);
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      if (!detail) showFallback();
    });
    canvas.addEventListener('webglcontextrestored', () => location.reload());
    return {draw() {
      if (!inView) return;
      const box = canvas.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const pixelRatio = Math.min(devicePixelRatio || 1, 1.65);
      const width = Math.round(box.width * pixelRatio), height = Math.round(box.height * pixelRatio);
      if (canvas.width !== width || canvas.height !== height) {canvas.width = width; canvas.height = height; gl.viewport(0,0,width,height);}
      const mobile = box.width < 650 && detail;
      const radius = detail ? Math.max(width * (mobile ? .98 : .51),height * .78) : Math.min(width,height) * .425;
      const center = detail ? [width * (mobile ? .30 : .30), height * (mobile ? -.28 : -.10)] : [width*.5,height*.5];
      gl.uniform2f(uniforms.uSize,width,height);
      gl.uniform2f(uniforms.uCenter,...center);
      gl.uniform1f(uniforms.uRadius,radius);
      gl.uniform1f(uniforms.uLongitude,detail ? longitude-.32 : longitude);
      gl.uniform1f(uniforms.uLatitude,detail ? -.55 : .035);
      gl.uniform1f(uniforms.uTilt,-.13);
      gl.uniform1f(uniforms.uDetail,detail ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES,0,6);
    }};
  }

  // A mapped sphere also works in browsers without GPU acceleration.
  function createSoftwareRenderer(canvas, images, detail) {
    const context = canvas.getContext('2d', {alpha: true});
    if (!context) throw new Error('Canvas unavailable');
    canvas.dataset.renderer = 'canvas';
    function pixels(image) {
      const buffer = document.createElement('canvas');
      buffer.width = image.naturalWidth;
      buffer.height = image.naturalHeight;
      const ctx = buffer.getContext('2d', {willReadFrequently: true});
      ctx.drawImage(image,0,0);
      return {data:ctx.getImageData(0,0,buffer.width,buffer.height).data,width:buffer.width,height:buffer.height};
    }
    const color = pixels(images[0]), heightMap = pixels(images[1]);
    const colorTable = Float32Array.from({length:256},(_,value) => Math.max(0,(Math.pow(value/255,1.1)-.4)*1.35+.4)*255);
    let inView = true, geometry = [], output = null;
    const observer = new IntersectionObserver(entries => {inView = entries[0].isIntersecting; if (inView) requestDraw();}, {rootMargin:'100px'});
    observer.observe(canvas);
    return {draw() {
      if (!inView) return;
      const box = canvas.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const ratio = Math.min(1.2,680/box.width);
      const width = Math.round(box.width*ratio), height = Math.round(box.height*ratio);
      if (canvas.width !== width || canvas.height !== height || !output) {
        canvas.width = width; canvas.height = height;
        output = context.createImageData(width,height);
        geometry = [];
        const mobile = box.width < 650 && detail;
        const radius = detail ? Math.max(width*(mobile ? .98 : .51),height*.78) : Math.min(width,height)*.425;
        const cx = width*.30, cy = height*(mobile ? -.28 : -.10);
        const centerX = detail ? cx : width*.5, centerY = detail ? cy : height*.5;
        const latitude = detail ? -.55 : .035, st = Math.sin(-.13), ct = Math.cos(-.13);
        for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
          const nx=(x+.5-centerX)/radius, ny=(height-y-.5-centerY)/radius;
          const radiusSquared=nx*nx+ny*ny;
          if (radiusSquared>=1) continue;
          const nz=Math.sqrt(1-radiusSquared), tx=ct*nx-st*ny, ty=st*nx+ct*ny;
          const localY=Math.cos(latitude)*ty+Math.sin(latitude)*nz;
          const localZ=-Math.sin(latitude)*ty+Math.cos(latitude)*nz;
          const u=.5+Math.atan2(tx,localZ)/(2*Math.PI), v=.5-Math.asin(Math.max(-1,Math.min(1,localY)))/Math.PI;
          const diffuse=Math.max(0,tx*-.22+ty*.22+nz*.95);
          const light=(.36+.76*Math.pow(diffuse,.55))*(.84+.16*Math.min(1,nz/.34));
          geometry.push([(y*width+x)*4,u,v,light]);
          output.data[(y*width+x)*4+3]=Math.min(255,(1-Math.sqrt(radiusSquared))*radius*255/1.3);
        }
      }
      const shift=(longitude+(detail ? -.32 : 0))/(2*Math.PI);
      const target=output.data, map=color.data, elevations=heightMap.data;
      for (const [index,baseU,v,light] of geometry) {
        const u=((baseU+shift)%1+1)%1;
        const x=Math.floor(u*color.width), y=Math.min(color.height-1,Math.floor(v*color.height));
        const position=(y*color.width+x)*4;
        const hx=Math.floor(u*heightMap.width), hy=Math.max(1,Math.min(heightMap.height-2,Math.floor(v*heightMap.height)));
        const right=(hy*heightMap.width+(hx+1)%heightMap.width)*4;
        const left=(hy*heightMap.width+(hx+heightMap.width-1)%heightMap.width)*4;
        const up=((hy-1)*heightMap.width+hx)*4, down=((hy+1)*heightMap.width+hx)*4;
        const bump=1+((elevations[down]-elevations[up])*.65-(elevations[right]-elevations[left])*.35)/255;
        const r=colorTable[map[position]],g=colorTable[map[position+1]],b=colorTable[map[position+2]];
        const grey=.299*r+.587*g+.114*b;
        target[index]=(grey*.6+r*.4)*light*bump*1.06;
        target[index+1]=(grey*.6+g*.4)*light*bump*1.025;
        target[index+2]=(grey*.6+b*.4)*light*bump*.955;
      }
      context.putImageData(output,0,0);
    }};
  }

  function makeRenderer(canvas,images,detail) {
    // Detect the renderer on a disposable canvas, preserving the real canvas
    // for the 2D fallback when WebGL is unavailable.
    const probe = document.createElement('canvas');
    const available = probe.getContext('webgl');
    if (available) {
      available.getExtension('WEBGL_lose_context')?.loseContext();
      return createRenderer(canvas,images,detail);
    }
    return createSoftwareRenderer(canvas,images,detail);
  }

  function draw(time = 0) {
    frame = 0;
    if (!visible || !ready) return;
    if (!paused && time-lastPaint<40) {frame=requestAnimationFrame(draw);return;}
    lastPaint=time;
    const elapsed = last ? Math.min((time - last)/1000,.12) : 0;
    last = time;
    if (!paused && !dragStart) longitude += elapsed * .034;
    renderers.forEach(renderer => renderer.draw());
    if (!paused && visible) frame = requestAnimationFrame(draw);
  }
  function requestDraw() {if (!frame && ready && visible) frame = requestAnimationFrame(draw);}
  function syncMotion() {
    motion.setAttribute('aria-pressed', String(paused));
    motion.setAttribute('aria-label', paused ? 'Включить вращение' : 'Остановить вращение');
    motion.querySelector('.motion-label').textContent = paused ? 'Вращать' : 'Пауза';
    motion.querySelector('.motion-symbol').textContent = paused ? '▷' : 'Ⅱ';
    last = 0;
    requestDraw();
  }
  function setView(next) {
    view = next;
    body.dataset.view = view;
    document.querySelectorAll('[data-view]').forEach(button => {
      if (button.tagName === 'BUTTON') button.setAttribute('aria-pressed', String(button.dataset.view === view));
    });
    motion.disabled = view === 'artist' || !ready;
    document.querySelector('.artist-moon').setAttribute('aria-hidden',String(view !== 'artist'));
    mainCanvas.setAttribute('aria-hidden',String(view !== 'nasa'));
    mainCanvas.tabIndex = view === 'nasa' ? 0 : -1;
    document.querySelector('#moon-caption').innerHTML = view === 'artist' ? 'ПОЛНАЯ ЛУНА <span>ХУДОЖЕСТВЕННЫЙ ОБРАЗ</span>' : 'ПОВЕРХНОСТЬ ЛУНЫ <span>NASA / LRO</span>';
    requestDraw();
  }
  function showFallback(error) {
    if (error) console.warn('Luna moon preview:', error.message || error);
    ready = false;
    cancelAnimationFrame(frame);
    frame = 0;
    body.classList.remove('webgl-ready');
    setView('artist');
    document.querySelector('#render-note').hidden = false;
    document.querySelector('button[data-view=nasa]').disabled = true;
  }
  document.querySelectorAll('button[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
  motion.addEventListener('click', () => {paused = !paused; syncMotion();});
  mainCanvas.addEventListener('pointerdown', event => {
    if (view !== 'nasa' || !ready) return;
    dragStart = {x: event.clientX, longitude};
    mainCanvas.setPointerCapture(event.pointerId);
    stage.classList.add('dragging');
  });
  mainCanvas.addEventListener('pointermove', event => {
    if (!dragStart) return;
    longitude = dragStart.longitude - (event.clientX - dragStart.x) * .006;
    requestDraw();
  });
  mainCanvas.addEventListener('keydown',event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    longitude += event.key === 'ArrowLeft' ? -.1 : .1;
    requestDraw();
  });
  ['pointerup','pointercancel','lostpointercapture'].forEach(name => mainCanvas.addEventListener(name, () => {dragStart = null; stage.classList.remove('dragging');}));
  reduced.addEventListener('change', event => {paused = event.matches; syncMotion();});
  document.addEventListener('visibilitychange', () => {visible = !document.hidden; last = 0; if (visible) requestDraw(); else {cancelAnimationFrame(frame); frame = 0;}});
  new ResizeObserver(requestDraw).observe(document.documentElement);
  motion.disabled = true;
  syncMotion();
  Promise.all([loadImage('assets/moon-color.jpg'),loadImage('assets/moon-height.jpg')]).then(images => {
    renderers.push(makeRenderer(mainCanvas,images,false),makeRenderer(detailCanvas,images,true));
    ready = true;
    body.classList.add('webgl-ready');
    setView(view);
    requestDraw();
  }).catch(showFallback);
})();
