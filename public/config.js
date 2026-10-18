// Всички настройки на едно място. Логическите размери са в "пиксели на арта";
// на екрана всеки такъв пиксел става цяло число физически пиксели (scale).

export const CFG = {
  // ---- стая / подредба ----
  POD_W: 72,             // ширина на едно работно място (бюро + стол + монитор)
  POD_H: 76,             // височина на работно място (включва пътека отзад и етикет отпред)
  POD_H_COMPACT: 62,     // по-гъсти редове, ако иначе мащабът би паднал
  WALL_H: 60,            // височина на стената (с перваза)
  TOP_GAP: 6,            // разстояние стена -> първи ред бюра
  MARGIN_L: 44,          // лява колона (вратата и пътеката към нея)
  MARGIN_R: 4,
  MARGIN_B: 8,
  LOUNGE_W: 124,         // зоната за почивка вдясно
  MIN_W: 360,            // минимален логически размер на стаята
  MIN_H: 205,
  MAX_SCALE: 6,          // по-едро от това изглежда като мозайка
  MAX_TEAMS: 2,          // колко оркестратора (сесии) имат бюра едновременно; останалите чакат в зоната за почивка
  SUB_PER_ROW: 3,        // бюра за под-агенти на ред под всеки оркестратор (растат с нов ред при нужда)
  SWAP_IDLE_MS: 20000,   // чакаща активна сесия сменя оркестратор, който почива толкова (и няма живи под-агенти)
  SPREAD_X: 1.3,         // колко може да се разреждат бюрата, ако има място
  SPREAD_Y: 1.4,

  // ---- поведение ----
  IDLE_MS: 8000,                 // без събития толкова -> 'idle' (както досега)
  WANDER_AFTER_MS: 30000,        // толкова в idle -> става и отива в зоната за почивка
  GONE_AFTER_MS: 20 * 60 * 1000, // главен агент без събития толкова -> излиза през вратата
  CHILD_DONE_IDLE_MS: 30000,     // под-агент без събития толкова -> приключил е
  CHILD_EXIT_DELAY_MS: 1500,     // след tool_end на родителя под-агентът тръгва след толкова
  CONFETTI_MIN_RUN_MS: 60000,    // конфети, ако агентът е работил поне толкова без прекъсване
  WALK_SPEED: 50,                // логически px/сек
  CROSSFADE_MS: 400,             // плавна смяна на цвета/екрана при ново състояние
  MAX_PARTICLES: 700,
};

// Цветовете на състоянията са част от визуалния език — не ги променяй без причина.
/** Други агенти освен Claude Code (имената са еднакви на двата езика). */
export const PROVIDERS = { codex: 'Codex', opencode: 'OpenCode', gemini: 'Gemini', copilot: 'Copilot' };

export const STATES = {
  idle:       { color: '#6b6b80' },
  thinking:   { color: '#e0c24a' },
  typing:     { color: '#4ac26b' },   // Write/Edit
  reading:    { color: '#4a8fe0' },   // Read/Grep/Glob/Web*
  running:    { color: '#e07a4a' },   // Bash
  delegating: { color: '#b04ae0' },   // Task/Agent (под-агент)
  waiting:    { color: '#e04a6b' },   // чака теб
};
export const STATE_ORDER = ['idle', 'thinking', 'typing', 'reading', 'running', 'delegating', 'waiting'];

// Кой инструмент към кое състояние води – общо със сървъра (rules.js).
export { TOOL_STATE, DELEGATE_TOOLS } from './rules.js';

// ---- текстове: български (T_BG) и английски (T_EN); езикът – ?lang=, после запомненият избор, после езика на системата ----
const T_BG = {
  title: 'Cubicle Crew',
  connecting: 'свързване…',
  connected: 'свързан',
  waitingActivity: 'Чакам активност от Claude Code…',
  wait: { morning: 'Добро утро!', day: 'Добър ден!', evening: 'Добър вечер!', msg: 'Чакам първата сесия на Claude Code…', hint: 'Кликни, за да отвориш офиса' },
  reconnecting: 'връзката падна, опитвам пак…',
  demo: 'ДЕМО',
  agents: 'Агенти',
  subagents: 'Под-агенти',
  toolCalls: 'Извиквания',
  waitingYou: 'Чакат те',
  state: 'Състояние',
  tool: 'Инструмент',
  uptime: 'Активен от',
  project: 'Проект',
  parentOf: 'Под-агенти',
  childOf: 'Под-агент на',
  agentKind: 'Агент',
  context: 'Контекст',
  crashed: { title: 'Сесията прекъсна', hint: 'насред работа' },
  needsYou: 'Чака теб!',
  allow: (tool) => (tool ? `Разреши ли ${tool}?` : 'Отговори в терминала'),
  perm: { allow: 'Разреши', deny: 'Откажи', more: (n) => `още ${n}`, keys: 'Y / N' },
  sound: {
    on: 'Звук: включен – звъни, когато агент чака теб или сесия приключи (само ако не гледаш прозореца). Клик – изключи.',
    off: 'Звук: изключен. Клик – включи.',
  },
  thinking: 'мисли…',
  legendHint: 'L – легенда · Esc – без фокус',
  // лична статистика (раздел в чекмеджето; работи и във „Фокус“)
  stats: {
    open: 'Статистика', today: 'Днес', days: 'Последните 7 дни',
    work: 'Работа на агентите', leads: 'от тях оркестратори', waited: 'Чакаха теб', tools: 'Извиквания', tokens: 'Токени (вход / изход)', cache: 'кеш',
    sessions: (n, s) => `${n} ${n === 1 ? 'сесия' : 'сесии'} · ${s} ${s === 1 ? 'под-агент' : 'под-агенти'}`,
    project: 'Проект', active: 'Работа', waiting: 'Чакане', calls: 'Извикв.', tok: 'Токени',
    empty: 'Още няма данни за днес – броенето започва, щом агент заработи.',
    csv: 'CSV за 30 дни', json: 'JSON за 30 дни',
    note: 'Само на този компютър (~/.pixel-office/stats.json). Нищо не се изпраща. Токените са от транскриптите на Claude Code.',
    demo: 'В демото няма истинска статистика – пусни приложението без ?demo.',
    loading: 'Зареждам…', offline: 'Няма връзка със сървъра.',
  },
  // помощ (?): какво значи всеки цвят + личните настройки
  help: {
    open: 'Настройки и помощ (?)', title: 'Настройки и помощ', colours: 'Какво значат цветовете',
    states: {
      idle: 'Почива – няма работа от 8 секунди. Отива за кафе или на дивана.',
      thinking: 'Мисли – Claude обмисля или пише дълъг отговор (без инструмент).',
      typing: 'Пише – променя файлове (Write, Edit).',
      reading: 'Чете – разглежда код и търси (Read, Grep, Glob, уеб).',
      running: 'Изпълнява – пуска команда в терминала (Bash).',
      delegating: 'Делегира – пуска под-агенти (Task/Agent); линиите водят до тях.',
      waiting: 'Чака теб – въпрос или разрешение („Allow …?“). Звънецът звъни.',
    },
    shapes: 'Формата на точката до името също показва състоянието – за далтонисти и за малкия прозорец.',
    settings: 'Настройки',
    // всяка настройка с по едно изречение какво прави
    look: 'Как изглежда',
    office: 'Офис', officeHint: 'Цялата игра: монети и магазин, любимци, почивки с кафе, конзолка и дартс, ефекти и постижения.',
    focus: 'Фокус', focusHint: 'Тихо табло: без монети, магазин, любимци, ефекти и игри. Остава кой какво прави и кой те чака. Монетите се трупат и тук, само не се виждат.',
    strip: 'Тънка лента вместо офиса', stripHint: 'По един ред на сесия: състояние, какво прави, от колко време. Най-малко място на екрана; клик върху ред – към терминала.',
    legend: 'Легенда на цветовете', legendHint: 'Лентата долу вдясно с имената на състоянията (клавиш L).',
    lights: 'Осветление в офиса', lightsHint: 'Вечер лампите на тавана светят. Има и ключ до вратата – за колегите, които обичат да работят в пещера.',
    lang: 'Език',
    alerts: 'Известия',
    sound: 'Звук', soundHint: 'Кратка мелодия, когато агент чака теб или приключи дълга задача – само когато не гледаш прозореца.',
    perm: 'Отговаряй на разрешенията оттук', permHint: 'Добавя малък hook в настройките на Claude Code (~/.claude/settings.json, пази се резервно копие). Когато Claude пита „Разреши ли …?“, долу се появяват бутони Разреши / Откажи (клавиши Y / N). Терминалът работи както досега; ако не отговориш тук до 45 с, въпросът си остава там. Изключването маха hook-а.',
    permErr: { parse: 'settings.json не е валиден JSON – не го пипам.', write: 'Не успях да запиша settings.json.', offline: 'Сървърът не отговаря.' },
    notify: 'Известие от системата', notifyHint: 'Изскачащо известие, когато агент чака теб. Клик върху него отваря терминала на сесията.',
    privacy: 'Поверителност',
    private: 'Скривай команди и пътища', privateHint: 'Балончетата, картата и известията показват само инструмента и името на сесията – за споделен екран и стрийм.',
    window: 'Прозорец',
    onTop: 'Винаги отгоре', onTopHint: 'Прозорецът стои над другите, за да виждаш офиса, докато работиш.',
    through: 'Кликовете минават през прозореца', throughHint: 'Мишката „минава“ през офиса към това отдолу. Връща се само от менюто в трея (иконата до часовника).',
    wait: 'Малко прозорче, когато няма сесии', waitHint: 'Без нито една сесия офисът се свива до сутрешна сцена и се отваря сам, щом се появи сесия.',
    login: 'Стартирай с Windows', loginMac: 'Стартирай при вход', loginHint: 'Cubicle Crew тръгва сам, когато влезеш в компютъра.',
    demo: 'Демо режим', demoHint: 'Измислени агенти – да видиш как изглежда всичко без Claude Code.',
    feedback: 'Обратна връзка', feedbackHint: 'Идея, нещо дразни или не работи? Пиши – проектът е безплатен и се прави по твоите отговори.',
    discuss: 'Идеи и въпроси (GitHub)', issue: 'Съобщи за проблем', coffee: 'Почерпи кафе ☕',
    close: 'Затвори',
    share: 'Сподели', snapshot: 'Снимка (PNG)', clip: 'Клип 10 сек', recording: 'Записвам…', saved: 'Готово – файлът е свален.', noclip: 'Този браузър не може да записва клип.',
    shareHint: 'Само сцената, увеличена с остри пиксели. Файлът остава на твоя компютър.',
  },
  rename: 'Преименувай', renameHint: 'Име на сесията (празно = името на проекта)',
  history: 'Последни действия', running: 'тече…',
  terminal: 'Към терминала', terminalHint: 'Изкарва отпред прозореца на сесията (двоен клик върху агента прави същото)',
  terminalFail: { unsupported: 'На Linux това още не се поддържа.', nopid: 'Сесията не е отворена в терминал на този компютър.', window: 'Не намерих прозореца на сесията.', offline: 'Няма връзка със сървъра.' },
  states: {
    idle: 'почива', thinking: 'мисли', typing: 'пише', reading: 'чете',
    running: 'изпълнява', delegating: 'делегира', waiting: 'чака теб',
  },
  board: { agents: 'Активни агенти', tools: 'Извиквания на инструменти', subs: 'Под-агенти',
    pages: ['', 'Днес', 'Последните 7 дни', 'Последните 30 дни'], work: 'Работа на агентите', waited: 'Чакали са теб', tokens: 'Токени (вход / изход)',
    click: 'Клик – статистиката ти на прожекционния екран', next: 'Клик – следващата страница', back: 'Клик – навий екрана', none: 'Още няма статистика' },
  lights: { title: 'Осветление', on: 'Клик – светни лампите', off: 'Клик – загаси лампите' },
  min: 'мин', sec: 'сек', hour: 'ч',
  tokens: 'Монети',
  shop: {
    title: 'Магазин',
    open: 'Магазин (B)',
    tabs: { walls: 'Стени', floor: 'Под и килими', furniture: 'Мебели', decor: 'Декор', pets: 'Любимци', special: 'Специални', avatar: 'Аватар', stats: 'Статистика', weather: 'Времето', trophies: 'Постижения' },
    groups: {
      wall: 'Боя', wainscot: 'Ламперия', floor: 'Под', rug: 'Килим под бюрата', lrug: 'Килим в зоната за почивка', sofa: 'Диван',
      chair: 'Столове', lamp: 'Лампа', plants: 'Растения', posters: 'Постери', window: 'Изглед през прозорците',
      cat: 'Котка', cat2: 'Още една котка', dog: 'Куче', season: 'Сезонно', neon: 'Неонов надпис', espresso: 'Кафемашина', aquarium: 'Аквариум', arcade: 'Аркада',
    },
    slots: { 'rug.team0': 'Екип 1', 'rug.team1': 'Екип 2', 'chair.team0': 'Под-агенти', 'chair.team1': 'Екип 2', 'chair.lead': '★ Оркестратори' },
    buy: 'Купи', equip: 'Сложи', equipped: 'Сложено', remove: 'Махни', free: 'безплатно', owned: 'твое',
    need: (n) => `още ${n}`,
    hint: 'Посочи предмет – виждаш го в офиса. Затвори с Esc.',
    errors: { avatar: 'Невалиден аватар.', funds: 'Нямаш достатъчно монети.', locked: 'Първо го купи.', busy: 'Друг Cubicle Crew брои монетите – опитай пак след малко.', offline: 'Няма връзка със сървъра.',
      pets: 'В офиса има място за най-много 3 любимци – първо прибери някой у дома.', season: 'Продава се само в сезона си.' },
    seasonFrom: (d) => `от ${d}`,
    achievement: 'Постижение',
    reward: (n) => `+${n} монети`,
    progress: (v, g) => `${v} / ${g}`,
    unlocked: 'отключено',
    pets: {
      cats: ['Котка 1', 'Котка 2', 'Котка 3'], dog: 'Куче', away: 'Прибери у дома', back: 'Върни в офиса',
      unlock: (p) => `Идва с шарка „${p}“; после можеш да ѝ избереш всяка купена шарка.`,
      unlockDog: (p) => `Идва като ${p.toLowerCase()}; после можеш да му избереш всяка купена порода.`,
      home: 'у дома', full: 'Няма място', name: 'Име', rename: 'Преименувай', save: 'Запази',
      limit: 'Най-много 3 любимци в офиса: до 3 котки или 2 котки и куче. Прибраните остават твои и могат да се върнат.',
    },
    avatar: {
      body: 'Тяло', male: 'Мъж', female: 'Жена', style: 'Прическа',
      styles: { m: ['Къса', 'На път', 'Перчем', 'Щръкнала'], f: ['Дълга', 'Опашка', 'Каре', 'Кок'] },
      top: 'Горнище', bottom: 'Долнище',
      tops: { m: ['Риза с яка', 'Тениска', 'Вратовръзка', 'Суитшърт', 'V-деколте', 'Райе'], f: ['Блуза', 'Деколте с верижка', 'V-деколте', 'Тениска', 'Суитшърт', 'Райе'] },
      bottoms: ['Пола', 'Панталон', 'Рокля'],
      skin: 'Кожа', hair: 'Цвят на косата', glasses: 'Очила', without: 'Без', with: 'С очила',
      hint: 'Безплатно. Това си ти: първият оркестратор (★) в офиса изглежда така при всяко пускане; останалите са случайни.',
      skins: ['Много светла', 'Светла', 'Средна', 'Мургава', 'Тъмна', 'Много тъмна'],
      hairs: ['Черна', 'Кестенява', 'Светлокестенява', 'Руса', 'Рижа', 'Сива', 'Синя', 'Розова', 'Зелена', 'Лилава'],
    },
  },
  // офисните любимци: имена по подразбиране (по място) и подсказката при посочване
  pets: {
    names: { cat: 'Мица', cat2: 'Тигрото', cat3: 'Писана', dog: 'Шаро' },
    kinds: { cat: 'Офисна котка', dog: 'Офисно куче' },
    tip: 'Клик – погали · двоен клик – име и външен вид',
  },
  // начална настройка (първо пускане)
  setup: {
    hello: 'Добре дошъл в Cubicle Crew!',
    intro: 'Три бързи неща и офисът е готов.',
    modeQ: 'Как да изглежда?', modeHint: 'И в двата режима виждаш кой какво прави и кой чака теб. Сменя се по всяко време от „?“.',
    petQ: 'С кого започва офисът?', cat: 'Котка', dog: 'Куче', nameQ: 'Как се казва?',
    petHint: 'Другият вид може да се вземе по-късно от магазина (до 3 любимци).',
    cityQ: 'Къде се намираш?',
    cityHint: 'За часовника и времето навън в прозорците. Изпращат се само координатите на града към Open-Meteo; без град – нито една заявка навън.',
    chosen: 'Избран:', next: 'Напред', back: 'Назад', skip: 'Пропусни', done: 'Готово',
    later: 'Всичко това може да се смени после от магазина.',
  },
  weather: {
    city: 'Град', none: 'Не е избран – навън винаги е ясно, без заявки към интернет.',
    search: 'Търси', placeholder: 'напр. София', searching: 'Търся…', nothing: 'Няма такъв град.', offline: 'Няма връзка с интернет.',
    pick: 'Избери:', loading: 'взимам времето…', off: 'изключено', enable: 'Включи', disable: 'Изключи', remove: 'Премахни града',
    pop: (n) => `валежи ${n}%`, tip: 'Времето навън – клик за настройки',
    kinds: { clear: 'ясно', cloudy: 'облачно', overcast: 'мрачно', fog: 'мъгла', drizzle: 'ръми', rain: 'дъжд', snow: 'сняг', storm: 'гръмотевици' },
    hint: 'Времето идва от Open-Meteo (open-meteo.com) на всеки 20 минути; изпращат се само координатите на града. Без избран град приложението не прави нито една заявка навън.',
    demo: 'В демото времето се задава с адреса: ?weather=clear, cloudy, overcast, fog, drizzle, rain, snow или storm.',
  },
  achievements: {
    'tokens.100': ['Първите 100', 'Спечели 100 монети'],
    'tokens.1k': ['Хилядарка', 'Спечели 1 000 монети'],
    'tokens.5k': ['Пълна каса', 'Спечели 5 000 монети'],
    'tokens.20k': ['Магнат', 'Спечели 20 000 монети'],
    'tasks.10': ['Първи екип', '10 задачи на под-агенти'],
    'tasks.100': ['Мениджър', '100 задачи на под-агенти'],
    'tasks.500': ['Директор', '500 задачи на под-агенти'],
    'hours.10': ['Работен ден', '10 часа активни агенти'],
    'hours.100': ['Ветеран', '100 часа активни агенти'],
    'days.7': ['Седмица', 'Активен 7 дни'],
    'days.30': ['Месец', 'Активен 30 дни'],
    'shop.1': ['Първа покупка', 'Купи нещо от магазина'],
    'shop.10': ['Обзавеждане', 'Купи 10 неща'],
    'shop.all': ['Мечтаният офис', 'Купи всичко от магазина'],
  },
  tokensHint: 'Монети: печелиш ги, докато агентите работят – харчиш ги в магазина (B)',
  lang: 'Език: български – смени на English',
  winbar: { settings: 'Настройки (размер, известия, демо…)', pin: 'Винаги отгоре', through: 'Кликовете минават през прозореца (махни от менюто в трея)', hide: 'Скрий в трея', quit: 'Затвори' },
  demo2: { which: 'Кой вариант да избера?', cont: 'Да продължа ли?', whichShort: 'Кой вариант?', arch: 'Прегледай архитектурата', tests: 'Пусни тестовете', cache: 'Измисли план за кеша' },
};

const T_EN = {
  title: 'Cubicle Crew',
  connecting: 'connecting…',
  connected: 'connected',
  waitingActivity: 'Waiting for Claude Code activity…',
  wait: { morning: 'Good morning!', day: 'Good afternoon!', evening: 'Good evening!', msg: 'Waiting for the first Claude Code session…', hint: 'Click to open the office' },
  reconnecting: 'connection lost, retrying…',
  demo: 'DEMO',
  agents: 'Agents',
  subagents: 'Sub-agents',
  toolCalls: 'Tool calls',
  waitingYou: 'Waiting for you',
  state: 'State',
  tool: 'Tool',
  uptime: 'Active for',
  project: 'Project',
  parentOf: 'Sub-agents',
  childOf: 'Sub-agent of',
  agentKind: 'Agent',
  context: 'Context',
  crashed: { title: 'Session ended', hint: 'in the middle of the work' },
  needsYou: 'Needs you!',
  allow: (tool) => (tool ? `Allow ${tool}?` : 'Answer in the terminal'),
  perm: { allow: 'Allow', deny: 'Deny', more: (n) => `${n} more`, keys: 'Y / N' },
  sound: {
    on: 'Sound: on – chimes when an agent needs you or a session finishes (only while you are not looking at the window). Click to mute.',
    off: 'Sound: off. Click to turn it on.',
  },
  thinking: 'thinking…',
  legendHint: 'L – legend · Esc – clear focus',
  stats: {
    open: 'Stats', today: 'Today', days: 'Last 7 days',
    work: 'Agent work', leads: 'of which orchestrators', waited: 'Waited for you', tools: 'Tool calls', tokens: 'Tokens (in / out)', cache: 'cache',
    sessions: (n, s) => `${n} session${n === 1 ? '' : 's'} · ${s} sub-agent${s === 1 ? '' : 's'}`,
    project: 'Project', active: 'Work', waiting: 'Waiting', calls: 'Calls', tok: 'Tokens',
    empty: 'No data for today yet – counting starts as soon as an agent works.',
    csv: 'CSV for 30 days', json: 'JSON for 30 days',
    note: 'Only on this computer (~/.pixel-office/stats.json). Nothing is sent anywhere. Tokens come from the Claude Code transcripts.',
    demo: 'The demo has no real stats – run the app without ?demo.',
    loading: 'Loading…', offline: 'No connection to the server.',
  },
  help: {
    open: 'Settings and help (?)', title: 'Settings and help', colours: 'What the colours mean',
    states: {
      idle: 'Idle – nothing for 8 seconds. Goes for coffee or to the sofa.',
      thinking: 'Thinking – Claude is reasoning or writing a long reply (no tool).',
      typing: 'Typing – changing files (Write, Edit).',
      reading: 'Reading – looking through code and searching (Read, Grep, Glob, web).',
      running: 'Running – a terminal command (Bash).',
      delegating: 'Delegating – starting sub-agents (Task/Agent); the lines lead to them.',
      waiting: 'Waiting for you – a question or a permission prompt ("Allow …?"). The bell rings.',
    },
    shapes: 'The shape of the dot next to the name also shows the state – for colour-blind people and the small window.',
    settings: 'Settings',
    look: 'Look',
    office: 'Office', officeHint: 'The whole game: coins and the shop, pets, coffee breaks, handheld games and darts, effects and achievements.',
    focus: 'Focus', focusHint: 'A quiet status board: no coins, shop, pets, effects or games. You still see who is doing what and who is waiting for you. Coins keep adding up, just hidden.',
    strip: 'Thin strip instead of the office', stripHint: 'One row per session: state, what it is doing, for how long. Takes the least space; click a row to jump to its terminal.',
    legend: 'Colour legend', legendHint: 'The bar at the bottom right with the state names (key L).',
    lights: 'Office lights', lightsHint: 'The ceiling lights come on in the evening. There is also a switch by the door – for colleagues who like working in a cave.',
    lang: 'Language',
    alerts: 'Alerts',
    sound: 'Sound', soundHint: 'A short tune when an agent waits for you or finishes a long task – only when you are not looking at the window.',
    perm: 'Answer permission prompts here', permHint: 'Adds a small hook to the Claude Code settings (~/.claude/settings.json, a backup is kept). When Claude asks “Allow …?”, Allow / Deny buttons appear at the bottom (keys Y / N). The terminal works as before; if you do not answer here within 45 s the question stays there. Turning it off removes the hook.',
    permErr: { parse: 'settings.json is not valid JSON – leaving it alone.', write: 'Could not write settings.json.', offline: 'The server is not answering.' },
    notify: 'System notification', notifyHint: 'A pop-up when an agent waits for you. Clicking it opens that session\'s terminal.',
    privacy: 'Privacy',
    private: 'Hide commands and paths', privateHint: 'Bubbles, the card and notifications show only the tool and the session name – for screen sharing and streaming.',
    window: 'Window',
    onTop: 'Always on top', onTopHint: 'The window stays above the others, so you see the office while you work.',
    through: 'Click-through', throughHint: 'The mouse goes through the office to whatever is below. Turn it off from the tray menu (the icon by the clock).',
    wait: 'Small window when there are no sessions', waitHint: 'With no session open the office shrinks to a morning scene and opens by itself when a session starts.',
    login: 'Start with Windows', loginMac: 'Start at login', loginHint: 'Cubicle Crew starts by itself when you sign in.',
    demo: 'Demo mode', demoHint: 'Made-up agents – to see how everything looks without Claude Code.',
    feedback: 'Feedback', feedbackHint: 'An idea, something annoying or broken? Tell us – the project is free and shaped by what people say.',
    discuss: 'Ideas and questions (GitHub)', issue: 'Report a problem', coffee: 'Buy me a coffee ☕',
    close: 'Close',
    share: 'Share', snapshot: 'Snapshot (PNG)', clip: '10 s clip', recording: 'Recording…', saved: 'Done – the file is downloaded.', noclip: 'This browser cannot record a clip.',
    shareHint: 'Just the scene, upscaled with crisp pixels. The file stays on your computer.',
  },
  rename: 'Rename', renameHint: 'Session name (empty = project name)',
  history: 'Recent actions', running: 'running…',
  terminal: 'Go to terminal', terminalHint: 'Brings the session\'s window to the front (double-clicking the agent does the same)',
  terminalFail: { unsupported: 'Not supported on Linux yet.', nopid: 'This session is not open in a terminal on this computer.', window: 'Could not find the session\'s window.', offline: 'No connection to the server.' },
  states: {
    idle: 'idle', thinking: 'thinking', typing: 'typing', reading: 'reading',
    running: 'running', delegating: 'delegating', waiting: 'waiting for you',
  },
  board: { agents: 'Active agents', tools: 'Tool calls', subs: 'Sub-agents',
    pages: ['', 'Today', 'Last 7 days', 'Last 30 days'], work: 'Agent work', waited: 'Waited for you', tokens: 'Tokens (in / out)',
    click: 'Click to put your stats on the projector screen', next: 'Click for the next page', back: 'Click to roll the screen up', none: 'No stats yet' },
  lights: { title: 'Lights', on: 'Click to turn the lights on', off: 'Click to turn the lights off' },
  min: 'min', sec: 's', hour: 'h',
  tokens: 'Coins',
  shop: {
    title: 'Shop',
    open: 'Shop (B)',
    tabs: { walls: 'Walls', floor: 'Floor & rugs', furniture: 'Furniture', decor: 'Decor', pets: 'Pets', special: 'Special', avatar: 'Avatar', stats: 'Stats', weather: 'Weather', trophies: 'Achievements' },
    groups: {
      wall: 'Paint', wainscot: 'Wainscoting', floor: 'Floor', rug: 'Office rug', lrug: 'Lounge rug', sofa: 'Sofa',
      chair: 'Chairs', lamp: 'Lamp', plants: 'Plants', posters: 'Posters', window: 'Window view',
      cat: 'Cat', cat2: 'One more cat', dog: 'Dog', season: 'Seasonal', neon: 'Neon sign', espresso: 'Coffee machine', aquarium: 'Aquarium', arcade: 'Arcade',
    },
    slots: { 'rug.team0': 'Team 1', 'rug.team1': 'Team 2', 'chair.team0': 'Sub-agents', 'chair.team1': 'Team 2', 'chair.lead': '★ Leads' },
    buy: 'Buy', equip: 'Use', equipped: 'In use', remove: 'Remove', free: 'free', owned: 'owned',
    need: (n) => `${n} more`,
    hint: 'Hover an item to preview it in the office. Esc closes.',
    errors: { avatar: 'Invalid avatar.', funds: 'Not enough coins.', locked: 'Buy it first.', busy: 'Another Cubicle Crew is counting coins – try again in a moment.', offline: 'No connection to the server.',
      pets: 'The office has room for 3 pets at most – send one home first.', season: 'Only sold in its season.' },
    seasonFrom: (d) => `from ${d}`,
    achievement: 'Achievement',
    reward: (n) => `+${n} coins`,
    progress: (v, g) => `${v} / ${g}`,
    unlocked: 'unlocked',
    pets: {
      cats: ['Cat 1', 'Cat 2', 'Cat 3'], dog: 'Dog', away: 'Send home', back: 'Bring back',
      unlock: (p) => `Comes as a ${p.toLowerCase()}; then you can give it any pattern you own.`,
      unlockDog: (p) => `Comes as a ${p.toLowerCase()}; then you can make it any breed you own.`,
      home: 'at home', full: 'No room', name: 'Name', rename: 'Rename', save: 'Save',
      limit: 'Up to 3 pets in the office: 3 cats, or 2 cats and a dog. Pets sent home stay yours and can come back.',
    },
    avatar: {
      body: 'Body', male: 'Man', female: 'Woman', style: 'Hairstyle',
      styles: { m: ['Short', 'Side part', 'Quiff', 'Spiky'], f: ['Long', 'Ponytail', 'Bob', 'Bun'] },
      top: 'Top', bottom: 'Bottom',
      tops: { m: ['Collar shirt', 'T-shirt', 'Tie', 'Hoodie', 'V-neck', 'Stripes'], f: ['Blouse', 'Scoop neck', 'V-neck', 'T-shirt', 'Hoodie', 'Stripes'] },
      bottoms: ['Skirt', 'Trousers', 'Dress'],
      skin: 'Skin', hair: 'Hair colour', glasses: 'Glasses', without: 'None', with: 'Glasses',
      hint: 'Free. This is you: the first orchestrator (★) in the office always looks like this; everyone else is random.',
      skins: ['Very light', 'Light', 'Medium', 'Tan', 'Dark', 'Very dark'],
      hairs: ['Black', 'Brown', 'Light brown', 'Blonde', 'Ginger', 'Grey', 'Blue', 'Pink', 'Green', 'Purple'],
    },
  },
  pets: {
    names: { cat: 'Misty', cat2: 'Tiger', cat3: 'Luna', dog: 'Rex' },
    kinds: { cat: 'Office cat', dog: 'Office dog' },
    tip: 'Click to pet · double-click to rename or change the look',
  },
  setup: {
    hello: 'Welcome to Cubicle Crew!',
    intro: 'Three quick things and the office is ready.',
    modeQ: 'How should it look?', modeHint: 'Both modes show who is doing what and who is waiting for you. Change it any time from "?".',
    petQ: 'Who starts in the office?', cat: 'Cat', dog: 'Dog', nameQ: 'What is their name?',
    petHint: 'You can get the other kind later in the shop (up to 3 pets).',
    cityQ: 'Where are you?',
    cityHint: 'For the clock and the weather in the windows. Only the city coordinates are sent to Open-Meteo; with no city, nothing goes to the internet.',
    chosen: 'Selected:', next: 'Next', back: 'Back', skip: 'Skip', done: 'Done',
    later: 'You can change all of this later in the shop.',
  },
  weather: {
    city: 'City', none: 'Not set – it is always clear outside and nothing is sent to the internet.',
    search: 'Search', placeholder: 'e.g. London', searching: 'Searching…', nothing: 'No such city.', offline: 'No internet connection.',
    pick: 'Pick one:', loading: 'getting the weather…', off: 'off', enable: 'Turn on', disable: 'Turn off', remove: 'Remove city',
    pop: (n) => `${n}% chance of rain`, tip: 'Weather outside – click for settings',
    kinds: { clear: 'clear', cloudy: 'cloudy', overcast: 'overcast', fog: 'fog', drizzle: 'drizzle', rain: 'rain', snow: 'snow', storm: 'thunderstorm' },
    hint: 'Weather comes from Open-Meteo (open-meteo.com) every 20 minutes; only the city coordinates are sent. With no city set, the app makes no requests to the internet at all.',
    demo: 'In the demo, set the weather in the address: ?weather=clear, cloudy, overcast, fog, drizzle, rain, snow or storm.',
  },
  achievements: {
    'tokens.100': ['First 100', 'Earn 100 coins'],
    'tokens.1k': ['Grand', 'Earn 1,000 coins'],
    'tokens.5k': ['Full vault', 'Earn 5,000 coins'],
    'tokens.20k': ['Tycoon', 'Earn 20,000 coins'],
    'tasks.10': ['First team', '10 sub-agent tasks'],
    'tasks.100': ['Manager', '100 sub-agent tasks'],
    'tasks.500': ['Director', '500 sub-agent tasks'],
    'hours.10': ['Workday', '10 hours of active agents'],
    'hours.100': ['Veteran', '100 hours of active agents'],
    'days.7': ['One week', 'Active on 7 days'],
    'days.30': ['One month', 'Active on 30 days'],
    'shop.1': ['First purchase', 'Buy something in the shop'],
    'shop.10': ['Furnished', 'Buy 10 things'],
    'shop.all': ['Dream office', 'Buy everything in the shop'],
  },
  tokensHint: 'Coins: earned while your agents work – spend them in the shop (B)',
  lang: 'Language: English – switch to български',
  winbar: { settings: 'Settings (size, notifications, demo…)', pin: 'Always on top', through: 'Click-through (turn it off from the tray menu)', hide: 'Hide to tray', quit: 'Quit' },
  demo2: { which: 'Which option should I pick?', cont: 'Shall I continue?', whichShort: 'Which option?', arch: 'Review the architecture', tests: 'Run the tests', cache: 'Plan the cache' },
  // имена на предметите (catalog.js пази българските; id-тата са записът и не се пипат)
  items: {
    'wall.slate': 'Slate blue', 'wall.sage': 'Sage', 'wall.terracotta': 'Terracotta', 'wall.charcoal': 'Charcoal', 'wall.navy': 'Navy',
    'wall.cream': 'Cream', 'wall.lavender': 'Lavender', 'wall.forest': 'Forest green',
    'wainscot.dark': 'Dark panels', 'wainscot.white': 'White panels', 'wainscot.wood': 'Wood panels',
    'floor.oak': 'Oak', 'floor.birch': 'Birch', 'floor.walnut': 'Walnut', 'floor.checker': 'Checker tiles', 'floor.concrete': 'Concrete (loft)',
    'rug.plain.blue': 'Blue', 'rug.plain.green': 'Green', 'rug.plain.plum': 'Plum', 'rug.stripes': 'Striped', 'rug.round': 'Round', 'rug.persian': 'Persian',
    'lrug.red': 'Red', 'lrug.boho': 'Boho', 'lrug.fluffy': 'Fluffy white',
    'sofa.modern.teal': 'Modern – teal', 'sofa.modern.mustard': 'Modern – mustard', 'sofa.modern.coral': 'Modern – coral', 'sofa.modern.navy': 'Modern – navy',
    'sofa.modern.forest': 'Modern – green', 'sofa.modern.grey': 'Modern – grey', 'sofa.modern.pink': 'Modern – pink', 'sofa.beanbags': 'Beanbags', 'sofa.chesterfield': 'Chesterfield',
    'chair.navy': 'Navy', 'chair.red': 'Red', 'chair.green': 'Green', 'chair.purple': 'Purple', 'chair.orange': 'Orange', 'chair.black': 'Black',
    'chair.white': 'White', 'chair.gaming': 'Gaming', 'chair.throne': 'Throne',
    'plants.ficus': 'Ficus', 'plants.cactus': 'Cacti', 'plants.monstera': 'Monstera', 'plants.flowers': 'Flowering',
    'posters.classic': 'Classic', 'posters.space': 'Space', 'posters.nature': 'Nature', 'posters.code': 'Code',
    'lamp.floor': 'Floor lamp', 'lamp.arc': 'Arc lamp',
    'cat.grey': 'Grey cat', 'cat.ginger': 'Ginger cat', 'cat.black': 'Black cat', 'cat.white': 'White cat', 'cat2.tabby': 'Second cat', 'cat3.extra': 'Third cat',
    'cat.tabby': 'Tabby cat', 'cat.tuxedo': 'Tuxedo cat', 'cat.calico': 'Calico cat', 'cat.siamese': 'Siamese cat', 'cat.tortie': 'Tortoiseshell cat',
    'cat1.extra': 'Cat', 'dog.extra': 'Dog',
    'dog.beagle': 'Beagle', 'dog.golden': 'Golden retriever', 'dog.black': 'Black labrador', 'dog.dachshund': 'Dachshund', 'dog.corgi': 'Corgi',
    'dog.husky': 'Husky', 'dog.dalmatian': 'Dalmatian', 'dog.pug': 'Pug',
    'season.pumpkins': 'Pumpkins', 'season.tree': 'Christmas tree', 'season.tulips': 'Tulips', 'season.fan': 'Standing fan',
    'window.city': 'City', 'window.sea': 'Sea', 'window.mountains': 'Mountains',
    'neon.code': 'Neon sign', 'espresso.pro': 'Espresso machine', 'aquarium.reef': 'Aquarium', 'arcade.retro': 'Arcade cabinet',
  },
};

function pickLang() {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'en' || q === 'bg') { try { localStorage.setItem('po.lang', q); } catch { /* */ } return q; }
  } catch { /* */ }
  try { const v = localStorage.getItem('po.lang'); if (v === 'en' || v === 'bg') return v; } catch { /* */ }
  return /^bg\b/i.test(globalThis.navigator?.language || '') ? 'bg' : 'en';
}
export const LANG = pickLang();
export const T = LANG === 'bg' ? T_BG : T_EN;
/** Име на предмет от магазина на текущия език. */
export const itemName = (it) => T.items?.[it.id] || it.name;
/** Смяна на езика: запомня избора и презарежда (T е константа за цялата страница). */
export function setLang(l) {
  try { localStorage.setItem('po.lang', l); } catch { /* */ }
  const u = new URL(location.href); u.searchParams.set('lang', l); location.href = u.toString();
}

// ---- URL параметри ----
const Q = new URLSearchParams(location.search);
export const PARAMS = {
  demo: Q.has('demo') ? (Q.get('demo') || 'sim') : null,  // ?demo  или  ?demo=showcase
  debug: Q.has('debug'),
  agents: Q.has('agents') ? Math.max(1, Math.min(36, Number(Q.get('agents')) || 5)) : null,
  time: Q.get('time'),          // ?time=21:30 — фалшив час за небето (за тестове)
  wander: Q.has('wander') ? Number(Q.get('wander')) * 1000 : null,
  seed: Q.has('seed') ? Number(Q.get('seed')) : null,
  desktop: Q.has('desktop'),   // отворено от Electron приложението
  wait: Q.has('wait'),         // сутрешен екран, докато няма сесия (Electron при старт с Windows)
  weather: Q.get('weather'),   // ?weather=clear|cloudy|overcast|fog|drizzle|rain|snow|storm — фалшиво време (за тестове/демото)
  setup: Q.has('setup'),       // ?setup — показва началната настройка отново (за тестове; в демото – в паметта)
  overlay: Q.has('overlay'),   // ?overlay – за OBS/стрийм: без HUD и легенда, командите и пътищата са скрити
  focus: Q.has('focus'),       // ?focus – режим „Фокус“ (за тестове; иначе се пази в настройките)
  strip: Q.has('strip'),       // ?strip – тънка лента: по един ред на сесия вместо офиса (Electron го слага от менюто)
};
if (PARAMS.wander != null && !Number.isNaN(PARAMS.wander)) CFG.WANDER_AFTER_MS = PARAMS.wander;
/** Име на любимец по място (save.petNames или името по подразбиране на текущия език). */
export const petName = (slot, names) => names?.[slot] || T.pets.names[slot] || slot;
