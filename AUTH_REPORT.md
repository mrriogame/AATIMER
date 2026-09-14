# AATIMER — отчёт по Supabase Auth

Дата: 2026-09-14

## 1. Созданные файлы

| Файл | Назначение |
|------|------------|
| [`js/auth.js`](js/auth.js) | Регистрация, вход, выход, сессия, `onAuthStateChange`, маппинг ошибок |
| [`js/auth-ui.js`](js/auth-ui.js) | Кнопка «Войти» / email, модалка входа/регистрации, меню выхода |
| [`AUTH_REPORT.md`](AUTH_REPORT.md) | Этот отчёт |

## 2. Изменённые файлы

| Файл | Что сделано |
|------|-------------|
| [`js/app.js`](js/app.js) | `await initAuthUI()` при старте |
| [`js/tasks-page.js`](js/tasks-page.js) | то же на странице задач |
| [`js/supabase.js`](js/supabase.js) | `flowType: "pkce"` для email-ссылок |
| [`css/app.css`](css/app.css) | стили кнопки аккаунта и модалки Auth |
| [`sw.js`](sw.js) | кеш `aatimer-cache-v7`, precache `auth.js` / `auth-ui.js` |

**Не менялись:** `storage.js`, логика таймеров/задач, ключи LocalStorage приложений.

## 3. Регистрация

`supabase.auth.signUp({ email, password, options: { emailRedirectTo } })`

- `emailRedirectTo` = текущий origin + каталог сайта (`new URL("./", location)`), подходит для localhost и GitHub Pages.
- Если после signup есть `session` — пользователь сразу «вошёл».
- Если сессии нет — показано сообщение: подтвердите email, затем войдите.
- Пустой `identities` трактуется как «email уже занят».

Пароль не хранится приложением — только через Supabase Auth.

## 4. Вход

`supabase.auth.signInWithPassword({ email, password })`

При успехе обновляется UI (кнопка показывает email). Ошибки переводятся на понятный русский (`mapAuthError`).

## 5. Выход

`supabase.auth.signOut()`

UI → режим гостя. **LocalStorage приложения не очищается** (будильники, задачи и т.д. остаются).

## 6. Текущая сессия

При старте страницы:

1. `initAuth()` → `getSession()`
2. `onAuthStateChange` → обновление `currentUser` и UI

Сессию хранит SDK Supabase (`persistSession: true`), не вручную.

## 7. Подтверждение email

1. Пользователь получает письмо от Supabase.
2. Ссылка ведёт на `emailRedirectTo` (ваш сайт).
3. `detectSessionInUrl: true` + PKCE подхватывают токены.
4. При наличии сессии показывается toast «Email подтверждён…», лишние query-параметры убираются из URL.

**Нужно в Supabase Dashboard → Authentication → URL Configuration:**

- Site URL: URL продакшена (GitHub Pages) и/или localhost для тестов
- Redirect URLs:  
  `http://127.0.0.1:PORT/`  
  `http://localhost:PORT/`  
  `https://<ваш-user>.github.io/<repo>/`  
  (со слешем в конце при необходимости)

## 8. Режим гостя

Без сессии сайт полностью работает как раньше. Кнопка «Войти» открывает модалку с пояснением, что регистрация нужна для будущей синхронизации, а данные пока локальные.

## 9. Синхронизация данных

**Не реализована.** Авторизованный пользователь по-прежнему использует только LocalStorage (`eventsNotify*`, `aatimer_task_*` и т.д.). Таблицы `tasks` / `task_lists` / `user_alarms` / Realtime **не трогаются**.

## 10. Следующий логичный этап

Синхронизация LocalStorage ↔ Supabase (local-first):

1. `user_settings` + `user_alarms`
2. merge guest → cloud при первом логине
3. `task_lists` / `tasks`
4. Realtime

---

### Как проверить вручную

1. Гость: таймеры и задачи работают без входа.
2. Регистрация → письмо → подтверждение → вход.
3. F5 / переход index ↔ tasks — сессия на месте.
4. Выход — гость, данные LocalStorage на месте.
5. Неверный пароль / неподтверждённый email — понятные сообщения.
