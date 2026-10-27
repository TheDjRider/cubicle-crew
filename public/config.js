// Всички настройки на едно място. Логическите размери са в "пиксели на арта";
// на екрана всеки такъв пиксел става цяло число физически пиксели (scale).

export const CFG = {
  // ---- стая / подредба ----
  POD_W: 72,             // ширина на едно работно място (бюро + стол + монитор)
  POD_H: 66,             // височина на работно място (включва пътека отзад и етикет отпред)
  POD_H_COMPACT: 62,     // по-гъсти редове, ако иначе мащабът би паднал
  WALL_H: 60,            // височина на стената (с перваза)
  TOP_GAP: 6,            // разстояние стена -> първи ред бюра
  MARGIN_L: 12,          // вратата е на стената над горната пътека – отляво остава само тясна пътека
  MARGIN_R: 4,
  MARGIN_B: 10,          // под етикетите на долния ред – място за лентата долу
  LOUNGE_W: 124,         // зоната за почивка вдясно
  MIN_W: 340,            // минимален логически размер на стаята
  MIN_H: 180,
  MAX_SCALE: 6,          // по-едро от това изглежда като мозайка
  MAX_TEAMS: 2,          // колко оркестратора (сесии) имат бюра едновременно; останалите чакат в зоната за почивка
  SUB_PER_ROW: 3,        // бюра за под-агенти на ред под всеки оркестратор (растат с нов ред при нужда)
  SWAP_IDLE_MS: 20000,   // чакаща активна сесия сменя оркестратор, който почива толкова (и няма живи под-агенти)
  SPREAD_X: 1.3,         // колко може да се разреждат бюрата, ако има място
  SPREAD_Y: 1.4,
  ROW_STEP: 40,          // долният ред бюра е на 40 px под горния (по-малко от едно място) – леко се застъпват, стаята е по-ниска
  MAX_STRETCH: 1.6,      // стаята се разтяга по прозореца най-много толкова пъти (иначе при мащаб 1 – дребни бюра сред безкраен под)

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
export const PROVIDERS = { cowork: 'Cowork', codex: 'Codex', opencode: 'OpenCode', gemini: 'Gemini', copilot: 'Copilot', cursor: 'Cursor', windsurf: 'Windsurf', cline: 'Cline', aider: 'Aider', amp: 'Amp', kiro: 'Kiro', zed: 'Zed' };

/** Бранд цветове + пиксел символ за заставката на монитора при idle (агент без активност); липсващ запис = звездичката на Claude. */
export const PROVIDER_MARK = { opencode: { c: '#fab283', g: 'ring' }, codex: { c: '#10a37f', g: 'gear' }, gemini: { c: '#4285f4', g: 'star4' }, copilot: { c: '#a371f7', g: 'eyes' }, cursor: { c: '#7f8ea3', g: 'bar' } };

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
  waitingActivity: 'Чакам някой агент да започне работа…',
  lan: { title: 'Cubicle Crew на телефона', hint: 'PIN-ът е на компютъра: Настройки → Поверителност → Изглед за телефон.', go: 'Влез', wrong: 'Грешен PIN', locked: 'Твърде много опити – опитай пак след минута.', offline: 'Компютърът не отговаря.' },
  wait: { morning: 'Добро утро!', day: 'Добър ден!', evening: 'Добър вечер!', msg: 'Чакам първия агент…', hint: 'Кликни, за да отвориш офиса' },
  reconnecting: 'връзката падна, опитвам пак…',
  demo: 'ДЕМО',
  web: { live: 'Демо на живо – агентите са измислени.', try: 'Приложението показва истинските ти сесии на Claude Code, Codex, Gemini CLI и OpenCode.', get: 'Изтегли', or: 'или', star: 'GitHub', hide: 'Скрий', app: 'Това работи в приложението, с истинските ти сесии.' },
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
  model: 'Модел',
  context: 'Контекст',
  crashed: { title: 'Сесията прекъсна', hint: 'насред работа' },
  needsYou: 'Чака теб!',
  allow: (tool) => (tool ? `Разреши ли ${tool}?` : 'Отговори в терминала'),
  danger: 'Рискова команда',
  perm: { allow: 'Разреши', deny: 'Откажи', more: (n) => `още ${n}`, keys: 'Y / N', global: 'или Ctrl+Alt+Y / N отвсякъде' },
  // клик по предметите в офиса (poke.js) – подсказката при посочване
  poke: {
    names: {
      counter: 'Кафемашина · клик: свари кафе', cooler: 'Диспенсър · клик: глътка вода', plant: 'Растение · клик: пошумоли', bookshelf: 'Библиотека · клик',
      arcade: 'Аркада · клик: пусни монета', aquarium: 'Аквариум · клик: почукай по стъклото', massage: 'Масажен стол · клик: включи', sofa: 'Диван · клик: тупни възглавницата',
      table: 'Масичка · клик', floor_lamp: 'Лампа · клик: светни/угаси', season: 'Украса · клик', pet_fountain: 'Фонтанче · клик: пръсни', pet_bowl: 'Купичка',
      toy: 'Играчка · клик: писни', printer: 'Принтер · клик: разпечатай', shredder: 'Мелачка · клик', window: 'Прозорец · клик: отвори', windowOpen: 'Прозорец · клик: затвори',
      clock: 'Часовник · клик: ку-ку', door: 'Врата · клик: почукай',
    },
    generic: 'клик',
    treat: 'Лакомство', treatHint: (n) => `Клик: ${n} монети – любимецът идва да хапне`,
  },
  perf: { line: (fps, ms, cpu) => `${fps} к/с · ${ms} мс · ~${cpu}% CPU` },
  sound: {
    on: 'Звук: включен – звъни, когато агент чака теб или сесия приключи (само ако не гледаш прозореца). Клик – изключи.',
    off: 'Звук: изключен. Клик – включи.',
  },
  mute: {
    on: 'Тишина – спира всички звуци наведнъж (и известията). Клавиш M.',
    off: 'Тишина: включена – нищо не звучи. Клик или M – звуците се връщат.',
    done: 'Тишина – всички звуци са спрени (M ги връща)',
    back: 'Звуците са включени отново',
  },
  thinking: 'мисли…',
  legendHint: 'L – легенда · Esc – без фокус',
  // лична статистика (раздел в чекмеджето; работи и във „Фокус“)
  stats: {
    open: 'Статистика', today: 'Днес', days: 'Последните 7 дни',
    work: 'Работа на агентите', leads: 'от тях оркестратори', waited: 'Чакаха теб', tools: 'Извиквания', tokens: 'Токени (вход / изход)', cache: 'кеш',
    sessions: (n, s) => `${n} ${n === 1 ? 'сесия' : 'сесии'} · ${s} ${s === 1 ? 'под-агент' : 'под-агенти'}`,
    project: 'Проект', active: 'Работа', waiting: 'Чакане', calls: 'Извикв.', tok: 'Токени',
    cost: '≈ Цена по API', costHint: 'Claude модели. С абонамент Pro/Max не плащаш на токен.', noPrice: (n) => `+ ${n} токена от модели без цена (Codex, Gemini…)`,
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
    danger: 'В червено с ⚠ – рискова команда: трие рекурсивно, презаписва историята в git, пипа продукция (rm -rf, git push --force, terraform apply, „prod“…). Погледни, преди да разрешиш.',
    settings: 'Настройки',
    sections: { look: 'Изглед', alerts: 'Известия', privacy: 'Поверителност и данни', window: 'Прозорец', share: 'Сподели', help: 'Помощ' },
    data: 'Данните ти', dataHint: 'Всичко стои на този компютър (~/.pixel-office). Навън излизат само времето (ако си избрал град) и проверката за версия (ако е включена).',
    openStats: 'Статистика', openWeather: 'Времето навън', security: 'Какво се чете и записва',
    place: 'Размер и място', resetSize: 'Нулирай размера', resetPlace: 'Върни над трея', browser: 'Отвори в браузъра',
    keysTitle: 'Клавиши',
    agentsTitle: 'Други агенти', agentsHint: 'Claude Code, Codex, Gemini CLI и OpenCode се виждат сами. Copilot CLI, Cursor или собствен скрипт влизат през малък локален API.', agentsLink: 'Как да ги включиш (API)',
    keys: [['?', 'тези настройки'], ['B', 'магазинът'], ['L', 'легендата на цветовете'], ['Esc', 'затваря / маха фокуса'], ['Y / N', 'Разреши / Откажи'], ['Ctrl+Alt+P', 'покажи / скрий прозореца'], ['Ctrl+Alt+Y / N', 'разреши / откажи от всеки прозорец']],
    // всяка настройка с по едно изречение какво прави
    look: 'Как изглежда',
    office: 'Офис', officeHint: 'Цялата игра: монети и магазин, любимци, почивки с кафе, конзолка и дартс, ефекти и постижения.',
    focus: 'Фокус', focusHint: 'Тихо табло: без монети, магазин, любимци, ефекти и игри. Остава кой какво прави и кой те чака. Монетите се трупат и тук, само не се виждат.',
    strip: 'Тънка лента вместо офиса', stripHint: 'По един ред на сесия: състояние, какво прави, от колко време. Най-малко място на екрана; клик върху ред – към терминала.',
    legend: 'Легенда на цветовете', legendHint: 'Списъкът долу вдясно с имената на състоянията (клавиш L).',
    lamp: 'Лампата и неонът', lampHint: 'Лампата до дивана и неоновият надпис светят. Ключът е под този за осветлението.',
    lights: 'Осветление в офиса', lightsHint: 'Вечер лампите на тавана светят. Има и ключ до вратата – за колегите, които обичат да работят в пещера.',
    lang: 'Език',
    alerts: 'Известия',
    sound: 'Звук', soundHint: 'Кратка мелодия, когато агент чака теб или приключи дълга задача – само когато не гледаш прозореца.',
    sfxTitle: 'Звуци на офиса', sfx: 'Звук при клик по предметите', sfxHint: 'Кафемашината бълбука, растението шумоли, аквариумът звънва… Тихо, само когато ти щракнеш.',
    ambient: 'Фонов звук', ambientHint: 'Тихи клавиатури на агентите, които пишат, кафемашината, вратата, дъждът по стъклото (по истинското време), птички през отворен прозорец. Нощем по-тихо. Всичко е синтезирано, без файлове.',
    lofi: 'Lofi фон', lofiHint: 'Много тихи бавни акорди с пращене като от плоча – за работа. Синтезирани в браузъра.',
    volume: 'Сила', volumeHint: 'Обща за звуците на офиса (известията за чакащ агент не зависят от нея).',
    atmos: 'Атмосфера', atmosOpt: { full: 'Пълна', soft: 'Лека', off: 'Изкл.' }, atmosHint: 'Колко силно часът оцветява стаята (зазоряване, залез, нощ). „Лека“ и „Изкл.“ са по-ясни за поглед; във „Фокус“ е винаги лека.',
    calm: 'Спокоен офис', calmHint: 'Без разговори, общи радости и редки случки (птичка, куриер). Любимците, монетите и „чака те“ остават.',
    perfTitle: 'Леко за машината', saver: 'Пестене на батерията', saverHint: 'Най-много 15 кадъра в секунда и без частици (искри, пара, прашинки). Хората и цветовете остават. Без изричен избор се включва само, докато лаптопът е на батерия.',
    perf: 'Брояч на кадрите', perfHint: 'Долу вляво: кадри в секунда, милисекунди работа на кадър и приблизително колко от едно ядро ползва офисът.',
    perm: 'Отговаряй на разрешенията оттук', permHint: 'Добавя малък hook в настройките на Claude Code (~/.claude/settings.json, пази се резервно копие). Когато Claude пита „Разреши ли …?“, долу се появяват бутони Разреши / Откажи (клавиши Y / N). Терминалът работи както досега; ако не отговориш тук до 45 с, въпросът си остава там. Изключването маха hook-а.',
    permErr: { parse: 'settings.json не е валиден JSON – не го пипам.', write: 'Не успях да запиша settings.json.', offline: 'Сървърът не отговаря.' },
    notify: 'Известие от системата', notifyHint: 'Изскачащо известие, когато агент чака теб. Клик върху него отваря терминала на сесията.',
    privacy: 'Поверителност',
    lan: 'Изглед за телефон', lanHint: 'Офисът на телефона в същата Wi-Fi мрежа – само за гледане, с PIN, без команди, пътища и въпроси за разрешение. Отваря порт в локалната мрежа (Windows може да попита за защитната стена).',
    lanOpen: 'Сканирай кода с камерата на телефона или отвори:', lanQr: 'Сканирай с камерата на телефона', lanPin: 'PIN', lanNewPin: 'Нов PIN (излиза от всички телефони)', lanPhones: (n) => `Влезли телефони: ${n}`,
    lanNoNet: 'Не намирам локална мрежа (Wi-Fi или кабел).', lanErr: 'Не мога да отворя порт за телефона.',
    folders: 'Още папки с агенти', foldersHint: 'Claude Code в Docker, VM или на друг диск: посочи папката, монтирана като неговата ~/.claude. Офисът чете само нея – нищо не се пуска и не се праща.',
    folderAdd: 'Добави', folderPick: 'Избери…', folderPath: 'Път до папката, напр. C:\\claude-docker', folderDel: 'Махни',
    folderEmpty: 'още няма транскрипти', folderEnv: 'от CLAUDE_PROJECTS_EXTRA', folderHowto: 'Как да го пусна с Docker',
    folderErr: { path: 'Трябва пълен път (напр. C:\\claude-docker).', missing: 'Няма такава папка.', full: 'Стигнат е максимумът папки.' },
    cowork: (n) => `Claude Desktop (Cowork): следя ${n} ${n === 1 ? 'задача' : 'задачи'} от последното денонощие – сами, без настройка.`,
    private: 'Скривай команди и пътища', privateHint: 'Балончетата, картата и известията показват само инструмента и името на сесията – за споделен екран и стрийм.',
    window: 'Прозорец',
    onTop: 'Винаги отгоре', onTopHint: 'Прозорецът стои над другите, за да виждаш офиса, докато работиш.',
    taskbar: 'Иконка в лентата на задачите', taskbarHint: 'Освен до часовника, приложението има и бутон в лентата на задачите – клик го показва или прибира.',
    opacity: 'Прозрачност на прозореца', opacityHint: 'Колко се вижда офисът – по-ниско и работата отдолу прозира.',
    clear: 'Прозрачен фон (опит)', clearHint: 'Без стени и под – само хората и мебелите върху работния плот. Кликовете в празното минават през тях.',
    through: 'Кликовете минават през прозореца', throughHint: 'Мишката „минава“ през офиса към това отдолу. Връща се само от менюто в трея (иконата до часовника).',
    autoHide: 'Показвай се само когато трябва', autoHideHint: 'Прозорецът е скрит и излиза сам (без да взима фокуса), когато агент те чака или оркестратор приключи; скрива се 8 с след това. Иконата в трея и Ctrl+Alt+P го показват по всяко време.',
    wait: 'Малко прозорче, когато няма сесии', waitHint: 'Без нито една сесия офисът се свива до сутрешна сцена и се отваря сам, щом се появи сесия.',
    login: 'Стартирай с Windows', loginMac: 'Стартирай при вход', loginHint: 'Cubicle Crew тръгва сам, когато влезеш в компютъра.',
    demo: 'Демо режим', demoHint: 'Измислени агенти – да видиш как изглежда всичко без Claude Code.',
    feedback: 'Обратна връзка', feedbackHint: 'Идея, нещо дразни или не работи? Пиши – проектът е безплатен и се прави по твоите отговори.',
    discuss: 'Идеи и въпроси (GitHub)', issue: 'Съобщи за проблем', coffee: 'Почерпи кафе ☕',
    updates: 'Нови версии', update: 'Проверявай за нова версия', updateHint: 'На всеки 6 часа пита GitHub кой е последният рилийз. За теб не се изпраща нищо; изтеглянето и инсталирането остават в твои ръце.',
    version: (v) => `Твоята версия: ${v}`, newer: (v) => `Има нова версия ${v} – изтегли`, latest: 'Това е последната.', checkNow: 'Провери сега',
    updInstall: 'Изтегли и инсталирай', updInstallHint: 'Сваля инсталатора от GitHub, проверява го и го пуска тихо върху тази инсталация – монетите и настройките остават, приложението се рестартира само. Ако е инсталирано за всички потребители, Windows ще поиска разрешение.',
    updDownloading: (p) => `Изтегля новата версия… ${p}%`, updInstalling: 'Инсталира… приложението ще се рестартира.', updError: (e) => `Не стана: ${e}. Опитай пак или изтегли ръчно.`,
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
    pages: ['', 'Днес', 'Последните 7 дни', 'Последните 30 дни'], work: 'Работа на агентите', waited: 'Чакали са теб', tokens: 'Токени (вход / изход)', cost: '≈ Цена по API',
    click: 'Клик – статистиката ти на прожекционния екран', next: 'Клик – следващата страница', back: 'Клик – навий екрана', none: 'Още няма статистика' },
  lights: { title: 'Осветление', on: 'Клик – светни лампите', off: 'Клик – загаси лампите' },
  lamp: { title: 'Лампата и неонът', on: 'Клик – светни', off: 'Клик – загаси' },
  min: 'мин', sec: 'сек', hour: 'ч',
  tokens: 'Монети',
  shop: {
    title: 'Магазин',
    open: 'Магазин (B)',
    tabs: { walls: 'Стени', floor: 'Под и килими', furniture: 'Мебели', decor: 'Декор', pets: 'Любимци', special: 'Специални', avatar: 'Аватар', stats: 'Статистика', weather: 'Времето', trophies: 'Постижения', album: 'Албум' },
    album: {
      total: (n, m) => `Колекция ${n} / ${m}`, trophies: (n, m) => `Постижения ${n} / ${m}`,
      fair: 'Всяко нещо има точна цена и се купува направо – без случайни кутии и без лов на редки предмети. Посочи силует, за да го пробваш в офиса; клик – към раздела му.',
      season: (a, b) => `сезонно, ${a} – ${b}`,
    },
    groups: {
      wall: 'Боя', wainscot: 'Ламперия', floor: 'Под', rug: 'Килим под бюрата', lrug: 'Килим в зоната за почивка', sofa: 'Диван',
      chair: 'Столове', lamp: 'Лампа', plants: 'Растения', posters: 'Постери', window: 'Изглед през прозорците',
      cat: 'Котка', cat2: 'Още една котка', dog: 'Куче', season: 'Сезонно', neon: 'Неонов надпис', espresso: 'Кафемашина', aquarium: 'Аквариум', arcade: 'Аркада', massage: 'Масажен стол',
    },
    slots: { 'rug.team0': 'Екип 1', 'rug.team1': 'Екип 2', 'chair.team0': 'Под-агенти', 'chair.team1': 'Екип 2', 'chair.lead': '★ Оркестратори' },
    by: (h) => `от ${h.includes(' ') ? h : '@' + h}`, // GitHub акаунт с @, истинско име без
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
      cats: ['Котка 1', 'Котка 2', 'Котка 3'], dog: 'Куче', away: 'Прибери у дома', back: 'Върни в офиса', crew: 'Любимци на контрибютъри',
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
  // еднократни известия за новости (tokens.js news())
  whatsNew: {
    label: 'Ново', title: (v) => `Какво ново във версия ${v}`, ok: 'Супер',
    updLabel: 'Нова версия', updTitle: (v) => `Излезе версия ${v}`, updText: (c) => `Ти си на ${c}. Новата е в GitHub – монетите, обзавеждането и настройките остават.`,
    updSelf: 'Изтегля се, проверява се и се инсталира върху тази – приложението се рестартира само.', updManual: 'Изтегли инсталатора и го пусни – той обновява старата версия.',
    install: 'Изтегли и инсталирай', download: 'Изтегли', notes: 'Какво има в нея', later: 'По-късно',
    items: {
      '2.18.5': [
        ['Бутон за прозрачния фон', 'Новият бутон ◐ в лентата на прозореца, до „Винаги отгоре“, включва и изключва прозрачния фон с едно щракване.'],
        ['Без стойки', 'При прозрачен фон часовникът и времето под него просто висят във въздуха над бюрата, а неонът е пак на мястото си над зоната за почивка.'],
      ],
      '2.18.4': [
        ['Часовник, неон и време при прозрачен фон', 'Стоят на стойки над бюрата, до дартса – стрелките, цифрите и времето навън се движат както на стената.'],
        ['Нощ и при прозрачен фон', 'Вечер офисът потъмнява, а лампите, мониторите и неонът светят – само върху нарисуваното, работният плот около него остава чист.'],
      ],
      '2.18.3': [
        ['Офисът до магазина е цял', 'В голям прозорец с отворен магазин офисът вече не се разтяга до дребни бюра сред безкраен под – остава в нормален размер, в средата.'],
      ],
      '2.18.2': [
        ['Прозрачният фон хваща кликовете правилно', 'Кликовете минават само през празните места – върху хората, мебелите и лентата горе прозорецът ги хваща, при всякакъв мащаб на екрана.'],
      ],
      '2.18.1': [
        ['По-нисък офис', 'Редовете бюра са по-близо и леко се застъпват – офисът заема по-малко място по височина. Прозорец в стария размер по подразбиране се смалява сам веднъж.'],
        ['Купички и фонтан пред бюрото', 'Купичките и фонтанът за любимците са пред най-дясното бюро, за да се виждат; играчките остават под килима.'],
        ['Масажният стол е от Hristiyan Dimov', 'Благодарим!'],
      ],
      '2.18.0': [
        ['Прозрачен фон', 'Настройки → Прозорец: без стени и небе, подът избледнява – офисът стои направо на работния плот, по-нисък, точно над лентата на задачите. Кликовете в празното минават през него.'],
        ['Прозрачност на прозореца', 'Плъзгач в Настройки → Прозорец – колко да прозира работата ти отдолу.'],
        ['⤡ Нулирай размера', 'Бутонът е в лентата горе (вместо „Кликовете минават през“ – то остава в менюто в трея и в настройките).'],
        ['Кът за любимците', 'Масажният стол е вдясно до дивана, а отдолу има място за тях: купичка за всеки, фонтан с течаща вода и разхвърляни играчки.'],
      ],
    },
  },
  news: { label: 'Ново', bueno: ['Буено е в магазина', 'Безплатна нова порода за кучето ти – Магазин → Любимци'] },
  // офисните любимци: имена по подразбиране (по място) и подсказката при посочване
  pets: {
    names: { cat: 'Мица', cat2: 'Тигрото', cat3: 'Писана', dog: 'Шаро' },
    breeds: { 'dog.bueno': 'Буено' }, // порода със собствено име (вместо това на мястото)
    kinds: { cat: 'Офисна котка', dog: 'Офисно куче' },
    tip: 'Клик – погали · двоен клик – име и външен вид',
  },
  // начална настройка (първо пускане)
  setup: {
    hello: 'Добре дошъл в Cubicle Crew!',
    intro: 'Три бързи неща и офисът е готов.',
    modeQ: 'Как да изглежда?', modeHint: 'И в двата режима виждаш кой какво прави и кой чака теб. Сменя се по всяко време от „?“.',
    sizeQ: 'Колко място да заема?', small: 'Екранът ти е малък – лентата е избрана, за да не пречи.',
    sizeOffice: 'Целият офис', sizeOfficeHint: (p) => `Около ${p}% от екрана. Най-добре на втори монитор.`,
    sizeStrip: 'Тънка лента', sizeStripHint: (p) => `По ред на сесия – около ${p}% от екрана. Офисът се отваря от трея.`,
    autoHide: 'Показвай се само когато трябва', autoHideHint: 'Скрит е, докато агент не те чака или не приключи. Иконата в трея остава.',
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
    demo: 'В демото няма град – избери времето зад прозорците (или с адреса: ?weather=rain).',
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
  winbar: { settings: 'Настройки и помощ', pin: 'Винаги отгоре', clear: 'Прозрачен фон (вкл./изкл.)', through: 'Кликовете минават през прозореца (махни от менюто в трея)', 'reset-size': 'Нулирай размера', hide: 'Скрий в трея', quit: 'Затвори' },
  demo2: { which: 'Кой вариант да избера?', cont: 'Да продължа ли?', whichShort: 'Кой вариант?', arch: 'Прегледай архитектурата', tests: 'Пусни тестовете', cache: 'Измисли план за кеша' },
};

const T_EN = {
  title: 'Cubicle Crew',
  connecting: 'connecting…',
  connected: 'connected',
  waitingActivity: 'Waiting for an agent to start working…',
  lan: { title: 'Cubicle Crew on your phone', hint: 'The PIN is on the computer: Settings → Privacy → Phone view.', go: 'Sign in', wrong: 'Wrong PIN', locked: 'Too many tries – try again in a minute.', offline: 'The computer is not answering.' },
  wait: { morning: 'Good morning!', day: 'Good afternoon!', evening: 'Good evening!', msg: 'Waiting for the first agent…', hint: 'Click to open the office' },
  reconnecting: 'connection lost, retrying…',
  demo: 'DEMO',
  web: { live: 'Live demo – the agents are simulated.', try: 'The app shows your real Claude Code, Codex, Gemini CLI and OpenCode sessions.', get: 'Download', or: 'or', star: 'GitHub', hide: 'Hide', app: 'This works in the app, with your real sessions.' },
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
  model: 'Model',
  context: 'Context',
  crashed: { title: 'Session ended', hint: 'in the middle of the work' },
  needsYou: 'Needs you!',
  allow: (tool) => (tool ? `Allow ${tool}?` : 'Answer in the terminal'),
  danger: 'Risky command',
  perm: { allow: 'Allow', deny: 'Deny', more: (n) => `${n} more`, keys: 'Y / N', global: 'or Ctrl+Alt+Y / N from anywhere' },
  // clicking props in the office (poke.js) – hover hint
  poke: {
    names: {
      counter: 'Coffee machine · click: brew', cooler: 'Water cooler · click: a sip', plant: 'Plant · click: rustle', bookshelf: 'Bookshelf · click',
      arcade: 'Arcade · click: insert coin', aquarium: 'Aquarium · click: tap the glass', massage: 'Massage chair · click: switch on', sofa: 'Sofa · click: fluff the cushion',
      table: 'Coffee table · click', floor_lamp: 'Lamp · click: on/off', season: 'Decoration · click', pet_fountain: 'Water fountain · click: splash', pet_bowl: 'Bowl',
      toy: 'Toy · click: squeak', printer: 'Printer · click: print', shredder: 'Shredder · click', window: 'Window · click: open', windowOpen: 'Window · click: close',
      clock: 'Clock · click: cuckoo', door: 'Door · click: knock',
    },
    generic: 'click',
    treat: 'Treat', treatHint: (n) => `Click: ${n} coins – your pet comes for a snack`,
  },
  perf: { line: (fps, ms, cpu) => `${fps} fps · ${ms} ms · ~${cpu}% CPU` },
  sound: {
    on: 'Sound: on – chimes when an agent needs you or a session finishes (only while you are not looking at the window). Click to mute.',
    off: 'Sound: off. Click to turn it on.',
  },
  mute: {
    on: 'Mute – stops every sound at once (alerts too). Key M.',
    off: 'Muted – nothing plays. Click or press M to bring the sounds back.',
    done: 'Muted – every sound is stopped (M brings them back)',
    back: 'Sounds are back on',
  },
  thinking: 'thinking…',
  legendHint: 'L – legend · Esc – clear focus',
  stats: {
    open: 'Stats', today: 'Today', days: 'Last 7 days',
    work: 'Agent work', leads: 'of which orchestrators', waited: 'Waited for you', tools: 'Tool calls', tokens: 'Tokens (in / out)', cache: 'cache',
    sessions: (n, s) => `${n} session${n === 1 ? '' : 's'} · ${s} sub-agent${s === 1 ? '' : 's'}`,
    project: 'Project', active: 'Work', waiting: 'Waiting', calls: 'Calls', tok: 'Tokens',
    cost: '≈ API price', costHint: 'Claude models. On a Pro/Max plan you do not pay per token.', noPrice: (n) => `+ ${n} tokens from models without a price (Codex, Gemini…)`,
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
    danger: 'Red with ⚠ – a risky command: deletes recursively, rewrites git history or touches production (rm -rf, git push --force, terraform apply, “prod”…). Take a look before you allow it.',
    settings: 'Settings',
    sections: { look: 'Look', alerts: 'Alerts', privacy: 'Privacy & data', window: 'Window', share: 'Share', help: 'Help' },
    data: 'Your data', dataHint: 'Everything stays on this computer (~/.pixel-office). Only the weather (if you picked a city) and the update check (if it is on) go out.',
    openStats: 'Stats', openWeather: 'Weather outside', security: 'What is read and written',
    place: 'Size and place', resetSize: 'Reset size', resetPlace: 'Move back above the tray', browser: 'Open in browser',
    keysTitle: 'Keys',
    agentsTitle: 'Other agents', agentsHint: 'Claude Code, Codex, Gemini CLI and OpenCode show up by themselves. Copilot CLI, Cursor or your own script come in through a small local API.', agentsLink: 'How to connect them (API)',
    keys: [['?', 'these settings'], ['B', 'the shop'], ['L', 'the colour legend'], ['Esc', 'close / clear the focus'], ['Y / N', 'Allow / Deny'], ['Ctrl+Alt+P', 'show / hide the window'], ['Ctrl+Alt+Y / N', 'allow / deny from any window']],
    look: 'Look',
    office: 'Office', officeHint: 'The whole game: coins and the shop, pets, coffee breaks, handheld games and darts, effects and achievements.',
    focus: 'Focus', focusHint: 'A quiet status board: no coins, shop, pets, effects or games. You still see who is doing what and who is waiting for you. Coins keep adding up, just hidden.',
    strip: 'Thin strip instead of the office', stripHint: 'One row per session: state, what it is doing, for how long. Takes the least space; click a row to jump to its terminal.',
    legend: 'Colour legend', legendHint: 'The list at the bottom right with the state names (key L).',
    lamp: 'Lamp and neon', lampHint: 'The lamp by the sofa and the neon sign are on. The switch is under the light switch.',
    lights: 'Office lights', lightsHint: 'The ceiling lights come on in the evening. There is also a switch by the door – for colleagues who like working in a cave.',
    lang: 'Language',
    alerts: 'Alerts',
    sound: 'Sound', soundHint: 'A short tune when an agent waits for you or finishes a long task – only when you are not looking at the window.',
    sfxTitle: 'Office sounds', sfx: 'Sounds when you click things', sfxHint: 'The coffee machine gurgles, the plant rustles, the aquarium tinks… Quiet, and only when you click.',
    ambient: 'Ambient sound', ambientHint: 'Soft keyboards of the agents that are typing, the coffee machine, the door, rain on the glass (real weather), birds through an open window. Quieter at night. All synthesized, no files.',
    lofi: 'Lofi background', lofiHint: 'Very quiet slow chords with a little vinyl crackle – to work to. Synthesized in the browser.',
    volume: 'Volume', volumeHint: 'For the office sounds (the waiting-agent alerts do not depend on it).',
    atmos: 'Atmosphere', atmosOpt: { full: 'Full', soft: 'Soft', off: 'Off' }, atmosHint: 'How strongly the time of day colours the room (dawn, sunset, night). Soft and Off are easier to read at a glance; Focus mode always uses Soft.',
    calm: 'Calm office', calmHint: 'No chats, group cheers or rare events (bird, courier). Pets, coins and "waiting for you" stay.',
    perfTitle: 'Light on the machine', saver: 'Battery saver', saverHint: 'At most 15 frames per second and no particles (sparks, steam, dust). People and colours stay. Unless you choose, it turns on by itself while the laptop runs on battery.',
    perf: 'Frame counter', perfHint: 'Bottom left: frames per second, milliseconds of work per frame and roughly how much of one core the office uses.',
    perm: 'Answer permission prompts here', permHint: 'Adds a small hook to the Claude Code settings (~/.claude/settings.json, a backup is kept). When Claude asks “Allow …?”, Allow / Deny buttons appear at the bottom (keys Y / N). The terminal works as before; if you do not answer here within 45 s the question stays there. Turning it off removes the hook.',
    permErr: { parse: 'settings.json is not valid JSON – leaving it alone.', write: 'Could not write settings.json.', offline: 'The server is not answering.' },
    notify: 'System notification', notifyHint: 'A pop-up when an agent waits for you. Clicking it opens that session\'s terminal.',
    privacy: 'Privacy',
    lan: 'Phone view', lanHint: 'The office on your phone on the same Wi-Fi – view only, with a PIN, without commands, paths or permission prompts. Opens a port on your local network (Windows may ask about the firewall).',
    lanOpen: 'Scan the code with your phone camera, or open:', lanQr: 'Scan with your phone camera', lanPin: 'PIN', lanNewPin: 'New PIN (signs out every phone)', lanPhones: (n) => `Phones signed in: ${n}`,
    lanNoNet: 'No local network found (Wi-Fi or cable).', lanErr: 'Could not open a port for the phone.',
    folders: 'More agent folders', foldersHint: 'Claude Code in Docker, a VM or on another drive: pick the folder mounted as its ~/.claude. The office only reads it – nothing is started or sent.',
    folderAdd: 'Add', folderPick: 'Choose…', folderPath: 'Folder path, e.g. C:\\claude-docker', folderDel: 'Remove',
    folderEmpty: 'no transcripts yet', folderEnv: 'from CLAUDE_PROJECTS_EXTRA', folderHowto: 'How to run it with Docker',
    folderErr: { path: 'Needs a full path (e.g. C:\\claude-docker).', missing: 'No such folder.', full: 'Too many folders.' },
    cowork: (n) => `Claude Desktop (Cowork): watching ${n} ${n === 1 ? 'task' : 'tasks'} from the last day – found automatically.`,
    private: 'Hide commands and paths', privateHint: 'Bubbles, the card and notifications show only the tool and the session name – for screen sharing and streaming.',
    window: 'Window',
    onTop: 'Always on top', onTopHint: 'The window stays above the others, so you see the office while you work.',
    taskbar: 'Taskbar button', taskbarHint: 'Besides the icon by the clock, the app gets a button on the taskbar – click it to show or minimise the window.',
    opacity: 'Window opacity', opacityHint: 'How solid the office is – lower and your work shows through.',
    clear: 'Transparent background (experiment)', clearHint: 'No walls or floor – just the people and the furniture on your desktop. Clicks on empty spots go through.',
    through: 'Click-through', throughHint: 'The mouse goes through the office to whatever is below. Turn it off from the tray menu (the icon by the clock).',
    autoHide: 'Show only when needed', autoHideHint: 'The window stays hidden and comes up by itself (without taking focus) when an agent waits for you or a lead finishes; it hides 8 s later. The tray icon and Ctrl+Alt+P show it any time.',
    wait: 'Small window when there are no sessions', waitHint: 'With no session open the office shrinks to a morning scene and opens by itself when a session starts.',
    login: 'Start with Windows', loginMac: 'Start at login', loginHint: 'Cubicle Crew starts by itself when you sign in.',
    demo: 'Demo mode', demoHint: 'Made-up agents – to see how everything looks without Claude Code.',
    feedback: 'Feedback', feedbackHint: 'An idea, something annoying or broken? Tell us – the project is free and shaped by what people say.',
    discuss: 'Ideas and questions (GitHub)', issue: 'Report a problem', coffee: 'Buy me a coffee ☕',
    updates: 'Updates', update: 'Check for new versions', updateHint: 'Every 6 hours asks GitHub for the latest release number. Nothing about you is sent; downloading and installing stay up to you.',
    version: (v) => `Your version: ${v}`, newer: (v) => `Version ${v} is out – download`, latest: 'It is the latest.', checkNow: 'Check now',
    updInstall: 'Download and install', updInstallHint: 'Downloads the installer from GitHub, checks it and runs it quietly over this installation – coins and settings stay, the app restarts by itself. If it is installed for all users, Windows asks for permission once.',
    updDownloading: (p) => `Downloading the new version… ${p}%`, updInstalling: 'Installing… the app will restart.', updError: (e) => `It didn't work: ${e}. Try again or download it by hand.`,
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
    pages: ['', 'Today', 'Last 7 days', 'Last 30 days'], work: 'Agent work', waited: 'Waited for you', tokens: 'Tokens (in / out)', cost: '≈ API price',
    click: 'Click to put your stats on the projector screen', next: 'Click for the next page', back: 'Click to roll the screen up', none: 'No stats yet' },
  lights: { title: 'Lights', on: 'Click to turn the lights on', off: 'Click to turn the lights off' },
  lamp: { title: 'Lamp and neon', on: 'Click to turn them on', off: 'Click to turn them off' },
  min: 'min', sec: 's', hour: 'h',
  tokens: 'Coins',
  shop: {
    title: 'Shop',
    open: 'Shop (B)',
    tabs: { walls: 'Walls', floor: 'Floor & rugs', furniture: 'Furniture', decor: 'Decor', pets: 'Pets', special: 'Special', avatar: 'Avatar', stats: 'Stats', weather: 'Weather', trophies: 'Achievements', album: 'Album' },
    album: {
      total: (n, m) => `Collection ${n} / ${m}`, trophies: (n, m) => `Achievements ${n} / ${m}`,
      fair: 'Everything has a fixed price and is bought directly – no loot boxes, no hunting for rare drops. Hover a silhouette to try it in the office; click to jump to its tab.',
      season: (a, b) => `seasonal, ${a} – ${b}`,
    },
    groups: {
      wall: 'Paint', wainscot: 'Wainscoting', floor: 'Floor', rug: 'Office rug', lrug: 'Lounge rug', sofa: 'Sofa',
      chair: 'Chairs', lamp: 'Lamp', plants: 'Plants', posters: 'Posters', window: 'Window view',
      cat: 'Cat', cat2: 'One more cat', dog: 'Dog', season: 'Seasonal', neon: 'Neon sign', espresso: 'Coffee machine', aquarium: 'Aquarium', arcade: 'Arcade', massage: 'Massage chair',
    },
    slots: { 'rug.team0': 'Team 1', 'rug.team1': 'Team 2', 'chair.team0': 'Sub-agents', 'chair.team1': 'Team 2', 'chair.lead': '★ Leads' },
    by: (h) => `by ${h.includes(' ') ? h : '@' + h}`,
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
      cats: ['Cat 1', 'Cat 2', 'Cat 3'], dog: 'Dog', away: 'Send home', back: 'Bring back', crew: 'Contributor pets',
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
  whatsNew: {
    label: 'New', title: (v) => `What's new in ${v}`, ok: 'Nice',
    updLabel: 'New version', updTitle: (v) => `Version ${v} is out`, updText: (c) => `You are on ${c}. The new one is on GitHub – your coins, decor and settings stay.`,
    updSelf: 'It downloads, gets checked and installs over this one – the app restarts by itself.', updManual: 'Download the installer and run it – it updates the old version.',
    install: 'Download and install', download: 'Download', notes: "What's in it", later: 'Later',
    items: {
      '2.18.5': [
        ['A button for the transparent background', 'The new ◐ button on the title bar, next to "Always on top", turns the transparent background on and off with one click.'],
        ['No more poles', 'On the transparent background the clock and the weather under it simply float above the desks, and the neon is back in its spot above the lounge.'],
      ],
      '2.18.4': [
        ['Clock, neon and weather on the transparent background', 'They stand on poles above the desks, next to the darts – the hands, digits and weather move just like on the wall.'],
        ['Night on the transparent background too', 'In the evening the office gets darker and the lamps, monitors and neon glow – only on the drawn parts, the desktop around it stays clean.'],
      ],
      '2.18.3': [
        ['The office stays whole next to the shop', 'In a big window with the shop open the office no longer stretches into tiny desks on an endless floor – it keeps its normal size, centred.'],
      ],
      '2.18.2': [
        ['Transparent background catches clicks properly', 'Clicks go through only on empty spots – on people, furniture and the title bar the window catches them, at any display scale.'],
      ],
      '2.18.1': [
        ['A lower office', 'The desk rows are closer and slightly overlap – the office takes less height. A window still at the old default size shrinks once by itself.'],
        ['Bowls and fountain by the desk', 'The pet bowls and the water fountain sit in front of the rightmost desk, where you can see them; the toys stay under the rug.'],
        ['The massage chair is by Hristiyan Dimov', 'Thank you!'],
      ],
      '2.18.0': [
        ['Transparent background', 'Settings → Window: no walls or sky, the floor fades out – the office sits right on your desktop, lower, just above the taskbar. Clicks on empty spots go through.'],
        ['Window opacity', 'A slider in Settings → Window – how much of your work shows through.'],
        ['⤡ Reset size', 'The button is on the title bar now (instead of click-through – that stays in the tray menu and in settings).'],
        ['A pet corner', 'The massage chair moved next to the sofa, and below it there is room for them: a bowl each, a fountain with running water and toys lying around.'],
      ],
    },
  },
  news: { label: 'New', bueno: ['Bueno is in the shop', 'A free new breed for your dog – Shop → Pets'] },
  pets: {
    names: { cat: 'Misty', cat2: 'Tiger', cat3: 'Luna', dog: 'Rex' },
    breeds: { 'dog.bueno': 'Bueno' },
    kinds: { cat: 'Office cat', dog: 'Office dog' },
    tip: 'Click to pet · double-click to rename or change the look',
  },
  setup: {
    hello: 'Welcome to Cubicle Crew!',
    intro: 'Three quick things and the office is ready.',
    modeQ: 'How should it look?', modeHint: 'Both modes show who is doing what and who is waiting for you. Change it any time from "?".',
    sizeQ: 'How much room should it take?', small: 'Your screen is small – the strip is picked so it stays out of the way.',
    sizeOffice: 'The whole office', sizeOfficeHint: (p) => `About ${p}% of the screen. Best on a second monitor.`,
    sizeStrip: 'Thin strip', sizeStripHint: (p) => `One row per session – about ${p}% of the screen. Open the office from the tray.`,
    autoHide: 'Show only when needed', autoHideHint: 'Hidden until an agent waits for you or finishes. The tray icon stays.',
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
    demo: 'The demo has no city – pick the weather outside the windows (or in the address: ?weather=rain).',
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
  winbar: { settings: 'Settings and help', pin: 'Always on top', clear: 'Transparent background (on/off)', through: 'Click-through (turn it off from the tray menu)', 'reset-size': 'Reset size', hide: 'Hide to tray', quit: 'Quit' },
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
    'dog.bueno': 'Bueno Mixed', 'dog.beagle': 'Beagle', 'dog.golden': 'Golden retriever', 'dog.black': 'Black labrador', 'dog.dachshund': 'Dachshund', 'dog.corgi': 'Corgi',
    'dog.husky': 'Husky', 'dog.dalmatian': 'Dalmatian', 'dog.pug': 'Pug',
    'season.pumpkins': 'Pumpkins', 'season.tree': 'Christmas tree', 'season.tulips': 'Tulips', 'season.fan': 'Standing fan',
    'window.city': 'City', 'window.sea': 'Sea', 'window.mountains': 'Mountains',
    'neon.code': 'Neon sign', 'neon.cheers': 'Cheers', 'neon.metal': 'Beer & metal', 'espresso.pro': 'Espresso machine', 'aquarium.reef': 'Aquarium', 'arcade.retro': 'Arcade cabinet', 'massage.chair': 'Massage chair',
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
// демото в интернет (GitHub Pages): scripts/pages.mjs слага window.CC_WEB в index.html – без сървър, винаги демо
const WEB = Q.has('web') || !!globalThis.CC_WEB;
export const PARAMS = {
  demo: Q.has('demo') ? (Q.get('demo') || 'sim') : WEB ? 'sim' : null,  // ?demo  или  ?demo=showcase
  web: WEB,
  debug: Q.has('debug'),
  agents: Q.has('agents') ? Math.max(1, Math.min(36, Number(Q.get('agents')) || 5)) : null,
  time: Q.get('time'),          // ?time=21:30 — фалшив час за небето (за тестове)
  wander: Q.has('wander') ? Number(Q.get('wander')) * 1000 : null,
  seed: Q.has('seed') ? Number(Q.get('seed')) : null,
  desktop: Q.has('desktop'),   // отворено от Electron приложението
  wait: Q.has('wait'),         // сутрешен екран, докато няма сесия (Electron при старт с Windows)
  weather: Q.get('weather'),   // ?weather=clear|cloudy|overcast|fog|drizzle|rain|snow|storm — фалшиво време (за тестове/демото)
  setup: Q.has('setup'),       // ?setup — показва началната настройка отново (за тестове; в демото – в паметта)
  clear: Q.has('clear'),       // прозрачен фон (приложението с transparent прозорец): без стени, небе и оттенък, подът избледнява
  overlay: Q.has('overlay'),   // ?overlay – за OBS/стрийм: без HUD и легенда, командите и пътищата са скрити
  focus: Q.has('focus'),       // ?focus – режим „Фокус“ (за тестове; иначе се пази в настройките)
  strip: Q.has('strip'),       // ?strip – тънка лента: по един ред на сесия вместо офиса (Electron го слага от менюто)
  // отворено през адреса в локалната мрежа (изгледът за телефон): само за гледане, винаги без команди и пътища
  lan: !WEB && !/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(location.hostname),
};
// прозрачен фон: стената я няма – по-ниска „стена“ (колкото да се събере библиотеката): стаята е 356×166 (обичайната – 356×182)
if (PARAMS.clear) Object.assign(CFG, { WALL_H: 44, MIN_H: 160, LOUNGE_UP: true, FIXED_ROOM: true });
if (PARAMS.wander != null && !Number.isNaN(PARAMS.wander)) CFG.WANDER_AFTER_MS = PARAMS.wander;
/** Име на любимец по място (save.petNames, иначе името на породата, ако има такова, иначе това на мястото – на текущия език). */
export const petName = (slot, names, look) => names?.[slot] || T.pets.breeds[look] || T.pets.names[slot] || slot;
/** За показване: прякорът, а ако породата има свое (фиксирано) име и то е друго – „Шаро (Буено)“. */
export const petTitle = (slot, names, look) => {
  const n = petName(slot, names, look), b = T.pets.breeds[look];
  return b && n !== b ? `${n} (${b})` : n;
};
