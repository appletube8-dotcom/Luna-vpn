// Lightweight WebGL sculpture. No external packages or analytics.
(() => {
  const canvas=document.querySelector('#sculpture'); if(!canvas)return;
  function fallback(){
    canvas.hidden=true;const scene=document.createElement('div');scene.className='css-sculpture';scene.setAttribute('aria-hidden','true');
    for(let ring=0;ring<3;ring++){const torus=document.createElement('div');torus.className='css-ring ring-'+ring;for(let i=0;i<19;i++){const z=(i-9)*1.4,s=Math.sqrt(Math.max(0,14*14-z*z)),layer=document.createElement('i');layer.style.cssText=`width:${150+s*2}px;height:${150+s*2}px;border-width:${Math.max(1,s*2)}px;transform:translate(-50%,-50%) translateZ(${z}px);opacity:${.45+s/30}`;torus.appendChild(layer);}scene.appendChild(torus);}
    canvas.parentNode.insertBefore(scene,canvas);const btn=document.querySelector('#motion');let stop=matchMedia('(prefers-reduced-motion:reduce)').matches;scene.classList.toggle('paused',stop);btn.setAttribute('aria-pressed',stop);btn.addEventListener('click',()=>{stop=!stop;scene.classList.toggle('paused',stop);btn.textContent=stop?'▷':'Ⅱ';btn.setAttribute('aria-pressed',stop);btn.setAttribute('aria-label',stop?'Продолжить анимацию':'Приостановить анимацию');});
    new IntersectionObserver(entries=>scene.classList.toggle('offscreen',!entries[0].isIntersecting),{threshold:.01}).observe(scene);
  }
  const gl=canvas.getContext('webgl',{alpha:true,antialias:true,powerPreference:'low-power'});
  if(!gl){fallback();return;}
  const vert=`attribute vec3 aP;attribute vec3 aN;uniform vec3 uR;uniform float uA;varying vec3 vN;varying vec3 vP;
  vec3 rot(vec3 p){float x=uR.x,y=uR.y,z=uR.z;p=vec3(p.x,p.y*cos(x)-p.z*sin(x),p.y*sin(x)+p.z*cos(x));p=vec3(p.x*cos(y)+p.z*sin(y),p.y,-p.x*sin(y)+p.z*cos(y));return vec3(p.x*cos(z)-p.y*sin(z),p.x*sin(z)+p.y*cos(z),p.z);}
  void main(){vec3 p=rot(aP);vP=p;vN=rot(aN);p.z-=5.0;float f=2.05;gl_Position=vec4(p.x*f/uA,p.y*f,-1.004*p.z-.2004,-p.z);}`;
  const frag=`precision mediump float;varying vec3 vN;varying vec3 vP;uniform float uTone;
  void main(){vec3 n=normalize(vN);vec3 view=normalize(vec3(0.,0.,5.)-vP);float edge=pow(1.-max(dot(n,view),0.),2.6);float light=max(dot(n,normalize(vec3(-.7,1.,1.))),0.);float band=pow(max(dot(reflect(normalize(vec3(.7,-1.,-1.)),n),view),0.),28.);vec3 c=vec3(.075,.07,.1)+vec3(.57,.56,.63)*pow(light,2.2)+vec3(.6,.48,.83)*edge*.75+vec3(.9,.83,1.)*band;c+=vec3(.06,.04,.1)*uTone;gl_FragColor=vec4(c,1.);}`;
  function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('shader');return s;}
  let program;try{program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vert));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,frag));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('link');}catch{fallback();return;}
  gl.useProgram(program);
  const vertices=[],normals=[],indices=[],segments=96,tube=22;
  for(let i=0;i<=segments;i++)for(let j=0;j<=tube;j++){const u=i/segments*Math.PI*2,v=j/tube*Math.PI*2;const nx=Math.cos(u)*Math.cos(v),ny=Math.sin(u)*Math.cos(v),nz=Math.sin(v);vertices.push((1.15+.16*Math.cos(v))*Math.cos(u),(1.15+.16*Math.cos(v))*Math.sin(u),.16*nz);normals.push(nx,ny,nz);if(i<segments&&j<tube){const a=i*(tube+1)+j,b=a+tube+1;indices.push(a,b,a+1,b,b+1,a+1);}}
  function attrib(name,data){const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);const a=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,3,gl.FLOAT,false,0,0);}
  attrib('aP',vertices);attrib('aN',normals);const ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);gl.enable(gl.DEPTH_TEST);
  const rot=gl.getUniformLocation(program,'uR'),aspect=gl.getUniformLocation(program,'uA'),tone=gl.getUniformLocation(program,'uTone');
  let frame=0,visible=false,paused=false,time=0,last=0,lost=false;const reduce=matchMedia('(prefers-reduced-motion:reduce)');
  function draw(ts=0){frame=0;if(lost)return;const dpr=Math.min(devicePixelRatio||1,1.5),w=Math.round(canvas.clientWidth*dpr),h=Math.round(canvas.clientHeight*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniform1f(aspect,w/Math.max(1,h));if(last&&ts&&!paused&&!reduce.matches)time+=Math.min(ts-last,50)*.00012;last=ts;
    [[.7+time*.35,time,.25],[1.7+time*.2,1.1+time,-.4],[.4+time*.15,1.5-time*.5,1.1]].forEach((r,i)=>{gl.uniform3fv(rot,r);gl.uniform1f(tone,i);gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0);});if(visible&&!paused&&!reduce.matches&&!document.hidden)frame=requestAnimationFrame(draw);}
  function resume(){if(frame)cancelAnimationFrame(frame);frame=0;last=0;if(visible)draw();}
  const control=document.querySelector('#motion');control.addEventListener('click',()=>{paused=!paused;control.textContent=paused?'▷':'Ⅱ';control.setAttribute('aria-label',paused?'Продолжить анимацию':'Приостановить анимацию');control.setAttribute('aria-pressed',paused);resume();});
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;resume();},{threshold:.01}).observe(canvas);
  document.addEventListener('visibilitychange',resume);window.addEventListener('resize',resume);reduce.addEventListener('change',resume);canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;if(frame)cancelAnimationFrame(frame);});draw();
})();
