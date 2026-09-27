# A/B-перевірка скіла `integrating-n8n-webhooks` (Task D)

- **Інструмент і версія:** Claude Code 2.1.280, десктоп-застосунок (вкладка Code), Windows 10 Pro
- **Модель і рівень міркування (effort), однакові в обох прогонах:** Opus 5.5 (`claude-opus-5-5[1m]`) · High
- **Код:** BASE = `4baf4e7` (коміт після Task C: виправлення Task A, форма нотаток з Task B, три скіли; ще
  без `/quotes` і без змін у виклику n8n) · скіл `integrating-n8n-webhooks` для копії B — з `4baf4e7`
  (скіл закомічено в `82bef87`, далі до прогонів не змінювався)
- **Копії:** `../leaddesk-ab-a` (без жодного скіла), `../leaddesk-ab-b` (лише `integrating-n8n-webhooks`);
  у кожній — власний `git init`, коміт `start` з тегом `base`, `npm install` з `package-lock.json`
  (після встановлення `git status` — 0 змін)
- **Що видалено з обох копій:** `tools/`, `materials/`, `docs/`, `README.md`, `.coderabbit.yaml`, `.github/`
  і `.claude/skills` (у B повернуто лише `integrating-n8n-webhooks` — `git archive HEAD .claude/skills/integrating-n8n-webhooks`).
  Перевірено:
  - `find ../leaddesk-ab-a ../leaddesk-ab-b -name SKILL.md -not -path "*/node_modules/*"` → рівно один рядок,
    `../leaddesk-ab-b/.claude/skills/integrating-n8n-webhooks/SKILL.md`;
  - `ls -A … | grep -xE 'tools|materials|docs|README.md|.coderabbit.yaml|.github'` → «no hints - ok»;
  - `grep -rlE "x-n8n-token|timingSafeEqual|idempotency-key" ../leaddesk-ab-a --exclude-dir=node_modules` →
    «no contract - ok» (у коді BASE контракту немає: виклик `lead-created` до Task D не чіпали);
  - `git ls-files` копій відрізняється рівно 9 файлами скіла.
- **Особисті копії скіла:** копій проєктних скілів немає ніде. `~/.claude/skills` до 14:28 не існувало; о
  14:28–14:33 (до прогонів, A почався о 14:43) десктоп-застосунок створив `~/.claude/skills/synced/<uuid>/` зі
  скілами синхронізації облікового запису claude.ai: `docs`, `import-memory`, `morning`, `pdf`, `skill-creator`
  (і `docx`, `pptx`, `xlsx` у `.staging/`). Перевірка:
  `find ~/.claude/skills -name SKILL.md -exec grep -l -iE "^name: *(integrating-n8n|building-client|vercel)" {} +` →
  порожньо. Під час підготовки копій ця тека помилково записана як «порожня»: пошук ішов з `-maxdepth 3`, а
  скіли лежать глибше — виправлено після рев'ю. `~/.agents/skills` і `~/.codex/skills` мають сторонні скіли
  (`handoff`, `n8n-rag-workflows`, `stop-slop`), але Claude Code ці теки не читає — `/context` їх не показує.
- **Обмеження, майже однакове для обох:** саме ці синхронізовані скіли `/context` показує з джерелом
  «claude.ai sync» (`anthropic-skills:docs`, `pdf`, `skill-creator`, `morning`, `import-memory`; у знімку A ще
  `xlsx`, `pptx`, `docx` — синхронізація ще тривала). Вони приходять з облікового запису, не з проєкту,
  стосуються документів, а не n8n чи форм, і в жодному прогоні не викликались.
- **Запит:** текст між лініями з `materials/ab-task.md` без змін, нова сесія на кожен прогін
- **Відповідь на уточнення:** агент не питав в обох прогонах (запити дозволів на читання файлів копії, `lint`,
  `build`, запуск перевірок — дозволено однаково в обох). Поза теку копії жоден агент не просився.
- **Мок, однаковий для обох** (з робочого репозиторію, термінал у теці копії; так налаштований n8n клієнта —
  Header Auth, 202, підписаний колбек):
  `node --env-file=.env.local ../2026-quitcode-04-agent-skills-hw/tools/mock-n8n.mjs --mode respond-202 --delay 5000`
  без `--callback-url`: обидва агенти передають `callbackUrl` у тілі.
- **`.env.local` копій:** змінні, які додав агент, зі значеннями для мока (URL вебхука — production
  `/webhook/<event>`, адреса застосунку — `http://127.0.0.1:3000`), плюс `N8N_WEBHOOK_TOKEN` і
  `N8N_CALLBACK_SECRET` для мока (той самий секрет, що в змінній агента). Секрети згенеровано скриптом, який
  значень не друкує; файли не відкривали.
- **Базова лінія `check-contract.mjs` на копії до прогону** (увесь код, без `--changed-since`), однакова для A і
  B: **5 PASS, 6 FAIL** — C1 (`.env.example:6` `/webhook-test/`), C3/C6/C10 (`app/actions.ts:54` — `fetch` поза
  `lib/n8n`, без таймауту, без `x-n8n-token`/`idempotency-key`), C7 (`app/actions.ts:60` — цілий об'єкт помилки
  в журналі), C9 (ключі контракту в `.env.example`). Це старий код, в оцінку прогонів він не йде.
- **Версія перевірки:** обидва прогони оцінено тією самою версією `check-contract.mjs` після виправлення,
  знайденого на прогоні A (`7593db2`, див. нижче); до й після виправлення кількість FAIL не змінилась.

## A — без скіла

- **Які скіли бачив агент** (окремий запуск `MSYS_NO_PATHCONV=1 claude -p "/context"` у теці копії): жодного
  проєктного; лише Built-in і «claude.ai sync».
- **Час роботи:** 14:43–14:53 (10 хв).
- **Що зробив агент:** форма `/quotes/new` з валідацією (введене зберігається), Server Action створює запит
  `pending` і **синхронно** (з таймаутом 10 с) викликає вебхук, потім `redirect` на `/quotes/<id>`; при
  помилці — `failed`. Колбек — `app/api/quotes/[id]/callback/route.ts`, авторизація
  `Authorization: Bearer <N8N_CALLBACK_SECRET>` (порівняння через `timingSafeEqual` хешів), тіло
  `{status:"ready", pdfUrl}` через `request.json()`. Сторінка статусу оновлюється кожні 5 с, після 5 хв
  пише «довше, ніж зазвичай».
- **Звідки агент узяв домовленості:** загальні знання й наявний код. Сам сказав, що вивчив «форму лідів,
  `lib/db.ts` та патерни Server Actions» і документацію Next 16 у `node_modules` (route handlers, `after()`,
  `redirect`). З наявного коду — схема змінної: у `.env.example` був `N8N_WEBHOOK_URL=…/webhook-test/lead-created`,
  і агент додав поруч `N8N_QUOTE_WEBHOOK_URL=…/webhook-test/quote-request`. `after()` для аудиту в BASE вже
  був — у формі нотаток з Task B (`app/dashboard/leads/[id]/actions.ts`: `after(() => logAudit(…))`), тож
  його агент, найімовірніше, узяв з наявного коду або з документації Next у `node_modules` (журнал сесії цього
  не розрізняє). З загальних знань — таймаут 10 с, `timingSafeEqual` для токена, «не будувати URL колбека з
  `Host`», «Respond: Immediately» в n8n.
  Рішень команди (HMAC-підпис колбека, `x-n8n-token`, `idempotency-key`, 202 + `job_id`, імена змінних,
  production URL) взяти не було звідки.
- **Запитання агента і фінальна відповідь (скорочено):** запитань не було. «Додав `/quotes/new`, Server Action,
  що запускає `quote-request`, callback-ендпоінт для n8n і сторінку статусу… Callback-ендпоінт приймає `POST`
  із заголовком `Authorization: Bearer <N8N_CALLBACK_SECRET>`… Що потрібно від вас: додати в `.env.local`
  `N8N_QUOTE_WEBHOOK_URL`, `N8N_CALLBACK_SECRET`, `APP_URL`; у Webhook-вузлі обрати Respond: Immediately…
  Виклик вебхука n8n, як і наявний вебхук для лідів, іде без автентифікації.»
- **Змінені файли** (`git diff --cached --stat base` у копії після `git add -A`; діф: [`docs/ab/a-without-skill.diff`](ab/a-without-skill.diff)):
  ```
   .env.example                          |   9 +++
   app/api/quotes/[id]/callback/route.ts |  74 ++++++++++++++++++++++++
   app/quotes/[id]/page.tsx              | 103 ++++++++++++++++++++++++++++++++++
   app/quotes/new/actions.ts             |  29 ++++++++++
   app/quotes/new/page.tsx               |  30 ++++++++++
   components/quote-form.tsx             |  86 ++++++++++++++++++++++++++++
   components/quote-status-poller.tsx    |  17 ++++++
   lib/db.ts                             |  54 +++++++++++++++++-
   lib/quote-form.ts                     |  79 ++++++++++++++++++++++++++
   lib/quote-workflow.ts                 |  59 +++++++++++++++++++
   lib/types.ts                          |  26 +++++++++
   11 files changed, 565 insertions(+), 1 deletion(-)
  ```
- **Змінні середовища, які додав агент:** `N8N_QUOTE_WEBHOOK_URL` (у `.env.example` — `/webhook-test/`),
  `N8N_CALLBACK_SECRET` (порожнє значення), `APP_URL`.
- **`check-contract.mjs --root ../leaddesk-ab-a --changed-since base`** — лише код прогону:
  ```
  check-contract · root: ..\leaddesk-ab-a · scope: changed since base (11 changed + 0 untracked files)

  FAIL  C1   no /webhook-test/ URL in code or .env.example
          .env.example:10  test webhook URL in .env.example
  PASS  C2   no NEXT_PUBLIC_ n8n variables; no N8N_* or lib/n8n import in a "use client" file
  FAIL  C3   n8n is called only from lib/n8n/*, which starts with import "server-only"
          lib/quote-workflow.ts:28  fetch to n8n outside lib/n8n/* — use the n8n client module
  FAIL  C4   callback route reads the raw body and parses JSON only after verifying the signature
          app/api/quotes/[id]/callback/route.ts:26  request.json() — read the raw text first; re-serialising breaks the signature
          app/api/quotes/[id]/callback/route.ts:1  raw body is never read (request.text() or a streaming reader)
  FAIL  C5   callback signature: HMAC-SHA256, length check + timingSafeEqual, never === / !==
          app/api/quotes/[id]/callback/route.ts:1  no HMAC-SHA256 over the raw body
  PASS  C6   every fetch to n8n has signal: AbortSignal.timeout(...)
  PASS  C7   no bodies, personal data, secrets or whole error objects in console.* of n8n code
  PASS  C8   no runtime = "edge"
  FAIL  C9   .env.example has the contract keys; .env.local is git-ignored; used N8N_* keys are listed
          .env.example:1  missing N8N_WEBHOOK_BASE_URL
          .env.example:1  missing N8N_WEBHOOK_TOKEN
          .env.example:1  missing APP_BASE_URL
          .env.example:10  N8N_QUOTE_WEBHOOK_URL is not a contract key (N8N_WEBHOOK_BASE_URL, N8N_WEBHOOK_TOKEN, N8N_CALLBACK_SECRET)
          .env.example:13  N8N_CALLBACK_SECRET must be a change-me-… placeholder
  FAIL  C10  every fetch to n8n sends x-n8n-token and idempotency-key; no secrets in the URL
          lib/quote-workflow.ts:28  fetch to n8n without x-n8n-token and idempotency-key
  FAIL  C11  callback route: 415 content-type, 413 64 KB, 401 x-n8n-timestamp ±300 s, idempotency-key
          app/api/quotes/[id]/callback/route.ts:1  no 415 for a non-JSON content-type
          app/api/quotes/[id]/callback/route.ts:1  no 413 for bodies over 64 KB
          app/api/quotes/[id]/callback/route.ts:1  x-n8n-timestamp is not checked
          app/api/quotes/[id]/callback/route.ts:1  idempotency-key is not used to drop repeated callbacks

  4 PASS, 7 FAIL · 6 finding(s) outside the changed lines not shown
  exit=1
  ```
- **Журнал мока** (форма → колбек → `/quotes/<id>`):
  ```
  POST /webhook/quote-request -> 403 in 1 ms auth=missing | headers: accept,accept-language,content-type,user-agent | body 317 B sha256=d7be6151…
  ```
  Поле `idempotency=` у цьому рядку відсутнє, бо мок друкує його лише після успішного Header Auth; у списку імен
  заголовків `idempotency-key` немає, а в додатковому прогоні нижче мок прямо пише `idempotency=absent`.
  Далі нічого: на 403 «воркфлоу» не запускається, колбека немає. URL — `/webhook/` (у `.env.local` копії
  поставили production-адресу; у `.env.example` агента — `/webhook-test/`, з яким мок, як і n8n, відповів би
  404 без `--listen`).
- **Додатково (поза основним сценарієм):** той самий мок **без** Header Auth (`N8N_WEBHOOK_TOKEN=` порожній) —
  чи прийме застосунок підписаний колбек:
  ```
  POST /webhook/quote-request -> 202 in 8 ms auth=none idempotency=absent | headers: accept,accept-language,content-type,user-agent | body 317 B
  workflow 5337df1e-… running for 5000 ms, then callback event=quote-request.completed
  callback POST http://127.0.0.1:3000/api/quotes/quote_7fb380d2-…/callback -> 401 in 87 ms (try 1/3) event=quote-request.completed body 314 B
  ```
  Колбек n8n за контрактом (HMAC у `x-n8n-signature`) застосунок A відхиляє з 401 — він чекає
  `Authorization: Bearer`. Сторінка лишається на «Готуємо кошторис…».
- **Час від «Надіслати» до відповіді форми:** 322 мс (у додатковому прогоні — 163 мс). Як міряли (однаково для
  A і B): скрипт поза репозиторієм (`../ws04-work/submit-quote.mjs`) бере приховані поля Server Action з
  відрендереного `<form>` на `/quotes/new` і надсилає форму як звичайний HTML POST (без JS); час — від запиту до
  відповіді `303` з `location: /quotes/<id>`. Мок тут відповідав миттєво (403 за 1 мс), тож 322 мс ще нічого не
  кажуть про очікування n8n. **Дозамір з повільним n8n** (мок `--mode last-node --delay 2000`, без Header Auth,
  щоб запит не відхилявся одразу; порти 3100/5679): `POST /quotes/new -> 303 in 2289 ms`, мок —
  `POST /webhook/quote-request -> 200 in 2013 ms` — форма A чекає n8n у самій дії (до 10 с таймауту).
- **Що показала `/quotes/<id>`:** «Не вдалося підготувати кошторис» (запуск відхилено 403); у додатковому
  прогоні — «Готуємо кошторис…» назавжди.
- **Журнал сервера:** `Failed to start quote-request workflow for quote_c1af3d85-…: n8n responded with HTTP 403`.
  Тіл запитів, email, телефонів, токенів, підписів немає (пошук назви компанії, email і тексту опису — 0).

## B — зі скілом

- **Які скіли бачив агент** (окремий запуск `/context` у теці копії): `integrating-n8n-webhooks` (Project, ~320
  токенів) + Built-in і «claude.ai sync».
- **Час роботи:** 15:02–15:15 (13 хв).
- **Чи викликав агент скіл:** так, сам, першим кроком — у стрічці інструментів «Ran skill/integrating-n8n-webhooks»,
  «Launching skill: integrating-n8n-webhooks»; далі «Read contract and Next.js patterns references», «Read
  remaining skill references». Агент також запускав скрипти скіла: `check-contract.mjs` («11 з 11 пройшли»),
  `send-signed-callback.mjs` («11 з 11») і мок скіла `scripts/mock-n8n.mjs` зі значеннями-заглушками з
  `.env.example` (копія мока — частина скіла, не витік).
- **Що зробив агент:** `lib/n8n/client.ts`, `callback.ts`, `idempotency.ts` за шаблонами скіла; Server Action
  зберігає запит `queued`, одразу `redirect`, виклик n8n (202 + `job_id`, таймаут, повтори, той самий
  `idempotency-key`) — в `after()`; колбек `app/api/n8n/[event]/route.ts` з сирим тілом, HMAC +
  `timingSafeEqual`, вікном 300 с, ідемпотентністю; тільки `https://` для посилання на PDF; сторінка статусу
  оновлюється кожні 3 с; 4 ключі контракту в `.env.example`; реєстр `docs/n8n-integrations.md`.
- **Запитання агента і фінальна відповідь (скорочено):** запитань під час роботи не було. У фінальній відповіді —
  **зупинка за правилом скіла**: «Перевірка контракту по всьому репозиторію ще показує 6 порушень. Усі вони в
  старому коді… `submitLead` (`app/actions.ts:54`) та рядок `N8N_WEBHOOK_URL` у `.env.example`… Я це не чіпав.
  Правильна адреса для `lead-created` мені невідома, а якщо урізати дані, можна зламати воркфлоу клієнта.
  Перевести його на нового клієнта з мінімальними даними, щойно ви підтвердите робочу адресу
  `/webhook/lead-created` і які поля потрібні воркфлоу?» А також: «Я виходив з того, що воркфлоу одразу
  відповідає `202 {"job_id": …}`… як насправді налаштований воркфлоу клієнта, я не бачив» — і посилання на
  `n8n-side-setup.md` для людини.
- **Змінені файли** (`git diff --cached --stat base` у копії після `git add -A`; діф: [`docs/ab/b-with-skill.diff`](ab/b-with-skill.diff)):
  ```
   .env.example                        |  11 ++++
   app/api/n8n/[event]/route.ts        |  95 +++++++++++++++++++++++++++++++
   app/quotes/[id]/page.tsx            |  94 ++++++++++++++++++++++++++++++
   app/quotes/actions.ts               |  47 +++++++++++++++
   app/quotes/new/page.tsx             |  35 ++++++++++++
   components/quote-form.tsx           |  87 ++++++++++++++++++++++++++++
   components/quote-status-refresh.tsx |  31 ++++++++++
   docs/n8n-integrations.md            |  22 ++++++++
   lib/db.ts                           |  84 ++++++++++++++++++++++++++-
   lib/n8n/callback.ts                 |  27 +++++++++
   lib/n8n/client.ts                   | 110 ++++++++++++++++++++++++++++++++++++
   lib/n8n/idempotency.ts              |  17 ++++++
   lib/quote-form.ts                   |  62 ++++++++++++++++++++
   lib/types.ts                        |  32 +++++++++++
   14 files changed, 753 insertions(+), 1 deletion(-)
  ```
- **Змінні середовища, які додав агент:** `N8N_WEBHOOK_BASE_URL`, `N8N_WEBHOOK_TOKEN`, `N8N_CALLBACK_SECRET`,
  `APP_BASE_URL` (секрети — `change-me-…`, адреси локальні, `/webhook`).
- **`check-contract.mjs --root ../leaddesk-ab-b --changed-since base`** — лише код прогону:
  ```
  check-contract · root: ..\leaddesk-ab-b · scope: changed since base (14 changed + 0 untracked files)

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

  11 PASS, 0 FAIL · 6 finding(s) outside the changed lines not shown
  exit=0
  ```
  6 прихованих — старий код базової лінії (`app/actions.ts:54/60`, `.env.example:17`), саме те, про що агент спитав.
- **Журнал мока** (форма → колбек → `/quotes/<id>`):
  ```
  POST /webhook/quote-request -> 202 in 4 ms auth=ok idempotency=new | headers: accept,accept-language,cache-control,content-type,idempotency-key,pragma,user-agent,x-correlation-id,x-n8n-token | body 317 B sha256=9b953178…
  workflow d7555b48-ffec-482f-9dc9-b27c1bc30a26 running for 5000 ms, then callback event=quote-request.completed
  callback POST http://127.0.0.1:3000/api/n8n/quote-request -> 202 in 152 ms (try 1/3) event=quote-request.completed body 382 B sha256=bd6ed6a9…
  ```
- **Час від «Надіслати» до відповіді форми:** 151 мс (`POST /quotes/new` → 303; спосіб — як у A). Перша
  відправка з порожнім бюджетом — 200 з помилкою валідації (бюджет у B — обов'язкове число 100–1 000 000 $), як і
  має бути. **Дозамір з повільним n8n** (мок `--mode last-node --delay 2000` з Header Auth, ті самі порти):
  `POST /quotes/new -> 303 in 195 ms`, а мок отримав виклик і відповів за `2008 ms` уже після відповіді
  користувачу (`auth=ok idempotency=new`) — форма B n8n не чекає.
- **Що показала `/quotes/<id>`:** через ~5 с — «Готово» і посилання
  `https://files.example.test/n8n/d7555b48-ffec-482f-9dc9-b27c1bc30a26.pdf` (той самий `jobId`, що в журналі мока).
- **Матриця колбеків** проти роуту B на справжньому `job_id` (мок `--delay 60000`, щоб запит був у `processing`):
  valid 202, duplicate 200, bad-signature 401, missing-signature 401, stale-timestamp 401, future-timestamp 401,
  reformatted-body 401, wrong-content-type 415, unknown-event 404, key-mismatch 400, oversized 413 — **11 PASS**, exit 0.
- **Журнал сервера:**
  ```
  [n8n] quote-request -> 202 in 31 ms (attempt 1, correlation 280553bf-…)
  [n8n] callback quote-request completed accepted (correlation 280553bf-…)
  ```
  Тіл, email, телефонів, токенів, підписів немає (назва компанії, email, текст опису, `sha256=` — 0 входжень).

## Порівняння

| Що дивимось | A — без скіла | B — зі скілом |
|---|---|---|
| Скіл викликано | — | так, сам, першим кроком; читав `references/`, запускав `scripts/` |
| `check-contract.mjs --changed-since base`: FAIL (id) | **7 FAIL**: C1, C3, C4, C5, C9, C10, C11 | **0 FAIL** |
| URL вебхука: `/webhook/` чи `/webhook-test/` | `/webhook-test/` у `.env.example` | `/webhook` (база) + `/quote-request` |
| `auth=` / `idempotency=` у журналі мока | `auth=missing` → 403 (без Header Auth: `idempotency=absent`) | `auth=ok idempotency=new` |
| Колбек дійшов; код відповіді застосунку | ні (403 на запуску); у додатковому прогоні без Header Auth — дійшов і отримав 401 (застосунок чекає Bearer, не HMAC) | так, 202 |
| `/quotes/<id>` | «Не вдалося підготувати кошторис» | «Готово» + посилання на PDF |
| Час відповіді форми (мок миттєвий / n8n відповідає через 2 с) | 322 мс / **2289 мс** — чекає n8n у дії | 151 мс / **195 мс** — n8n в `after()` |
| Тіла чи персональні дані в журналі сервера | немає | немає |
| Змінних середовища | 3 власні (`N8N_QUOTE_WEBHOOK_URL`, `N8N_CALLBACK_SECRET`, `APP_URL`) | 4 з контракту |
| Змінених файлів | 11 (+565) | 14 (+753), зокрема `docs/n8n-integrations.md` |
| Запитання агента | немає | немає під час роботи; у фіналі — зупинка щодо старого `lead-created` |
| Час роботи агента | 10 хв | 13 хв |

## Перенесення прогону B у гілку (фіча)

- **Як переносили:** `git apply --check docs/ab/b-with-skill.diff` → `git apply --3way docs/ab/b-with-skill.diff`
  у робочій гілці на коді BASE (+ документація й виправлення скіла після BASE; конфліктів немає). Діфи — коміт
  `89b1bc6`; перенесений результат B **без змін** — коміт `4875ac5`. `.env.local` і `node_modules` не переносили;
  нових залежностей B не додавав (`package.json` у діфі немає).
- **Що довелось доробити руками (і чому скіл цього не дав):** лише старий код, який агент B свідомо не
  чіпав і про який спитав (правило зупинки «невідомий production-шлях»):
  - `f6ecfd4` — `submitLead` (`app/actions.ts`): виклик `lead-created` через `lib/n8n/client.ts` в `after()`
    разом з аудитом; production-шлях `/webhook/lead-created` (за контрактом ім'я події = шлях); у n8n іде
    лід без IP, user agent, сирих даних форми й нотаток; у журналі більше немає цілого об'єкта помилки.
    Закрило C3, C6, C7, C10.
  - `ec84492` — `.env.example`: прибрано рядок `N8N_WEBHOOK_URL=…/webhook-test/lead-created`; у
    `docs/n8n-integrations.md` — рядок і примітки для `lead-created`. Закрило C1, C9.
  - Сам новий код прогону B до контракту доробок не потребував (його `check-contract --changed-since base` — 0 FAIL);
    зміни в ньому зроблено пізніше, під час рев'ю перед здачею (див. нижче).
  - `ab77078` — косметика: коментар у `.env.example`, який додав агент B, більше не містить рядка тестового URL.
- **Ключі контракту в `.env.example`:** `N8N_WEBHOOK_BASE_URL=http://127.0.0.1:5678/webhook`,
  `N8N_WEBHOOK_TOKEN=change-me-webhook-token`, `N8N_CALLBACK_SECRET=change-me-callback-secret`,
  `APP_BASE_URL=http://127.0.0.1:3000`; тестового URL немає (і в коментарях теж). У `.env.local` ті самі ключі
  додала людина скриптом `update-env-local.mjs` (поза репозиторієм; генерує секрети, друкує лише назви ключів).
- **`npm run lint`, `npm run build` на гілці:** без помилок і попереджень.
- **`check-contract.mjs` на фінальному коді (HEAD):** 11 PASS, 0 FAIL, exit 0 (повний вивід — `docs/verification.md`).
- **Сценарій «форма → колбек → `/quotes/<id>`» ще раз, уже на гілці** — одразу після доведення (`ec84492`;
  `npm run build && npm start`, `node --env-file=.env.local tools/mock-n8n.mjs --mode respond-202 --delay 5000`):
  ```
  POST /quotes/new -> HTTP 303 in 187 ms, location: /quotes/q_63a2dbf6-…
  [mock] POST /webhook/quote-request -> 202 in 4 ms auth=ok idempotency=new | headers: …,idempotency-key,…,x-correlation-id,x-n8n-token | body 317 B
  [mock] workflow e014e9e2-0356-4c31-ba6c-99037688576d running for 5000 ms, then callback event=quote-request.completed
  [mock] callback POST http://127.0.0.1:3000/api/n8n/quote-request -> 202 in 138 ms (try 1/3)
  lead form: HTTP 200 in 243 ms | thank-you shown: yes
  [mock] POST /webhook/lead-created -> 202 in 1 ms auth=ok idempotency=new | headers: …,idempotency-key,…,x-correlation-id,x-n8n-token | body 325 B
  [server] [n8n] quote-request -> 202 in 35 ms (attempt 1, correlation 47c50132-…)
  [server] [n8n] callback quote-request completed accepted (correlation 47c50132-…)
  [server] [n8n] lead-created -> 202 in 7 ms (attempt 1, correlation 735dc9c4-…)
  ```
  `/quotes/q_63a2dbf6-…` — «Готово» і посилання на `…/e014e9e2-0356-4c31-ba6c-99037688576d.pdf`. Персональних
  даних у журналі сервера — 0 входжень.
- **Реєстр інтеграцій:** `docs/n8n-integrations.md` — `quote-request` (створив агент B) і `lead-created`
  (доповнено під час доведення).

### Після рев'ю перед здачею

Перед пушем гілку перевірили два незалежні агенти-рецензенти (відповідність умовам і технічне рев'ю). Їхні
знахідки перевірено вручну; виправлено окремими комітами:

| Коміт | Що | Звідки |
|---|---|---|
| `36da9a9` | колбек: 413 за `content-length` ще до читання тіла (розмір перевіряється й після) | `req.text()` буферизував будь-яке тіло |
| `f256595` | форма кошторису: `label htmlFor`, `aria-describedby` на помилку, підсумок `role="alert"`; нормалізація CRLF перед підрахунком довжини | правило 5 нашого ж `building-client-form` |
| `8465ded` | клієнт n8n: `redirect: "manual"` — `x-n8n-token` не йде за редиректом на інший хост | під час редиректу fetch передає власні заголовки далі |
| `61de794` | `lead-created`: аудит — окремий `after()`, не чекає повторів n8n | аудит міг чекати до ~34 с |
| `b468334` | `fix(server-auth-actions)`: `updateLeadStatus`/`deleteLead` перевіряють сесію, належність ліда до workspace і значення статусу | знахідка рев'ю Task A, старий код у файлі, який змінює цей PR |
| `aec8887` | сторінка статусу перестає опитувати через 15 хв без колбека | безкінечний `router.refresh()` |

Перевірено на гілці (порти 3100/5679, бо 3000 і 5678 зайняті іншими застосунками на цій машині): сценарій
форма → `POST /webhook/quote-request -> 202 auth=ok idempotency=new` → колбек 202 → «Готово»; порожня
відправка — `role="alert"` «Перевірте 4 поля», `aria-describedby="quote-company-error"`; матриця колбеків на
справжньому `job_id` — 11/11 (зокрема `oversized` → 413); прямий виклик Server Action `updateLeadStatus` з
чужим лідом (`lead_0007`, workspace Brightline) від Olena → `forbidden`, статус ліда не змінився; без cookie →
307 на `/login`; свій лід → `ok`; статус `hacked` → `forbidden`. У журналі сервера — 0 входжень персональних даних.

### Рев'ю CodeRabbit на PR

Підсумкові перевірки CodeRabbit — 11/11 ✅ (зокрема Task A–E, ім'я в PR, захищені шляхи й секрети). Його
8 зауважень до рядків коду перевірено вручну й виправлено окремими комітами:

| Коміт | Що | Зауваження |
|---|---|---|
| `4bca1a7` | `LeadActions` показує відмову сервера (`forbidden`): повертає справжній статус, не переходить на `/dashboard`, повідомлення `role="alert"` | UI ігнорував результат нових перевірок |
| `888a969` | текст очікування на `/quotes/[id]` іде з клієнтського компонента: «оновиться сама» / «довше, ніж зазвичай» / «більше не оновлюється» | сторінка обіцяла автооновлення після зупинки опитування й «менеджер отримає обидва» |
| `cc6ed63` | `readBodyLimited()`: тіло колбека читається потоком і обривається на 64 КБ навіть без `content-length` (413) | chunked-тіло все одно буферизувалось повністю |
| `2face7f` | демо-ліміт: 5 валідних запитів кошторису з однієї IP за 10 хв, до збереження й виклику n8n; описано в `docs/n8n-integrations.md` | публічна форма без обмеження запускала дорогий воркфлоу |
| `b52b76c`, `fa19e15` | скіл: C4 приймає потокове читання тіла; у `SKILL.md`/`contract.md` уточнено, що ключ = `${data.jobId}:${body.event}`; шаблони роуту й `callback.ts` — точна копія коду; пояснено, чому Retry On Fail в n8n (3 × 1000 мс) відрізняється від повторів застосунку; для блоків коду вказано мову (markdownlint) | неоднозначний крок 7, markdownlint, «суперечність» повторів |
| `c1c2b21`, `46c3ecb` | `skill-review-n8n.md`: екрановано `\|\|` у таблиці; команда-доказ `grep -rlE` | таблиця ламалась |

Перевірено на збірці (порти 3100/5679): сценарій форма → 202 → колбек → «Готово»; матриця колбеків 11/11;
тіло 70 КБ **без** `content-length` (chunked, без підпису) → 413; запити кошторису 1–5 з однієї IP → 303
(запущено рівно 5 воркфлоу), 6-й і 7-й → 200 з `role="alert"` «Забагато запитів…», введене збережено; IP і
персональних даних у журналі сервера — 0. `check-contract`: гілка 0 FAIL, `main` 6, прогін A 7, прогін B 0.

### Додаткове посилення

| Коміт | Що |
|---|---|
| `90cb935` | форма нотаток: після відмови (`forbidden`) введений текст повертається у поле |
| `963639d` | кошторис: виняток усередині `after()` переводить запит у `failed` замість вічного `queued`; `triggerWorkflow` не запускає воркфлоу з колбеком, якщо немає `N8N_CALLBACK_SECRET` |
| `5fa1383` | `lead-created`: невдала доставка в n8n лишає запис аудиту (подія й id, без персональних даних) |
| `0220062` | ліміт частоти: старі ключі прибираються; у реєстрі — коли можна довіряти `x-forwarded-for` |
| `4d4666f` | `check-contract`: C11 вимагає, щоб `idempotency-key` звірявся з полями підписаного тіла; порожній `--changed-since=` — помилка використання (код 2) |
| `bc6505a` | скіл: IF-вузол в n8n пускає колбек лише на адресу застосунку (захист від SSRF через `callbackUrl`); шаблони = посилений код |
| `018455e` | `check-contract`: з `--changed-since` файлові знахідки C4/C5/C11 показуються й тоді, коли змінено лише допоміжний модуль роуту; C4 зараховує `req.text()` у такому модулі; C11 шукає саме порівняння ключа з `jobId` |
| `fc353b4` | матриця колбеків: `stale`/`future` — ±310 с, щоб зміна секунди між підписом і перевіркою не повертала запит у вікно |
| `9a9ff85` | ліміт частоти: очищення не частіше ніж раз на хвилину, кожен ключ — за своїм вікном |
| `5e5888e` | `lead-created`: виняток у `after()` перехоплюється так само, як для кошторису |
| `89b8527` | скіл: префікс `callbackUrl` з кінцевою `/`; шаблони ідемпотентності й Server Action ближчі до коду; у Verify — новий `processing`-запит для кожного прогону матриці |

Перевірено на збірці (порти 3100/5679): сценарій форма → `POST /webhook/quote-request -> 202 auth=ok idempotency=new` →
колбек прийнято; матриця колбеків 11/11; нотатка до чужого ліда (`leadId=lead_0007`) → «…іншому робочому
простору», введений текст лишився в полі; запуск без `N8N_CALLBACK_SECRET` → запит одразу `failed`, у журналі
`[n8n] quote-request: not sent, n8n settings are missing or invalid`, мок виклику не отримав.

- **Що скіл змінив у собі після прогонів:**
  - `7593db2` — перевірки колбека в `check-contract.mjs` враховують усі прямі імпорти роуту: на прогоні A
    верифікація токена жила в `lib/quote-workflow.ts`, і C5 хибно повідомляв «signature not compared with
    timingSafeEqual»; хешування обох значень зараховано як вирівнювання довжин; `===` шукається лише цілими
    словами (раніше підрядок `sig` у `assignedTo` з `lib/db.ts` давав хибний збіг при повному скані копії B).
  - `b224d5e` — `--changed-since` правильно працює, коли `--root` — підтека git-репозиторію (`git diff
    --relative`; раніше такий проєкт давав 11 PASS на поганому коді); C11 більше не приймає будь-яке «64» за
    ліміт 64 КБ; код виходу через `process.exitCode`.
  - `47fc4f6`, `6669b1c` — шаблони в `references/nextjs-patterns.md` тепер відповідають коду, що пройшов
    прогони: умовні переходи статусу після 202 (у старому шаблоні колбек, що випередив обробку 202, назавжди
    перетворювався назад на `processing`), 413 до читання тіла, сувора перевірка події й `https`-посилання,
    `redirect: "manual"`, аудит окремим `after()`; у `SKILL.md` — звідки брати `--job-id` для матриці.
  - `b52b76c`, `fa19e15` — за рев'ю CodeRabbit: C4 приймає потокове читання тіла; точніше правило ключа
    колбека; шаблони = код гілки (з `readBodyLimited`); пояснення різниці повторів n8n і застосунку.
  - `4d4666f`, `bc6505a` — C11 перевіряє прив'язку ключа до підписаного тіла; порожній `--changed-since=` —
    помилка; SSRF-запобіжник для `callbackUrl` на боці n8n; шаблони синхронізовано з посиленим кодом.
  - Результати прогонів від цих змін не змінились: A — 7 FAIL, B — 0 FAIL, `main` — 6 FAIL.

## Висновок

Скіл змінив результат суттєво, і це видно з мока, а не з враження. Обмеження: кожен варіант (A і B) пройшов лише один раз
(A і B по разу, та сама модель і effort), тож розкид між повторними прогонами не виміряно; різниця тут
якісна (403/401 проти 202 → колбек → «Готово», 7 проти 0 FAIL), а не статистична. Без скіла агент зробив акуратну фічу за
загальними знаннями й наявним кодом (таймаут, `after()` для аудиту, `timingSafeEqual`, захист від підміни
`Host`), але вона не працює з n8n, налаштованим за домовленостями команди: запуск отримує 403 (немає
`x-n8n-token`), а в додатковому прогоні без Header Auth колбек з HMAC-підписом отримав 401; у `.env.example`
потрапив тестовий URL, скопійований зі старого рядка. Зі скілом агент сам завантажив його, узяв шаблони з
`references/`, перевірив себе скриптами скіла і дав код, що проходить усі 11 перевірок і весь сценарій
(202 → підписаний колбек → «Готово») з першого разу. На повільному n8n (відповідь через 2 с) форма A
відповідає за 2289 мс, бо чекає n8n у самій дії, а форма B — за 195 мс: виклик в `after()`. Доробляти після
прогону B довелося лише старий `lead-created` — там, де агент за правилом зупинки спитав людину. Рев'ю перед
здачею знайшло в перенесеному коді й у шаблонах скіла кілька слабких місць (гонка статусів у шаблоні, 413 до
читання тіла, доступність форми, редиректи з токеном) — їх виправлено і в коді, і в скілі, щоб наступний
проєкт їх не успадкував.
