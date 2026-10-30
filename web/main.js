(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  if ('IntersectionObserver' in window && !reduced.matches) {
    document.body.classList.add('motion-ready');
    const observer = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); }
    }), { threshold: .08 });
    document.querySelectorAll('.reveal').forEach(e => observer.observe(e));
  }
  const menu = document.querySelector('.menu-toggle'), nav = document.querySelector('.header nav');
  menu.addEventListener('click', () => { const open = nav.classList.toggle('open'); menu.setAttribute('aria-expanded', open); menu.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню'); });
  nav.addEventListener('click', e => { if (e.target.closest('a')) {nav.classList.remove('open');menu.setAttribute('aria-expanded','false');} });
  if (matchMedia('(pointer:fine)').matches && !reduced.matches) {
    document.querySelector('.hero').addEventListener('pointermove', e => {
      document.documentElement.style.setProperty('--mx', e.clientX / innerWidth * 2 - 1);
      document.documentElement.style.setProperty('--my', e.clientY / innerHeight * 2 - 1);
    });
  }
  const plans = {1: [390,390,'1 месяц'],3:[360,1080,'3 месяца'],12:[350,4200,'12 месяцев']};
  let currentPlan = 1;
  document.querySelectorAll('[data-plan]').forEach(button => button.addEventListener('click', () => {
    currentPlan = Number(button.dataset.plan); const [monthly,total,label] = plans[currentPlan];
    document.querySelector('#price').textContent = monthly;
    document.querySelector('#total-price').textContent = `${total.toLocaleString('ru-RU')} ₽ за ${label}`;
    document.querySelectorAll('[data-plan]').forEach(b => {b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',b===button);});
  }));
  const cities = {de:['Франкфурт','Кандидат для первого тестового узла'],nl:['Амстердам','Альтернативный маршрут после первого теста'],fi:['Хельсинки','Расширение сети по результатам запуска']};
  document.querySelectorAll('[data-location]').forEach(button => button.addEventListener('click', () => {
    const [name,description] = cities[button.dataset.location];
    document.querySelector('#route-name').textContent=name;document.querySelector('#route-description').textContent=description;
    document.querySelectorAll('[data-location]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',b===button);});
  }));
  const modal=document.querySelector('#modal'),title=document.querySelector('#modal-title'),content=document.querySelector('#modal-content');
  const cfg = window.LUNA_CONFIG || {};
  function safeTelegram(name){return /^[a-zA-Z0-9_]{5,32}$/.test(name||'') ? `https://t.me/${name}` : '';}
  const actions = {
    purchase:()=>['Ваш Personal',`<p>Вы выбрали ${plans[currentPlan][2]} за ${plans[currentPlan][1].toLocaleString('ru-RU')} ₽. Цена предварительная.</p><p>Продажи ещё не открыты. После запуска здесь появится способ оформления подписки. В Telegram оплата будет в Stars.</p>`],
    cabinet:()=>['Личный кабинет',safeTelegram(cfg.botUsername)?`<p>Откройте кабинет кнопкой в Telegram-боте Luna VPN.</p><a class="modal-action" href="${safeTelegram(cfg.botUsername)}?start=cabinet" target="_blank" rel="noopener">Открыть Telegram-бота ↗</a>`:'<p>Подписка, срок действия и личная ссылка доступа будут доступны через Telegram Mini App.</p><a class="modal-action" href="app/">Посмотреть демонстрацию кабинета ↗</a>'],
    instruction:()=>['Подключение LUNA','<ol><li>Установите Happ или Incy из официального магазина.</li><li>Получите личную ссылку в боте или кабинете.</li><li>Импортируйте ссылку в приложение.</li><li>Разрешите VPN-профиль и выберите доступную локацию.</li></ol><p>Ссылка конфиденциальна. Не отправляйте её другим людям.</p>'],
    private:()=>['LUNA Private','<p>Будущий групповой формат: 5 участников, до 3 устройств у каждого, отдельные профили и один плательщик.</p><p>Группы используют общую инфраструктуру. Выделенный сервер для одной группы будет отдельным предложением. Сроки запуска и цены пока не определены.</p>'],
    support:()=>['На связи',safeTelegram(cfg.supportUsername)?'<p>Вопросы о сервисе и подключении можно задать поддержке.</p>':'<p>Официальный контакт поддержки появится перед открытием продаж. Сейчас LUNA находится на этапе подготовки.</p>'],
    privacy:()=>['Конфиденциальность','<p>Эта демонстрационная страница не содержит аналитических счётчиков, форм сбора контактов и реальных платежей.</p><p>Рабочий кабинет будет получать идентификатор Telegram, данные подписки и платежей для предоставления доступа. До запуска опубликуем политику с данными оператора, сроками хранения и порядком обращения.</p>']
  };
  document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>{
    const [heading,html]=actions[button.dataset.action]();title.textContent=heading;content.innerHTML=html;
    if (button.dataset.action==='support' && safeTelegram(cfg.supportUsername)) {const a=document.createElement('a');a.className='modal-action';a.href=safeTelegram(cfg.supportUsername);a.textContent='Открыть поддержку ↗';a.rel='noopener';a.target='_blank';content.appendChild(a);}
    modal.showModal();
  }));
  document.querySelector('.modal-close').addEventListener('click',()=>modal.close());
  modal.addEventListener('click',e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)modal.close();}});
})();

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
