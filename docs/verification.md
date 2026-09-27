# Перевірка (Task A–C)

> Прогони A/B і фіча «запит на кошторис» — в окремому звіті `docs/ab-validation.md` (Task D).

- **Інструмент і версія, модель:** Claude Code 2.1.280 (десктоп-застосунок, вкладка Code) · Opus 5.5 (`claude-opus-5-5`)
- **ОС і термінал, Node:** Windows 10 Pro 19045 · Git Bash (команди агента) і PowerShell (встановлення скіла людиною) · Node 24.18.0

## Скіли видно у свіжій сесії

- Як перевіряли: окремий неінтерактивний запуск у корені репозиторію після коміту `dac2286`
  (скіли Task A і B закомічені, Task C ще немає) — `MSYS_NO_PATHCONV=1 claude -p "/context"`, CLI
  2.1.280, що входить до десктоп-застосунку (`%LOCALAPPDATA%\Packages\Claude_…\LocalCache\Roaming\Claude\claude-code\2.1.280\claude.exe`;
  окремо CLI не встановлювали). У десктоп-застосунку `/context` показує лише загальний розмір розділу
  Skills без назв, а `/skills` відкриває вікно налаштувань — тому список знято через CLI.
  Модель у виводі: `claude-opus-5-5[1m]`.

| Skill | Звідки (Project / Personal / вбудований) | Примітка |
|---|---|---|
| `vercel-react-best-practices` | Project | ~120 токенів (лише `name` + `description`; правила завантажуються, коли скіл викликано) |
| `building-client-form` | Project | ~310 токенів |
| `integrating-n8n-webhooks` | Project | ~320 токенів; той самий запуск `claude -p "/context"` після коміту `82bef87` — усі три скіли Project |

- Решта рядків розділу Skills — вбудовані скіли Claude Code (`dataviz`, `code-review`, `simplify`,
  `run`, `claude-api`, `update-config` тощо) з позначкою Built-in; жодного Personal.

- Особисті скіли: на момент цього запуску (25.09, до 14:28) `~/.claude/skills/` не існувало; пізніше десктоп-застосунок
  створив там `synced/` зі скілами синхронізації облікового запису (`docs`, `pdf`, `skill-creator`…, див.
  `docs/ab-validation.md`) — копій проєктних скілів серед них немає. Є `~/.agents/skills/handoff` і
  `~/.codex/skills/{handoff,n8n-rag-workflows,stop-slop}` — Claude Code ці теки не читає (їх читають
  Cursor/Codex), тож на перевірки в Claude Code вони не впливають.

## Task A — виправлення за скілом Vercel

Скіл: `.claude/skills/vercel-react-best-practices/` (коміт `26b0a11`, тег
`agent-skills-063bee94c3f4df8453406c830b0a7df0f2860278`, 75 файлів, `skills-lock.json`). Рев'ю до
встановлення — `docs/skill-review.md` (коміт `12c04f6`, раніше за встановлення).

### Рев'ю застосунку за скілом

Рев'ю зробив агент за правилами скіла (читання `rules/<id>.md`) для `app/`, `components/`, `lib/`; кожну
пораду звірено з `node_modules/next/dist/docs/` (Next.js 16.3.5). Рядки — для коду `main` (`01a7dd4`).

| Файл:рядок | id правила | Що не так | Виправлення для Next.js 16 | Статус |
|---|---|---|---|---|
| `app/dashboard/page.tsx:16-18` | `async-parallel` | `getLeads` (400 мс), `getLeadStats` (1200 мс), `getSourceBreakdown` (400 мс) незалежні, але чекаються по черзі | `Promise.all` | ✅ `9be2047` |
| `lib/data.ts:7`, `lib/data.ts:18` + 4 місця виклику | `server-cache-react` | `getCurrentUser()` без `cache()` — викликається в layout, header і page; `getWorkspace` у `cache()`, але з інлайн-об'єктом `{ slug }` — `Object.is` дає промах щоразу | `cache()` для `getCurrentUser`, `getWorkspace(slug: string)` | ✅ `bece8c3` |
| `app/dashboard/page.tsx:32` → `components/leads-table.tsx:12` | `server-serialization` | Client Component отримує повні записи лідів (email, телефон, IP, `rawPayload`, внутрішні нотатки), а показує 5 полів | тип `LeadListItem` і вибір полів у `lib/data.ts` | ✅ `3e19f11` |
| `app/dashboard/page.tsx:17` (`getLeadStats`, 1200 мс) | `async-suspense-boundaries` | найповільніший запит тримає всю сторінку | статистику — окремим async-компонентом за `<Suspense>` | не робили |
| `app/actions.ts:68-77` | `server-auth-actions` | `updateLeadStatus` і `deleteLead` — публічні POST-ендпоінти без перевірки сесії й належності ліда до workspace | перевірка сесії й workspace всередині дії | ✅ `b468334` — після Task D (див. нижче) |
| `app/actions.ts:53-63` | `server-after-nonblocking` | форма чекає виклик n8n і `logAudit` (250 мс) перед відповіддю | повільне — в `after()` | ✅ у Task D: `f6ecfd4`, `61de794` (виклик n8n до BASE не чіпали) |
| `components/leads-toolbar.tsx:4` | `bundle-conditional` | `exceljs` завантажується з дашбордом, хоча потрібен лише після «Експорт в Excel» | `await import("exceljs")` в обробнику кліку | не робили |
| `components/leads-toolbar.tsx:6` | `bundle-dynamic-imports` | графік з `recharts` у бандлі сторінки, хоча за замовчуванням прихований | `next/dynamic` для `SourcesChart` | не робили |
| `components/lead-search.tsx:20-24` | `client-swr-dedup` | після рендеру ще раз тягне `/api/leads` (усі ліди з email і телефоном), хоча сторінка їх уже має | отримувати рядки з сервера пропсом | не робили |
| `components/lead-search.tsx:43-45` | `rerender-derived-state-no-effect` | результати пошуку — у `useState`, що оновлюється з `useEffect` | обчислювати під час рендеру | не робили |
| `components/lead-search.tsx:5` | `bundle-barrel-imports` | `import { debounce } from "lodash"` — `lodash` (не `lodash-es`) не входить у пакети, які Next.js 16 оптимізує за замовчуванням | `import debounce from "lodash/debounce"` | не робили |

### Виправлення

**Як міряли:** продакшн-збірка `npm run build && npm start` на `http://localhost:3000` (перед кожним
заміром — перевірка, що відповідає саме LeadDesk: `X-Powered-By: Next.js`, `<title>LeadDesk`);
cookie демо-користувачки Olena `leaddesk_session=demo-u_olena`; один прогрівальний запит, далі 3 прогони:

```bash
C="leaddesk_session=demo-u_olena"; U=http://localhost:3000/dashboard
curl -s -o /dev/null -b "$C" "$U"                                   # прогрів
for i in 1 2 3; do curl -s -o /dev/null -b "$C" -w "TTFB %{time_starttransfer}s, total %{time_total}s\n" "$U"; done
curl -s  -b "$C" "$U" | wc -c                                       # HTML, байти
curl -sL -b "$C" -H "RSC: 1" "$U" | wc -c                           # RSC, байти
```

Лічильники `db:<запит>` — рядки журналу `npm start`, що додались після **одного** `curl` сторінки.
Поля ліда в RSC — `curl -sL -b "$C" -H "RSC: 1" "$U" | grep -oE '"(email|phone|internalNotes|rawPayload|ipAddress)":' | sort | uniq -c`.
Сервер перезапускався після кожного виправлення (нова збірка). Кожен рядок нижче — окремий коміт
поверх попереднього.

| Правило (id) | Коміт | Файли | Що змінилось | Було (`main`) | Стало | Як міряли |
|---|---|---|---|---|---|---|
| `async-parallel` | `9be2047` | `app/dashboard/page.tsx` | три незалежні запити workspace — через `Promise.all` | TTFB 2,312 / 2,301 / 2,281 с | TTFB **1,478 / 1,480 / 1,480 с** | `curl` × 3 після прогріву |
| `server-cache-react` | `bece8c3` | `lib/data.ts`, `app/dashboard/layout.tsx`, `app/dashboard/page.tsx`, `app/dashboard/leads/[id]/page.tsx`, `components/dashboard-header.tsx` | `getCurrentUser` у `cache()`; `getWorkspace(slug)` з примітивним ключем | за один `GET /dashboard`: `db:getUserBySession` **3**, `db:getWorkspace` **3** | `db:getUserBySession` **1**, `db:getWorkspace` **1** (TTFB 1,470 / 1,483 / 1,480 с — без змін) | лічильники в журналі `npm start` |
| `server-serialization` | `3e19f11` | `lib/types.ts`, `lib/data.ts`, `components/leads-table.tsx` | `LeadsTable` отримує `LeadListItem` (5 полів) замість повного `Lead` | HTML 424 592 Б, RSC 315 197 Б; у RSC `email` ×344, `phone` ×344, `internalNotes` ×172 (на `main`); `rawPayload` ×172, `ipAddress` ×172 (ці два поля міряли вже перед `3e19f11`, на `bece8c3` — розміри ті самі) | HTML **111 377 Б**, RSC **31 257 Б**; жодного з цих полів | `wc -c`, `grep -oE` по RSC |

- **Чому для заміру — `async-parallel`:** найпростіше видно в числах і саме він відповідає на скаргу
  клієнта «дашборд понад 2 секунди». Очікування — 100 + 100 + max(400, 1200, 400) ≈ 1,4 с замість
  100 + 100 + 400 + 1200 + 400 ≈ 2,2 с; виміряно 2,30 → 1,48 с. Решта ~80 мс — імовірно, рендер 172 рядків (окремо не міряли).
- **`server-cache-react`:** на TTFB не вплинув — і не мав: layout і page у App Router рендеряться
  паралельно, тож зайві запити сесії й workspace не лежали на критичному шляху (довідка
  `06-fetching-data.md`, «Parallel data fetching»). Ефект — утричі менше запитів до «бази» на кожне
  відкриття дашборду. Перевірили, що не зламали: `/dashboard/leads/lead_0023` → 200 з іменем ліда;
  `/dashboard` без cookie → 307 на `/login`.
- **`server-serialization`:** разом з розміром зникли персональні дані, яких таблиця не показує, — це
  і продуктивність, і приватність (`02-guides/data-security.md`: віддавати лише те, що потрібно UI).
  Перевірили: у HTML 173 `<tr>` (заголовок + 172 ліди), жодного `@….example.test`; сортування
  працює з тими самими полями (`createdAt`, `fullName`, `company`) — `tsc` у `npm run build` це
  перевіряє.
- **Порада скіла, звірена з документацією Next.js 16 і не застосована:** `bundle-barrel-imports`
  радить додати пакет в `experimental.optimizePackageImports` — для `recharts` це вже зроблено в
  Next.js 16.3.5 за замовчуванням (`optimizePackageImports.md`, список «optimized by default»), тож
  конфіг не чіпали. `server-after-nonblocking` і `server-auth-actions` для `app/actions.ts` у Task A свідомо
  відклали: у цьому файлі розташований виклик n8n, а зміни в ньому до BASE (Task D) підказали б агентові в
  прогоні A частину контракту. Після Task D обидва зроблено: `after()` для `lead-created` — `f6ecfd4`, `61de794`;
  `fix(server-auth-actions)` — `b468334`. Решта рядків «не робили» — понад обов'язкові два, залишено як знахідки рев'ю.
- **Чи змінили числа виміряні виправлення:** так — `async-parallel` TTFB −36 %,
  `server-cache-react` запити 3 → 1, `server-serialization` RSC у 10 разів менше.
- **Невдалий замір, який не пішов у таблицю:** перший замір після `async-parallel` показав TTFB
  0,24 с і HTML 72 Б — на `localhost:3000` тоді відповідав інший локальний застосунок
  (`X-Powered-By: Express`, `404 Cannot GET /dashboard`). Після того як порт звільнився, заміри
  повторили; відтоді перед кожним заміром перевіряємо заголовок `X-Powered-By: Next.js`.
- **`npm run lint`, `npm run build` після кожного виправлення:** без помилок і попереджень
  (`✓ Compiled successfully`).

## Task B — `building-client-form`

Скіл: `.claude/skills/building-client-form/SKILL.md` (коміт `dac2286`), лише інструкції: `name` =
назва теки, `description` — 907 символів (що + «Use when …» + фрази-тригери українською й англійською
+ «Not for …»), 109 рядків. Правила Vercel — за id (`server-auth-actions`, `server-serialization`,
`server-after-nonblocking`), без копіювання.

- Запит у свіжій сесії (нова сесія Claude Code у десктоп-застосунку, Opus 5.5, корінь репозиторію,
  HEAD = `dac2286`; скіл не названо):
  > На сторінці ліда в дашборді (/dashboard/leads/[id]) додай форму «Додати нотатку»: одне текстове
  > поле до 500 символів; нотатка дописується до внутрішніх нотаток ліда.
- **Чи спрацював скіл і як це видно:** так, з першої спроби. У стрічці інструментів сесії одразу
  після запиту — рядок **«Ran skill/building-client-form»** (виклик інструмента `Skill`), далі агент
  написав: «Я вивчив сторінку ліда, шар даних і скіл форм проєкту». `description` не змінювали.
- **Що зроблено (файли)** — коміт `a441087`:
  - `lib/note-form.ts` — `parseNoteForm`: порожня нотатка → помилка; > 500 символів → «Нотатка
    задовга: 501 із 500 символів» без обрізання; `\r\n` нормалізується до підрахунку (textarea
    надсилає CRLF, а `maxLength` у браузері рахує перенос як один символ);
  - `app/dashboard/leads/[id]/actions.ts` — `addLeadNote`: `getCurrentUser()` (без сесії → `/login`),
    перевірка `lead.workspaceId === workspace.id` (однакова відповідь `forbidden` для «немає» і
    «чужий»), валідація, `db.appendLeadNote`, `after(() => logAudit(...))`, `revalidatePath`;
    повертає лише `{ status }`;
  - `components/note-form.tsx` — `useActionState`, `label htmlFor`, `aria-invalid`,
    `aria-describedby`, підсумок `role="alert"`, `key` + `defaultValue`, щоб введене не зникало;
  - `lib/db.ts` — `appendLeadNote`; `app/dashboard/leads/[id]/page.tsx` — блок нотаток видно завжди,
    переноси рядків показуються.
  - Агент також створив `.claude/launch.json` для свого dev-сервера — видалили, не комітили.
- **Спостереження агента:** id ліда спершу передавався через `addLeadNote.bind(null, leadId)`, і
  відправка без JS у dev-режимі не завершувалась (обрив за 30 с); агент замінив `bind` прихованим
  полем `leadId`, яке сервер перевіряє, як і решту `FormData`. До скіла це не додавали: причину окремо
  не перевіряли.
- **Пункти Verify зі скіла — перевірили самі** на продакшн-збірці (`npm run build`,
  `next start -p 3001`; порт 3000 тримав dev-сервер сесії перевірки). Кожна відправка — як звичайна
  HTML-форма без JavaScript: скрипт бере приховані поля Server Action з відрендереного `<form>` і
  надсилає `multipart/form-data` POST (скрипт і вивід — поза репозиторієм, `../ws04-work/task-b/`):

  | Пункт Verify | Результат |
  |---|---|
  | `npm run lint`, `npm run build` | ✅ без помилок |
  | Порожня відправка | ✅ HTTP 200, 521 мс; «Напишіть текст нотатки», `aria-invalid="true"`, `role="alert"` |
  | Задовгий текст (501 символ, в обхід `maxLength`) | ✅ «Нотатка задовга: 501 із 500»; введений текст повернувся в `<textarea>` |
  | Звичайна нотатка | ✅ HTTP 200, 552 мс; «Нотатку додано», нотатка є на сторінці |
  | Без JavaScript | ✅ усі рядки цієї таблиці — саме no-JS POST |
  | Дія з чужим лідом (`leadId=lead_0007`, workspace Brightline, cookie Olena зі Studio Nova) | ✅ «Лід не знайдено або він належить іншому робочому простору»; від імені Marta (Brightline) — маркера в нотатках `lead_0007` немає |
  | Дія без сесії | ✅ 307 → `/login` |
  | Журнал сервера | ✅ лише лічильники `db:*`; маркерів нотаток (`verify-…`, `foreign-…`, `xxxxxxxxxx`) — 0 входжень; `db:appendLeadNote` — 1 раз (лише валідна відправка), `db:insertAuditEntry` — 1 раз, уже в `after()` |

## Task C — `integrating-n8n-webhooks`

Тут скіл лише пакують. Застосовує його агент у прогоні **B** (Task D) — доказ спрацювання, журнал
мока й час відповіді форми — у `docs/ab-validation.md`.

Скіл: `.claude/skills/integrating-n8n-webhooks/` (коміт `82bef87`). Мова скіла — англійська (технічна
документація для агента); фрази-тригери в `description` — українською й англійською. `name` = назва
теки, `description` — 927 символів (що + «Use when …» + тригери + «Not for …»), `SKILL.md` — 141 рядок на момент коміту `82bef87` (145 після правок за рев'ю перед здачею).

```
integrating-n8n-webhooks/
├── SKILL.md                       контракт стисло, як будуємо, чекліст (11), правила зупинки, Verify
├── references/
│   ├── contract.md                повний контракт: змінні, запит, конверт, таймаут/повтори, колбек (10 кроків), ідемпотентність, журнали, ліміти, реєстр
│   ├── response-modes.md          режими Webhook, правило 100 с / 524, тестовий vs production URL, мок
│   ├── nextjs-patterns.md         шаблони Next.js 16: lib/n8n/client.ts, callback.ts, idempotency.ts, роут колбека, Server Action з after(), .env.example
│   ├── n8n-side-setup.md          налаштування n8n словами (вузол за вузлом) — для людини
│   └── security-checklist.md      секрети, журнали, відомі пастки документації й чужих скілів, troubleshooting
└── scripts/
    ├── check-contract.mjs         статична перевірка C1–C11, --root, --changed-since, --help
    ├── send-signed-callback.mjs   матриця колбеків проти живого роуту (11 випадків), --help
    └── mock-n8n.mjs               копія tools/mock-n8n.mjs (побайтово однакова, cmp)
```

- **Що лишили в `SKILL.md`, а що винесли в `references/` (і чому):** у `SKILL.md` — те, що агент має
  зробити щоразу: 4 змінні середовища, заголовки й конверт запиту, таймаут 10 с і правило повторів,
  «користувач не чекає» (`after()`, 202 + колбек), порядок обробки колбека одним списком із кодами
  відповідей, правило журналів, чекліст, правила зупинки, Verify. У `references/` — «чому» й деталі,
  які потрібні лише під час реалізації: пояснення кожного кроку колбека (чому ключ звіряють із тілом,
  чому звільняють ключ), таблиці режимів відповіді, ліміти, налаштування вузлів n8n, пастки. Шаблони
  коду — окремо (`nextjs-patterns.md`), щоб `SKILL.md` лишався коротким. Посилання з `SKILL.md` — прямі,
  один рівень; файли `references/` одне на одне не посилаються. Правила Vercel `server-auth-actions` і
  `server-after-nonblocking` — лише за id.
- **Записку не копіювали:** переписано англійською, стиснуто й перегруповано під дії агента; додано те,
  чого в записці немає, але що випливає з неї й із зауважень CodeRabbit до еталонного PR автора курсу (`koldovsky/2026-quitcode-04-agent-skills-hw`, PR #1, гілка `ws04/sample`), який ми переглянули лише як приклад формату й типових помилок — код звідти не брали: не надсилати
  `x-n8n-token` на віддалений `http:` (лише loopback), для асинхронного воркфлоу успіх — лише 202 з
  непорожнім `job_id`, не логувати цілий об'єкт помилки `fetch` (може містити URL).
- **Правила зупинки — перелік:** (1) є лише тестовий URL `/webhook-test/…` або невідомий production-шлях;
  (2) токен чи секрет потрапив би в Client Component, `NEXT_PUBLIC_`, query string, журнал, повідомлення
  про помилку, git чи чат — або довелося б побачити справжнє значення секрету; (3) користувач синхронно
  чекав би воркфлоу, довший за кілька секунд, або хтось просить підняти таймаути замість 202 + колбек;
  (4) невідомі режим відповіді, шлях події чи формат колбека, і їх не перевірити моком; (5) потрібні
  зміни в n8n клієнта, нова залежність, `runtime = "edge"` чи «тимчасово» пропустити перевірку
  підпису/часу/ідемпотентності. Без винятків «якщо задача цього потребує».
- **SHA коміту зі скілом:** `82bef87`. BASE для Task D — `4baf4e7` (коміт після Task C з цим звітом; код
  той самий; див. `docs/ab-validation.md`).
- **Що скіл змінив у собі після прогонів:** `7593db2` — `check-contract.mjs`: перевірки колбека (C4/C5/C11)
  тепер враховують усі прямі імпорти роуту (на прогоні A верифікація жила в `lib/quote-workflow.ts`, і C5
  хибно повідомляв «signature not compared with timingSafeEqual»); хешування обох значень зараховано як
  вирівнювання довжин; `===` шукається лише цілими словами (у копії B `assignedTo` з `lib/db.ts` давало хибний
  FAIL при повному скані). Результати прогонів не змінились: A — 7 FAIL, B — 0 FAIL, `main` — 6 FAIL; справжнє
  `signature !== …` перевірка ловить, як і раніше. Після рев'ю перед здачею — `b224d5e` (`--changed-since` для
  проєкту в підтеці репозиторію, C11 без хибного «64», `process.exitCode`), `47fc4f6` і `6669b1c` (шаблони
  `references/nextjs-patterns.md` узгоджено з кодом, що пройшов прогони); за рев'ю CodeRabbit на PR — `b52b76c`
  (C4 приймає потокове читання тіла) і `fa19e15` (правило ключа колбека, шаблони = код, повтори n8n vs
  застосунку); далі `4d4666f` (C11: ключ прив'язаний до підписаного тіла; порожній `--changed-since=` — код 2)
  і `bc6505a` (SSRF-запобіжник для `callbackUrl`, шаблони = посилений код). Деталі — `docs/ab-validation.md`.

**Як перевіряли сам скрипт.** На `main` — розпакована копія `git archive main` у `../leaddesk-main`
(`01a7dd4`). Для перевірок, яким на `main` нема на що дивитися (колбек-роуту ще немає), — навмисно
поганий код у тимчасовій теці поза репозиторієм (роут з `req.json()`, `!==` для підпису,
`runtime = "edge"`, `console.log(body)`; модуль без `server-only`, токен у `?token=`; `"use client"` з
`NEXT_PUBLIC_N8N_…`; `/webhook-test/`; справжній на вигляд токен у `.env.example`). Для зворотного
боку — шаблони з `references/nextjs-patterns.md`, **автоматично витягнуті з блоків коду** в копію
проєкту поза репозиторієм (плюс переведений на шаблонний клієнт виклик `lead-created`): `npm run lint`
— без попереджень, `npm run build` (з TypeScript) — успішно, `check-contract` — 11 PASS / 0 FAIL, код
виходу 0. Тимчасові теки після перевірки видалено.

**`check-contract.mjs` на коді `main`** (id + PASS/FAIL, код виходу):

```
$ node .claude/skills/integrating-n8n-webhooks/scripts/check-contract.mjs --root ../leaddesk-main; echo "exit=$?"
check-contract · root: ..\leaddesk-main · scope: all files

FAIL  C1   no /webhook-test/ URL in code or .env.example
        .env.example:6  test webhook URL in .env.example
PASS  C2   no NEXT_PUBLIC_ n8n variables; no N8N_* or lib/n8n import in a "use client" file
FAIL  C3   n8n is called only from lib/n8n/*, which starts with import "server-only"
        app/actions.ts:54  fetch to n8n outside lib/n8n/* — use the n8n client module
PASS  C4   callback route reads the raw body and parses JSON only after verifying the signature (no callback route in scope)
PASS  C5   callback signature: HMAC-SHA256, length check + timingSafeEqual, never === / !== (no callback route in scope)
FAIL  C6   every fetch to n8n has signal: AbortSignal.timeout(...)
        app/actions.ts:54  fetch to n8n without a timeout (signal: AbortSignal.timeout(10_000))
FAIL  C7   no bodies, personal data, secrets or whole error objects in console.* of n8n code
        app/actions.ts:60  console.* logs error — log ids, status, duration only
PASS  C8   no runtime = "edge"
FAIL  C9   .env.example has the contract keys; .env.local is git-ignored; used N8N_* keys are listed
        .env.example:1  missing N8N_WEBHOOK_BASE_URL
        .env.example:1  missing N8N_WEBHOOK_TOKEN
        .env.example:1  missing N8N_CALLBACK_SECRET
        .env.example:1  missing APP_BASE_URL
        .env.example:6  N8N_WEBHOOK_URL is not a contract key (N8N_WEBHOOK_BASE_URL, N8N_WEBHOOK_TOKEN, N8N_CALLBACK_SECRET)
FAIL  C10  every fetch to n8n sends x-n8n-token and idempotency-key; no secrets in the URL
        app/actions.ts:54  fetch to n8n without x-n8n-token and idempotency-key
PASS  C11  callback route: 415 content-type, 413 64 KB, 401 x-n8n-timestamp ±300 s, idempotency-key (no callback route in scope)

5 PASS, 6 FAIL
exit=1
```

Код гілки після Task A–C дає той самий результат (виклик n8n і `.env.example` свідомо не чіпали).
`--help` → код 0; невідомий прапорець або `--changed-since` на неіснуючий ref → код 2.

**Що скрипт побачив на навмисно поганому коді** — спрацювали всі 11 перевірок:

```
$ node .claude/skills/integrating-n8n-webhooks/scripts/check-contract.mjs --root ../ws04-work/bad-fixture; echo "exit=$?"
FAIL  C1   no /webhook-test/ URL in code or .env.example
        app/quotes/actions.ts:3  test webhook URL — use the production /webhook/<path>
FAIL  C2   no NEXT_PUBLIC_ n8n variables; no N8N_* or lib/n8n import in a "use client" file
        components/quote-button.tsx:5  NEXT_PUBLIC_N8N_WEBHOOK_URL would be inlined into the client bundle
        components/quote-button.tsx:2  Client Component imports lib/n8n
FAIL  C3   n8n is called only from lib/n8n/*, which starts with import "server-only"
        app/quotes/actions.ts:3  fetch to n8n outside lib/n8n/* — use the n8n client module
        lib/n8n/client.ts:1  first statement must be import "server-only"
FAIL  C4   callback route reads the raw body and parses JSON only after verifying the signature
        app/api/n8n/[event]/route.ts:6  req.json() — read the raw text first; re-serialising breaks the signature
        app/api/n8n/[event]/route.ts:1  raw body is never read (req.text())
FAIL  C5   callback signature: HMAC-SHA256, length check + timingSafeEqual, never === / !==
        app/api/n8n/[event]/route.ts:1  signature not compared with crypto.timingSafeEqual
        app/api/n8n/[event]/route.ts:10  signature compared with !== — use timingSafeEqual
FAIL  C6   every fetch to n8n has signal: AbortSignal.timeout(...)
        app/quotes/actions.ts:3  fetch to n8n without a timeout (signal: AbortSignal.timeout(10_000))
        lib/n8n/client.ts:4  fetch to n8n without a timeout (signal: AbortSignal.timeout(10_000))
FAIL  C7   no bodies, personal data, secrets or whole error objects in console.* of n8n code
        app/api/n8n/[event]/route.ts:11  console.* logs body — log ids, status, duration only
        app/quotes/actions.ts:4  console.* logs formData.get("email") — log ids, status, duration only
FAIL  C8   no runtime = "edge"
        app/api/n8n/[event]/route.ts:3  edge runtime — the contract needs node:crypto
FAIL  C9   .env.example has the contract keys; .env.local is git-ignored; used N8N_* keys are listed
        .env.example:1  missing APP_BASE_URL
        .env.example:1  N8N_WEBHOOK_BASE_URL must be a local URL ending with /webhook
        .env.example:2  N8N_WEBHOOK_TOKEN must be a change-me-… placeholder
        .gitignore:1  .env.local is not git-ignored (.env* or .env.local)
FAIL  C10  every fetch to n8n sends x-n8n-token and idempotency-key; no secrets in the URL
        app/quotes/actions.ts:3  fetch to n8n without x-n8n-token and idempotency-key
        lib/n8n/client.ts:4  fetch to n8n without idempotency-key
        lib/n8n/client.ts:4  secret in the webhook URL — send it in a header
FAIL  C11  callback route: 415 content-type, 413 64 KB, 401 x-n8n-timestamp ±300 s, idempotency-key
        app/api/n8n/[event]/route.ts:1  no 415 for a non-JSON content-type
        app/api/n8n/[event]/route.ts:1  no 413 for bodies over 64 KB
        app/api/n8n/[event]/route.ts:1  x-n8n-timestamp is not checked
        app/api/n8n/[event]/route.ts:1  idempotency-key is not used to drop repeated callbacks

0 PASS, 11 FAIL
exit=1
```

Під час цієї перевірки знайшли й виправили помилку самого скрипта: змінна `headers`, винесена з
виклику `fetch`, не розкривалась (ім'я стояло в списку виключень), і C10 хибно повідомляв «без
x-n8n-token». Після виправлення — «without idempotency-key», як і має бути.

**`--changed-since`** — окремий git-репозиторій з коду `main` (коміт `start`, тег `base`), далі
додано `lib/n8n/client.ts` з порушеннями, рядок із токеном у `.env.example` і змінено один рядок
`app/actions.ts` поза викликом n8n. Старі порушення не показано, нові — так:

Скорочено й стиснуто: лише рядки FAIL, кілька знахідок одного файлу — через «·».

```
check-contract · root: ..\ws04-work\changed-fixture · scope: changed since base (2 changed + 1 untracked files)
FAIL  C3   lib/n8n/client.ts:1  first statement must be import "server-only"
FAIL  C6   lib/n8n/client.ts:2  fetch to n8n without a timeout (signal: AbortSignal.timeout(10_000))
FAIL  C9   .env.example:1  missing N8N_WEBHOOK_BASE_URL · missing N8N_CALLBACK_SECRET · missing APP_BASE_URL
           .env.example:7  N8N_WEBHOOK_TOKEN must be a change-me-… placeholder
           lib/n8n/client.ts:2  N8N_WEBHOOK_BASE_URL is used but not listed in .env.example
FAIL  C10  lib/n8n/client.ts:2  fetch to n8n without idempotency-key
7 PASS, 4 FAIL · 6 finding(s) outside the changed lines not shown
```

(скорочено до рядків FAIL; `app/actions.ts:54` і `.env.example:6` з базової лінії — серед 6 прихованих).

**Матриця колбеків (`send-signed-callback.mjs`)** проти шаблонного роуту в копії проєкту
(`next start -p 3002`; мок `--port 5679 --mode respond-202`, бо порт 5678 на цій машині зайнятий
Docker Desktop):

| Випадок | Очікуваний код | Отриманий |
|---|---|---|
| valid | 202 | 202 ✅ |
| duplicate (той самий `idempotency-key`) | 200 `{"duplicate":true}` | 200 ✅ |
| bad-signature | 401 | 401 ✅ |
| missing-signature | 401 | 401 ✅ |
| stale-timestamp (−301 с на момент цього прогону; тепер −310 с) | 401 | 401 ✅ |
| future-timestamp (+301 с на момент цього прогону; тепер +310 с) | 401 | 401 ✅ |
| reformatted-body (тіло переформатовано після підпису) | 401 | 401 ✅ |
| wrong-content-type (`text/plain`) | 415 | 415 ✅ |
| unknown-event | 404 | 404 ✅ |
| key-mismatch (ключ ≠ `jobId:event` тіла) | 400 | 400 ✅ |
| oversized (> 64 КБ) | 413 | 413 ✅ |

11 PASS, код виходу 0. З чужим секретом (`N8N_CALLBACK_SECRET=not-the-app-secret`) `valid` і
`duplicate` отримують 401 → FAIL, код виходу 1 — матриця бачить поломку. Невідоме ім'я в `--only` або
порожній `--only` → помилка використання, код 2. Там же (у тимчасовій копії з шаблонів, не код гілки) форма заявки (відправка без JS) → мок:
`POST /webhook/lead-created -> 202 … auth=ok idempotency=new`, тіло 85 Б (лише `leadId` і `source`);
у журналі сервера `[n8n] lead-created -> 202 in 169 ms (attempt 1, correlation …)`, email і текст
заявки — 0 входжень.

**`check-contract.mjs` на фінальному коді** (HEAD гілки після перенесення прогону B, доведення й виправлень за рев'ю):

```
$ node .claude/skills/integrating-n8n-webhooks/scripts/check-contract.mjs; echo "exit=$?"
check-contract · root: …\2026-quitcode-04-agent-skills-hw · scope: all files

PASS  C1   no /webhook-test/ URL in code or .env.example
PASS  C2   no NEXT_PUBLIC_ n8n variables; no N8N_* or lib/n8n import in a "use client" file
PASS  C3   n8n is called only from lib/n8n/*, which starts with import "server-only"
PASS  C4   callback route reads the raw body and parses JSON only after verifying the signature
PASS  C5   callback signature: HMAC-SHA256, length check + timingSafeEqual, never === / !==
PASS  C6   every fetch to n8n has signal: AbortSignal.timeout(...)
PASS  C7   no bodies, personal data, secrets or whole error objects in console.* of n8n code
PASS  C8   no runtime = "edge"
PASS  C9   .env.example has the contract keys; .env.local is git-ignored; used N8N_* keys are listed
PASS  C10  every fetch to n8n sends x-n8n-token and idempotency-key; no secrets in the URL
PASS  C11  callback route: 415 content-type, 413 64 KB, 401 x-n8n-timestamp ±300 s, idempotency-key

11 PASS, 0 FAIL
exit=0
```
