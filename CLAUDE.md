# Telegram WebApp — Mini App

Одностраничное веб-приложение (HTML/CSS/JS), запускается как Telegram Mini App через WebView.
Должно корректно работать на мобильных (iOS/Android) и десктопе (Telegram Desktop, Telegram Web).

## Стек

- Чистый HTML5, CSS3, JavaScript (ES modules)
- Без фреймворков, без сборщиков
- Telegram Web App SDK: `<script src="https://telegram.org/js/telegram-web-app.js"></script>`
- Единственная точка входа: `index.html`

## Структура проекта

```
/
├── index.html      # Главная страница, подключает всё остальное
├── style.css       # Стили
├── app.js          # Логика приложения
├── CLAUDE.md       # Этот файл
└── README.md       # Описание проекта и инструкции по деплою
```

## Правила кода

- Весь CSS — в style.css, не inline
- Мобильный viewport обязателен: `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">`
- Адаптивный дизайн: mobile-first, flexbox/grid, никаких фиксированных пикселей для ширины
- Использовать CSS-переменные Telegram для цветов темы:
  - `var(--tg-theme-bg-color)` — фон
  - `var(--tg-theme-text-color)` — текст
  - `var(--tg-theme-button-color)` — кнопки
  - `var(--tg-theme-button-text-color)` — текст кнопок
  - `var(--tg-theme-hint-color)` — второстепенный текст
  - `var(--tg-theme-link-color)` — ссылки
  - `var(--tg-theme-secondary-bg-color)` — вторичный фон
- Инициализация Telegram WebApp в app.js:
  ```js
  const tg = window.Telegram.WebApp;
  tg.ready();
  tg.expand();
  ```
- Не использовать alert/confirm/prompt — они не работают в WebView
- Кликабельные элементы: минимум 44×44px (touch target)
- Тестировать на safe area insets (вырезы, скруглённые углы)

## Проверка изменений

Перед коммитом убедись:
1. HTML валиден (нет незакрытых тегов)
2. Нет ошибок в console
3. Страница корректно отображается при ширине 320px–1024px
4. Используются цвета темы Telegram, а не хардкод
