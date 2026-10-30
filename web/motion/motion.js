(() => {
  'use strict';
  const story = document.querySelector('#story');
  const stage = document.querySelector('#stage');
  const orb = document.querySelector('#orb');
  const terrain = document.querySelector('#terrain');
  const terrainShade = document.querySelector('#terrain-shade');
  const copyShade = document.querySelector('#copy-shade');
  const copies = ['hero-copy','detail-copy','account-copy','account-panel'].map(id => document.getElementById(id));
  const progressBar = document.querySelector('#progress');
  const play = document.querySelector('#play');
  const playLabel = document.querySelector('#play-label');
  const status = document.querySelector('#scene-status');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const seekButtons = [...document.querySelectorAll('[data-seek]')];
  let bounds = {}, target = 0, current = 0, frame = 0, last = 0, scene = '';
  let autoplay = null, seen = true;
  const clamp = (x,min=0,max=1) => Math.max(min,Math.min(max,x));
  const lerp = (a,b,t) => a+(b-a)*t;
  const ease = (a,b,value) => {const t=clamp((value-a)/(b-a));return t*t*(3-2*t);};

  function measure() {
    const box = story.getBoundingClientRect();
    bounds = {top:box.top+scrollY,travel:Math.max(1,story.offsetHeight-stage.offsetHeight),width:stage.clientWidth,height:stage.clientHeight};
    target=clamp((scrollY-bounds.top)/bounds.travel);
    if (reduced.matches) current=target;
    requestDraw();
  }
  function onScroll() {target=clamp((scrollY-bounds.top)/bounds.travel);requestDraw();}
  function requestDraw() {if (!frame && !document.hidden && seen) frame=requestAnimationFrame(draw);}
  function show(element,alpha,offset,base) {
    element.style.opacity=alpha.toFixed(4);
    element.style.transform=`${base} translate3d(0,${offset.toFixed(2)}px,0)`;
    const hidden=alpha<.42;
    if (element.inert!==hidden) {element.inert=hidden;element.setAttribute('aria-hidden',String(hidden));}
  }
  function render(progress) {
    const {width:w,height:h}=bounds;
    const mobile=w<=700;
    const p=reduced.matches ? (progress<.3 ? 0 : progress<.72 ? .51 : 1) : progress;
    const approach=ease(.12,.39,p), departure=ease(.65,.86,p);
    const base=mobile ? Math.min(w*.91,h*.48) : Math.min(h*.80,w*.55);
    const final=mobile ? w*1.62 : Math.min(h*1.47,w*1.15);
    const startX=w*(mobile ? .53 : .72),startY=h*(mobile ? .30 : .51);
    const closeX=w*(mobile ? .44 : .46),closeY=h*(mobile ? .56 : .67);
    const endX=w*(mobile ? -.27 : -.14),endY=h*(mobile ? .88 : .66);
    const diameter=departure>0 ? lerp(base*4.5,final,departure) : base*Math.pow(4.5,approach);
    const x=departure>0 ? lerp(closeX,endX,departure) : lerp(startX,closeX,approach);
    const y=departure>0 ? lerp(closeY,endY,departure) : lerp(startY,closeY,approach);
    const angle=lerp(-3,4,approach)-departure*7;
    const near=ease(.25,.40,p),far=ease(.66,.83,p);
    const orbAlpha=clamp(1-near+far);
    orb.style.width=`${base}px`;orb.style.height=`${base}px`;
    orb.style.transform=`translate3d(${(x-base/2).toFixed(2)}px,${(y-base/2).toFixed(2)}px,0) rotate(${angle.toFixed(3)}deg) scale(${(diameter/base).toFixed(5)})`;
    orb.style.opacity=orbAlpha.toFixed(4);
    const surfaceAlpha=near*(1-far);
    const flight=ease(.27,.76,p);
    terrain.style.opacity=surfaceAlpha.toFixed(4);
    terrain.style.transform=`translate3d(${lerp(1.5,-2.5,flight).toFixed(3)}%,${lerp(1,-1,flight).toFixed(3)}%,0) rotate(${lerp(-3,2,flight).toFixed(3)}deg) scale(${lerp(1.03,1.12,flight).toFixed(4)})`;
    terrainShade.style.opacity=(surfaceAlpha*.95).toFixed(4);
    copyShade.style.opacity=(1-surfaceAlpha).toFixed(4);
    const heroAlpha=1-ease(.08,.22,p);
    const detailAlpha=ease(.36,.45,p)*(1-ease(.61,.70,p));
    const accountAlpha=ease(.82,.94,p);
    show(copies[0],heroAlpha,-55*ease(.08,.22,p),mobile?'':'translateY(-43%)');
    show(copies[1],detailAlpha,28*(1-ease(.36,.45,p))-30*ease(.61,.70,p),'');
    show(copies[2],accountAlpha,38*(1-accountAlpha),mobile?'':'translateY(-38%)');
    show(copies[3],ease(.85,.97,p),45*(1-ease(.85,.97,p)),mobile?'':'translateY(-37%)');
    progressBar.style.transform=`scaleX(${progress.toFixed(5)})`;
    const next=p<.30?'hero':p<.75?'detail':'account';
    stage.dataset.progress=progress.toFixed(4);
    if (next!==scene) {
      scene=next;stage.dataset.scene=scene;
      const index=['hero','detail','account'].indexOf(scene);
      seekButtons.filter(button=>button.closest('.chapters')).forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));
      status.textContent=['Первый кадр: полная Луна и Luna VPN.','Второй кадр: приближение к поверхности и кратерам.','Третий кадр: край Луны и личный кабинет VPN.'][index];
    }
  }
  function draw(time) {
    frame=0;
    if (!seen || document.hidden) return;
    const elapsed=last?Math.min(time-last,80):16;last=time;
    if (autoplay) {
      const elapsedPlay=time-autoplay.started;
      const p=clamp(elapsedPlay/autoplay.duration);
      const value=lerp(autoplay.from,1,p);
      window.scrollTo({top:bounds.top+value*bounds.travel,behavior:'instant'});
      target=value;
      if (p===1) stopPlay();
    }
    current=reduced.matches?target:lerp(current,target,1-Math.exp(-elapsed/95));
    if (Math.abs(current-target)<.00002) current=target;
    render(current);
    if (autoplay || current!==target) requestDraw();
  }
  function stopPlay() {
    autoplay=null;
    play.setAttribute('aria-pressed','false');
    playLabel.textContent='Смотреть переход';
    play.querySelector('.play-icon').textContent='▷';
  }
  function seek(value) {
    stopPlay();
    window.scrollTo({top:bounds.top+Number(value)*bounds.travel,behavior:reduced.matches?'instant':'smooth'});
    requestDraw();
  }
  seekButtons.forEach(button=>button.addEventListener('click',()=>seek(button.dataset.seek)));
  document.querySelector('.brand').addEventListener('click',event=>{event.preventDefault();seek(0);});
  play.addEventListener('click',()=>{
    if (autoplay) {stopPlay();return;}
    if (reduced.matches) {seek(target<.3?.51:target<.8?1:0);return;}
    if (target>.95) {window.scrollTo({top:bounds.top,behavior:'instant'});target=0;current=0;}
    autoplay={started:performance.now(),from:target,duration:Math.max(6000,(1-target)*18000)};
    play.setAttribute('aria-pressed','true');playLabel.textContent='Остановить';play.querySelector('.play-icon').textContent='Ⅱ';
    requestDraw();
  });
  ['wheel','touchstart'].forEach(name=>window.addEventListener(name,()=>{if(autoplay)stopPlay();},{passive:true}));
  window.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(event.key)&&autoplay)stopPlay();});
  window.addEventListener('scroll',onScroll,{passive:true});
  window.addEventListener('resize',measure,{passive:true});
  new ResizeObserver(measure).observe(stage);
  new IntersectionObserver(entries=>{seen=entries[0].isIntersecting;if(seen){last=0;requestDraw();}else{cancelAnimationFrame(frame);frame=0;stopPlay();}},{threshold:0}).observe(story);
  reduced.addEventListener('change',()=>{stopPlay();last=0;measure();});
  document.addEventListener('visibilitychange',()=>{last=0;if(document.hidden){stopPlay();cancelAnimationFrame(frame);frame=0;}else requestDraw();});
  window.addEventListener('pagehide',()=>{stopPlay();cancelAnimationFrame(frame);});

  const dialog=document.querySelector('#dialog'),title=document.querySelector('#dialog-title'),content=document.querySelector('#dialog-content');
  const bot=String(window.LUNA_CONFIG?.botUsername||'');
  const botURL=/^[A-Za-z0-9_]{5,32}$/.test(bot)?'https://t.me/'+bot:'';
  const instruction='<ol><li>Откройте Telegram-бота Luna VPN.</li><li>Получите личную ссылку доступа.</li><li>Добавьте ссылку в Happ или Incy по инструкции бота.</li></ol>';
  const actions={
    connect:['Подключение к Luna',instruction],
    cabinet:['Ваш кабинет','<p>В кабинете собраны подписка, личная ссылка доступа и помощь с подключением.</p>'],
    plan:['Подписка Luna','<p>Период и стоимость подписки будут доступны в Telegram-боте при открытии продаж.</p>'],
    instruction:['Как подключиться',instruction],
    support:['Помощь с подключением','<p>В Telegram-боте Luna выберите «Поддержка». Поможем разобраться с доступом и настройкой приложения.</p>']
  };
  document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>{
    stopPlay();const action=actions[button.dataset.action];if(!action)return;
    title.textContent=action[0];content.innerHTML=action[1]+(botURL?'<a class="dialog-link" target="_blank" rel="noopener noreferrer" href="'+botURL+'">Открыть Telegram-бота ↗</a>':'');
    dialog.showModal();
  }));
  document.querySelectorAll('.dialog-close,.dialog-return').forEach(button=>button.addEventListener('click',()=>dialog.close()));
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)dialog.close();});
  measure();
})();
