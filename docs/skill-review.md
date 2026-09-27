# Рев'ю стороннього скіла: `vercel-react-best-practices`

> Рев'ю зроблено **до** встановлення. Файли скіла читались як дані з неглибокого клону поза
> репозиторієм (`../review-agent-skills`); нічого з них не виконувалось, тека не відкривалась як
> проєкт в агенті. Рев'ю закомічено в `12c04f6` до встановлення (`26b0a11`); після встановлення в `19fe162`
> дописано лише факти самого встановлення: блок аудитів із CLI (розділ 3), звірку хешів і результат
> встановлення (розділ 6). У `182cdd6` виправлено дві неточності: термінал встановлення (фактично PowerShell,
> один запуск без `DISABLE_TELEMETRY`) і хибне твердження, що звірка хешів «підтверджує» аудит (тепер: не доводить
> і не спростовує). Перевірки чекліста й вердикт після встановлення не змінювали.

**Дата, інструмент, ОС:** 24.09.2026 · Claude Code 2.1.280 (Opus 5.5) · Windows 10 Pro 19045 + Git Bash, Node 24.18.0

## Що рев'юємо

| | |
|---|---|
| Репозиторій | <https://github.com/vercel-labs/agent-skills> |
| Тека в репозиторії → `name` | `skills/react-best-practices` → `name: vercel-react-best-practices` (назва теки ≠ `name`; CLI встановлює за `name`) |
| Версія | тег `agent-skills-063bee94c3f4df8453406c830b0a7df0f2860278` = коміт `063bee94c3f4df8453406c830b0a7df0f2860278` (28.08.2026). На день рев'ю тег збігається з `main` (`git ls-remote`), остання зміна саме в теці скіла — `dc8367e6f91c`, 14.04.2026 |
| Навіщо нам | Дашборд LeadDesk відкривається > 2 с, форма «думає»; експерта з продуктивності React у команді немає. Скіл дає 70 правил з id, на які можна посилатися в комітах і власних скілах |

## 1. Подивитись, не встановлюючи

- Як дивились:
  1. `DISABLE_TELEMETRY=1 npx skills@1.7.0 add "vercel-labs/agent-skills#agent-skills-063bee94c3f4df8453406c830b0a7df0f2860278" --list`
     (запуск з тимчасової теки поза репозиторієм) — CLI клонував тег у тимчасову теку, показав 9 скілів з
     описами, у репозиторій нічого не записав. Показово: CLI надрукував
     `claude-code_2-1-280_agent  Agent detected — installing non-interactively` — у сесії агента він сам
     вмикає неінтерактивний режим, тому встановлення запускаю не з агента (див. розділ 3).
  2. `git clone --depth 1 --branch agent-skills-063bee94c3f4df8453406c830b0a7df0f2860278 https://github.com/vercel-labs/agent-skills.git ../review-agent-skills`;
     `git -C ../review-agent-skills rev-parse HEAD` → `063bee94c3f4df8453406c830b0a7df0f2860278`.
- Склад скіла (76 файлів у клоні тега; CLI не копіює `metadata.json`, тож після встановлення буде 75):

  | Файл / тека | Розмір | Що це |
  |---|---|---|
  | `SKILL.md` | 7,4 КБ | frontmatter + зміст: 8 категорій, 70 id правил з одним рядком опису, «як користуватись» |
  | `AGENTS.md` | 112 КБ | усі правила, зібрані в один документ (генерується з `rules/`) |
  | `README.md` | 3,5 КБ | для людей: структура, як додавати правила |
  | `metadata.json` | 0,9 КБ | версія `1.0.0`, автор «Vercel Engineering», список посилань |
  | `rules/*.md` | 72 файли | 70 правил (`async-*`, `bundle-*`, `server-*`, `client-*`, `rerender-*`, `rendering-*`, `js-*`, `advanced-*`) + `_sections.md`, `_template.md` |

- Frontmatter `SKILL.md`: `name`, `description`, `license: MIT`, `metadata` (`author: vercel`,
  `version: "1.0.0"`). **Немає** `allowed-tools`, `hooks`, `context`, `model`.

## 2. Що скіл може виконати, завантажити чи змінити

| Перевірка | Результат | Як перевіряли |
|---|---|---|
| `scripts/` та інші виконувані файли | Немає. Єдиний не-markdown файл — `metadata.json` (дані) | `find "$S" -type f ! -name "*.md"` |
| `allowed-tools` | Немає в frontmatter — скіл не отримує попередніх дозволів | `awk '/^---$/{n++; next} n==1' "$S/SKILL.md"` |
| Команди під час рендеру `` !`cmd` `` | Немає | `grep -rn '!`' "$S"` → порожньо |
| Хуки | Немає: ні `*hooks*.json` / `settings*.json`, ні поля `hooks:` у frontmatter | `find "$S" -name "*hooks*.json" -o -name "settings*.json"` → порожньо; frontmatter вище |
| MCP-сервери | Немає: ні `*mcp*.json` / `.mcp.json`, ні згадок про налаштування MCP-сервера | `find "$S" -name "*mcp*.json"` → порожньо; `grep -rniE "mcpServers\|\.mcp\.json" "$S"` → порожньо |
| `plugin.json` / маніфест плагіна | Немає: скіл — звичайна тека, не плагін (`.claude-plugin/` відсутня) | `find "$S" -name "plugin.json" -o -name ".claude-plugin"` → порожньо |
| Вимога API-ключів чи секретів | Немає: скіл не просить ключів, токенів чи змінних середовища; єдині збіги — `checkAuthToken()` у прикладі коду `rules/advanced-init-once.md:18,35` і фраза «prevents storing tokens» у `rules/client-localstorage-schema.md:71` (та їхні копії в `AGENTS.md`); `process.env` не трапляється | `grep -rniE "api[_-]?key\|secret\|token\|process\.env" "$S"` — переглянуто кожен збіг |
| Інструкції агенту щось завантажити чи виконати | Один збіг: `npx svgo --precision=1 --multipass icon.svg` у `rules/rendering-svg-precision.md:27` (і його копія в `AGENTS.md:2477`) — приклад команди для розробника в тексті правила, не інструкція агенту виконати її зараз. Правило нам не потрібне (SVG-іконок у проєкті немає) | `grep -rnE "npx \|curl \|wget \|Invoke-WebRequest\|WebFetch" "$S"` |
| Посилання: куди ведуть | 35 унікальних URL: `react.dev`, `nextjs.org`, `vercel.com` (docs, blog), `developer.mozilla.org`, `github.com` (`isaacs/node-lru-cache`, `shuding/better-all`), `swr.vercel.app`, `esbuild`, `vite`, `webpack`, `csstriggers.com`, `jsfiddle`, `gist.github.com`, `x.com/shuding` і плейсхолдери `*.example.com` у прикладах коду. Усе — «докладніше тут», жодного «прочитай інструкції звідси / завантаж правила з URL» | `grep -rhoE "https?://…" "$S" \| sort -u` |
| Приховані інструкції | HTML-коментарів, «ignore previous», «system prompt» — немає; zero-width символів — `0 file(s)`; base64-подібних рядків ≥ 80 символів — немає | `grep -rniE "ignore (all \|the )?previous\|system prompt\|<!--"`, node-скрипт з шаблону, `grep -rnoE "[A-Za-z0-9+/]{80,}"` |

**Висновок розділу:** скіл — лише текст (markdown + JSON). Він нічого не виконує сам, не приносить
хуків чи MCP, не просить дозволів на інструменти. Ризик — лише в змісті порад (розділ 5).

## 3. Аудити

| Аудит | Результат | Дата аналізу |
|---|---|---|
| Gen (Agent Trust Hub) | **Pass**, risk level SAFE; зауваження «Indirect Prompt Injection Surface» — загальне для скілів, що читають код користувача, без конкретної знахідки | 14.09.2026, 22:49 |
| Socket | **Pass**, «no issues detected» (malicious behavior, security concerns, obfuscation, suspicious patterns); аналізований хеш `ca7b0c0c6e5f2750043f7f0cd72d16ac4e2abc48f9b5500d047a4b77a2506212` | 14.09.2026, 22:49 |
| Snyk | **Pass**, risk LOW, «No issues detected» | 14.09.2026, 22:48 |

- Де взяли: <https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices> і сторінки
  `…/security/agent-trust-hub`, `…/security/socket`, `…/security/snyk` (741 тис. встановлень, 31,5 тис.
  зірок репозиторію, «First Seen» 19.01.2026).
- Чому CLI не показав блок під час `--list`: запуск був з `DISABLE_TELEMETRY=1` (з ним CLI аудити не
  завантажує) і з агентської сесії (CLI сам перейшов у неінтерактивний режим). Блок «Security Risk
  Assessments» у CLI — див. розділ 6 (встановлення запускається людиною у звичайному терміналі).
- Блок у CLI під час встановлення (25.09.2026, людина у звичайному терміналі PowerShell, без
  `DISABLE_TELEMETRY`), показаний **перед** «Proceed with installation?»:
  ```
  Security Risk Assessments
                                Gen     Socket     Snyk
  vercel-react-best-practices   Safe    0 alerts   Low Risk
  Details: https://skills.sh/vercel-labs/agent-skills
  ```
  Збігається з skills.sh. Дат і версії CLI не показує.
- До чого прив'язаний аудит: сторінка skills.sh — до пари «репозиторій + назва скіла», **не до тега**:
  ні Gen, ні Snyk не вказують версії, Socket показує лише хеш вмісту. Дата аналізу (14.09) пізніша за
  наш тег (28.08), а вміст теки скіла не змінювався з 14.04.2026, тож аудит, найімовірніше, бачив той
  самий вміст, — але це збіг, а не гарантія: після нового коміту в `main` аудит оновиться, а наш тег —
  ні. Тому оцінка аудитів — додатковий сигнал, основне — власний чекліст вище.
  Звірка хешів цього не доводить і не спростовує: `computedHash` у нашому `skills-lock.json` —
  `6b526d013e28073246a36f99b529bc43745d30832ecfa8217b359c34f260ca6b`, а Socket аналізував
  `ca7b0c0c6e5f2750043f7f0cd72d16ac4e2abc48f9b5500d047a4b77a2506212`. Хеші різні. Причина може бути в
  різних алгоритмах (CLI рахує хеш без `metadata.json`), але довести, що аудит бачив саме наші файли,
  неможливо.

## 4. Ліцензія й походження

- Ліцензія: **MIT**, заявлена у frontmatter `SKILL.md` (`license: MIT`) і в розділі «License» у
  `README.md` репозиторію. Окремого файлу `LICENSE` у репозиторії немає (GitHub API: `license: null`) —
  слабке місце для юридичної перевірки, але для внутрішнього використання в навчальному проєкті
  прийнятно; тексту ліцензії з іменем правовласника немає.
- Видавець і активність: організація `vercel-labs` (Vercel), репозиторій створено 08.12.2025, останній
  push 28.08.2026, 31,5 тис. зірок; у теці скіла — регулярні коміти (останні 02.04 і 14.04.2026).

## 5. Чи правдивий зміст для нашого стеку

Звірено з документацією нашої версії в `node_modules/next/dist/docs/` (Next.js 16.3.5, React 19.2).

| Порада скіла (id) | Що каже скіл | Що каже документація нашої версії | Висновок |
|---|---|---|---|
| `async-parallel` | Незалежні `await` — через `Promise.all()` | `01-app/01-getting-started/06-fetching-data.md` «Parallel data fetching»: лейаути й сторінки рендеряться паралельно, але в межах одного компонента послідовні `await` блокують один одного; рекомендовано `Promise.all` | **Діє**, застосовуємо: `app/dashboard/page.tsx` робить 5 послідовних запитів |
| `server-cache-react` | `React.cache()` для дедуплікації в межах запиту; **не передавати інлайн-об'єкти** як аргументи — `Object.is` дає промах | `06-fetching-data.md` «Reusing data with `React.cache`»: для ORM/БД (не `fetch`) обгортати в `React.cache`, мемоізація — лише в межах запиту; `02-guides/authentication.md` радить так само кешувати перевірку сесії | **Діє**, застосовуємо: `getCurrentUser()` не кешований, а `getWorkspace({ slug })` кешований, але з інлайн-об'єктом — кеш ніколи не спрацьовує |
| `bundle-barrel-imports` | Імпортувати напряму або додати пакет в `experimental.optimizePackageImports` | `03-api-reference/05-config/01-next-config-js/optimizePackageImports.md`: `recharts` і `lodash-es` **оптимізуються за замовчуванням** | Для `recharts` порада **не потрібна** в 16.3.5 — додавати в конфіг нічого не треба. `lodash` (не `-es`) у списку немає — тут правило діє |
| `bundle-dynamic-imports` | Важкі компоненти — через `next/dynamic` | `02-guides/lazy-loading.md`: `next/dynamic` / `React.lazy` для Client Components; Server Components і так розбиваються на чанки | Діє лише для Client Components (`exceljs`, графік); у Server Component `next/dynamic` сенсу не має |
| `server-serialization` | Передавати в Client Component лише потрібні поля | `01-getting-started/05-server-and-client-components.md`: пропси Client Component серіалізуються в RSC payload; `02-guides/data-security.md`: віддавати лише те, що потрібно UI | **Діє**: `LeadsTable` отримує повні записи лідів |

## 6. Закріплення версії й коміт

- Команда встановлення (запускає людина у звичайному терміналі, не агент; фактично запускали в PowerShell):
  ```bash
  npx skills@1.7.0 add vercel-labs/agent-skills#agent-skills-063bee94c3f4df8453406c830b0a7df0f2860278 \
    --skill vercel-react-best-practices -a claude-code --copy
  ```
  без `DISABLE_TELEMETRY` (один запуск) — щоб побачити блок «Security Risk Assessments» перед «Proceed with
  installation?»; `Installation scope` → Project.
- Як пройшло (25.09.2026, людина в PowerShell): `Installation scope` → Project; блок аудитів → `Proceed
  with installation?` → Yes; `✓ vercel-react-best-practices (copied) → …\.claude\skills\vercel-react-best-practices`.
  На разову пропозицію «Install the find-skills skill?» — **No**: ще один сторонній скіл без рев'ю й
  без закріпленої версії, до того ж він потрапив би в прогони A/B (Task D).
  У «Installation Summary» CLI надрукував шлях `.agents\skills\…` з позначкою `copy → Claude Code`, але
  теки `.agents/` після встановлення немає.
- Де лягли файли; справжні файли чи посилання: `.claude/skills/vercel-react-best-practices/` —
  справжні файли (`--copy`), без `.agents/` (`-a claude-code` без `cursor`). Перевірка:
  `find .claude/skills/vercel-react-best-practices -type f | wc -l` → 75; `ls .agents` → немає;
  `dir /AL .claude\skills` → жодного junction/symlink; `diff -rq` з клоном тега → відрізняється лише
  `metadata.json`, який CLI не копіює; `~/.claude/skills` не створено.
- Що потрапило в git: тека скіла (75 файлів) і `skills-lock.json`: `source: vercel-labs/agent-skills`,
  `ref: agent-skills-063bee94c3f4df8453406c830b0a7df0f2860278`, `skillPath: skills/react-best-practices/SKILL.md`,
  `computedHash: 6b526d01…60ca6b`.
- Як оновлювати: та сама команда з новим тегом → `git diff .claude/skills/vercel-react-best-practices skills-lock.json`
  → рев'ю змін за цим чеклістом (особливо нові не-md файли, frontmatter, посилання) → окремий коміт.
  `npx skills@1.7.0 experimental_install` зі `skills-lock.json` пише лише в `.agents/skills/`, тому
  справжні файли тримаємо в git.

## Вердикт

**Встановити з умовами.** Ризик низький: скіл — лише markdown без скриптів, хуків, MCP і
`allowed-tools`, прихованих інструкцій немає, видавець — Vercel, три аудити Pass. Умови: версія
закріплена тегом і вендорена справжніми файлами; кожну пораду перед застосуванням звіряємо з
`node_modules/next/dist/docs/` (частина порад, як `optimizePackageImports` для `recharts`, у 16.3.5 уже
не потрібна); оновлення — лише через рев'ю діфу за цим чеклістом.
