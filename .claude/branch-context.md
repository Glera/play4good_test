# Branch Context: dev/Gleb

Persistent memory across CI runs — the CI equivalent of IDE chat history.
Contains: full plans, review feedback, errors, failed approaches, lessons learned.
Read by agent at start of each run to avoid repeating mistakes.


---

## #158 — хочу чтобы кости которые летят для уборки всегда были выше всех других костей по (2026-02-19)
Commit: 99cf661
Files: app.js,style.css

### Plan
# Plan: Issue #158 — Кости для уборки всегда выше остальных по z-index

## Проблема
При анимации удаления пары (removePair → animateArc) летящие кости могут визуально проходить ПОД другими костями. Хотя inline `zIndex = 10000` уже выставляется (app.js:730-731, 649), на практике в мобильных WebView это не всегда надёжно: CSS `transition: transform 0.15s ease` на `.mahjong-tile` (style.css:72) интерферирует с rAF-анимацией, а `will-change: transform, opacity` (style.css:73) промотирует каждую кость в отдельный compositing layer, где порядок отрисовки может быть непредсказуемым.

## Файлы для изменения

### 1. `style.css` — добавить класс `.mahjong-tile.flying`
- `z-index: 10000 !important;` — CSS-класс надёжнее inline style в WebView
- `transition: none !important;` — отключить CSS-transition, чтобы не было конфликта с JS rAF-анимацией (CSS transition пытается интерполировать transform параллельно с requestAnimationFrame)
- `pointer-events: none;` — уже есть в JS, дублируем для надёжности
- Разместить после `.mahjong-tile.selected` (после строки ~160)

### 2. `app.js` — функция `removePair()` (~строка 728)
- Добавить `elA.classList.add('flying')` и `elB.classList.add('flying')` сразу после получения элементов (строки 712-713), ДО выставления zIndex
- Это гарантирует что CSS-класс применён до начала анимации

### 3. `app.js` — функция `animateArc()` (~строка 646)
- В начале функции добавить `el.classList.add('flying')` (belt-and-suspenders — на случай прямого вызова)
- В блоке `t >= 1` (конец анимации, строка 684): убрать класс `el.classList.remove('flying')` перед `willChange = ''`

## Краевые случаи
- **Несколько пар летят одновременно** — все получат z-index 10000, что ОК (все выше статических костей)
- **Hover-transform на кости перед полётом** — `transition: none` из `.flying` предотвратит плавный переход от hover-трансформа к arc-трансформу (убирает визуальный "прыжок")
- **Board zoom меняется во время полёта** (applyZoom вызывается из onContact) — кости внутри board, zoom не влияет на их взаимный z-order
- **iOS Safari WebView** — `!important` в CSS-классе + inline style = двойная гарантия

## Тестирование
- `npx playwright test` — smoke-тесты должны проходить (класс `.flying` не влияет на DOM-структуру)
- Ручная проверка: подобрать пару костей с нижнего слоя, убедиться что при полёте они над верхними слоями
- Проверить при ширине 320px и 1024px

### Review feedback
Plan review:
1) План не учитывает снятие inline `zIndex`/`pointerEvents` после полёта — может остаться “грязное” состояние, если анимация прервётся/ошибка.  
2) Нужен шаг на cleanup при удалении элементов или при отмене анимации (например, если removePair вызывается повторно) — класс `.flying` может зависнуть.  
3) `transition: none !important` может ломать другие эффекты в момент, когда элемент “летит” и быстро возвращается/переиспользуется — проверьте возврат transition после полёта.  
4) Риск: z-index 10000 не сработает, если родитель создает stacking context (transform/opacity на родителе) — стоит проверить контейнер board.  
5) В тест-плане нет проверки Telegram Desktop/Web (не только мобильный WebView).

Code review (false):
1) ⚠️ Наращивается использование inline-стилей (`zIndex`, `pointerEvents`, `willChange`) — это противоречит правилу «весь CSS в style.css». Лучше перенести в класс и управлять только классами.  
2) Возможен «грязный» state: если анимация прервётся/страница ресетнется до завершения rAF, класс `.flying` и inline-стили могут не быть сняты (tiles останутся без transitions/клика). Нужен общий cleanup при reset/removed.  
3) `z-index: 10000 !important` может перекрывать UI поверх (меню/оверлеи Telegram, модалки). Стоит проверить на всех экранах, нет ли регрессий.  
4) Дублирование: `flying` добавляется в `removePair` и `animateArc` — может скрывать логические ошибки и усложнять поддержку; определитесь с одним местом ответственности.

В остальном идея хорошая, но лучше проверить на моб. WebView и при рестарте игры/прерывании анимации.

### Corrections after review
Fix agent messages: 
Commits after review: 99583a1 docs: update DEVLOG for #158
99cf661 fix: address code review feedback (#158)
0d8b9de feat: кости для уборки всегда выше остальных по z-index (#158)

### Lessons learned (agent-written)
# Agent Lessons — Issue #158

## Decisions
- **CSS class `.flying` over inline-only z-index**: Inline `zIndex = 10000` was already present but unreliable in mobile WebView compositing. Added a CSS class with `!important` as the primary mechanism, kept inline as belt-and-suspenders.
- **`transition: none !important` in `.flying`**: CSS `transition: transform 0.15s` on `.mahjong-tile` was conflicting with `requestAnimationFrame` arc animation — browser tried to interpolate transform changes from both. Disabling transitions during flight fixes the conflict.
- **Full cleanup in `animateArc` end block**: Reviewer correctly flagged that inline `zIndex`/`pointerEvents` could remain as dirty state. Added cleanup of `.flying` class + all inline overrides at `t >= 1`, even though elements are typically removed from DOM right after via `onContact()`.

## Failed approaches
- None — the plan was straightforward and all changes worked on first attempt.

## Errors fixed
- None — all 30 tests (smoke + performance) passed on first run.

## Developer preferences
- Project uses no frameworks, pure HTML/CSS/JS (ES modules)
- DEVLOG.md entries go at the top (after `# Development Log` header), newest first
- Commit workflow: commit code → get SHA → update DEVLOG → amend commit → push
- notify.sh must be called at start (plan) and end (done) of work

## Warnings for next run
- `.mahjong-board` has `transform: translateZ(0)` creating a stacking context — z-index only works among its children, not across the board boundary. Current approach is correct since all tiles are board children.
- The `will-change: transform, opacity` on `.mahjong-tile` (line 73) promotes each tile to its own compositing layer — this is intentional for GPU acceleration but means z-index ordering is determined by compositor, not just paint order.
- DEVLOG.md had a duplicate #157 entry (lines 3+5) — left as-is since it was pre-existing.

### Test results
```
Smoke tests: PASSED
Performance tests: PASSED
```

### Diff summary
```
 DEVLOG.md | 38 ++++++++++++++++++++++++++++++++++++++
 app.js    | 24 ++++++++++++++++--------
 style.css | 11 +++++++++++
 3 files changed, 65 insertions(+), 8 deletions(-)
```


---

## #159 — хочу чтобы минимальная величина разлета костей в сторону была 3 ширины кости, ни (2026-02-19)
Commit: 07f5283
Files: app.js

### Plan
# Plan: Issue #159 — Минимальный разлёт костей = 3 ширины кости

## Проблема
В `removePair()` (app.js:779) минимальная амплитуда бокового разлёта — `tileW * 1.0`. Разработчик хочет, чтобы кости всегда разлетались минимум на 3 ширины кости в сторону.

## Файлы для изменения

### `app.js` — функция `removePair()`, строка 779
Единственное изменение:
```js
// Было:
const baseAmplitude = Math.max(tileW * 1.0, absDy * 0.3);
// Станет:
const baseAmplitude = Math.max(tileW * 3.0, absDy * 0.3);
```
Это гарантирует, что латеральное смещение (amplitude в `animateArc`) никогда не будет меньше 3 ширин кости.

## Краевые случаи
- **Маленький экран (320px):** tileW ~30px, 3×30=90px. `maxAmplitude = boardSpan * 0.35 ≈ 112px` — вмещается. Если экран совсем узкий и maxAmplitude < tileW*3, кости будут обрезаны до maxAmplitude — это ОК, иначе они вылетят за пределы доски.
- **Близкие кости (closeness ~1, boost=2.5):** 3×tileW×2.5 = 7.5×tileW, но cap на `boardSpan * 0.35` предотвратит вылет за границу.
- **Стопка костей (dy=0, dist≈0):** absDy*0.3 = 0, поэтому минимум tileW*3 сработает — кости разлетятся видимо в стороны.
- **Кости далеко друг от друга:** closeness ≈ 0, boost ≈ 1, amplitude = tileW*3 минимум — хороший видимый разлёт.

## Тестирование
- `npx playwright test` — smoke + performance тесты
- Визуально: убрать пару соседних костей и пару далёких — в обоих случаях разлёт должен быть не менее ~3 ширин кости
- Проверить на 320px и 1024px

### Review feedback
Plan review:
✅ План выглядит хорошо. Обрати внимание на:
- Если `maxAmplitude` < `tileW*3`, фактический минимум не гарантируется — стоит упомянуть/проверить влияние на ожидания дизайна.
- Риск регрессии: сильный разлёт на узких экранах может привести к визуальному обрезанию/перекрытию вне доски (проверить safe area).
- Не описано, нужны ли обновления визуальных тестов/скриншотов (если есть).
- Убедиться, что `tileW` корректно рассчитывается для разных масштабов/зумов (иначе 3× может быть слишком).

Code review (false):
1) В DEVLOG.md изменён статус у задачи #158 на «⭐ забрать в main» — это побочное изменение не по тикету #159, риск путаницы в cherry-pick.  
2) Увеличение минимальной амплитуды до `tileW*3` может привести к чрезмерному разлёту на маленьких полях/экранах; стоит проверить, что итоговая амплитуда всё ещё ограничивается `maxAmplitude`.  
3) Нет упоминания о проверке поведения на 320px ширине/мобайле — при большом разлёте возможен вылет костей за экран.  

В остальном изменение точечное.

### Corrections after review
Fix agent messages: 
Commits after review: 4249b33 docs: update DEVLOG for #159
07f5283 fix: address code review feedback (#159)
56f59ae feat: минимальный разлёт костей = 3 ширины кости (#159)
1df4d5c Mark #158 for cherry-pick to main

### Lessons learned (agent-written)
# Agent Lessons — Issue #159

## Decisions
- **Single constant change**: Only changed `tileW * 1.0` → `tileW * 3.0` in `baseAmplitude` calculation. The existing `maxAmplitude = boardSpan * 0.35` cap naturally prevents tiles from flying off-screen on narrow devices, so no additional safeguards needed.
- **Reviewer concern about maxAmplitude < tileW*3**: Acknowledged but accepted — on very narrow screens the cap will reduce the effective minimum, which is the correct behavior (prefer staying on-screen over guaranteed 3x distance).

## Failed approaches
- First `git push` was rejected because remote had new commits (branch context update from prior CI run). Fixed with `git pull --rebase`.

## Errors fixed
- None — all 30 tests passed on first run.

## Developer preferences
- Same workflow as #158: notify → implement → test → commit → DEVLOG → amend → push
- DEVLOG entries go at the top, newest first

## Warnings for next run
- DEVLOG.md has a duplicate #158 entry (lines 22+24) — pre-existing from #158, left as-is.
- Remote branch may have CI-generated commits (branch context updates) — always pull before push.

### Test results
```
Smoke tests: PASSED
Performance tests: PASSED
```

### Diff summary
```
 DEVLOG.md | 36 ++++++++++++++++++++++++++++++++++++
 app.js    |  7 ++++---
 2 files changed, 40 insertions(+), 3 deletions(-)
```

