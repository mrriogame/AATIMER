# SUPABASE_SYNC_ANALYSIS — AATIMER / timer-site

Актуальная модель данных и подготовка к синхронизации LocalStorage ↔ Supabase.  
**Синхронизация и Realtime пока не реализованы.**

Обновлено: 2026-09-15 (prep после аудита: поля `tasks`, signup default list, изоляция LocalStorage по user id).

---

## 0. Статус проекта (факт)

| Область | Статус |
|---------|--------|
| Таймеры / события / будильники | Работают (LocalStorage) |
| Трекер задач, списки, event/daily/weekly | Работают (LocalStorage) |
| Supabase Auth | Работает |
| Sync / Realtime | **Нет** |
| RLS + таблицы | Есть в проекте Supabase |
| Prep-миграция схемы | [`supabase/migrations/20260915_prep_tasks_and_signup.sql`](supabase/migrations/20260915_prep_tasks_and_signup.sql) — применить вручную в SQL Editor |

---

## 1. LocalStorage — фактическая структура

Модуль: [`js/storage.js`](js/storage.js).

### 1.1. Изоляция по аккаунту (подготовка к sync)

| Режим | Ключи |
|-------|--------|
| **Гость** (`activeUserId = null`) | Legacy: `eventsNotify`, `eventsNotifyMinutes`, `eventsSubscribed`, `eventsCollapsed`, `aatimer_task_lists`, `aatimer_tasks` |
| **Auth** | `aatimer:u:{userId}:eventsNotify`, `…:eventsNotifyMinutes`, `…:eventsSubscribed`, `…:eventsCollapsed`, `…:task_lists`, `…:tasks` |

- Форматы **значений** те же (гость и аккаунт).
- `setActiveUserId` вызывается из [`js/auth.js`](js/auth.js) при смене сессии.
- При signOut показываются **гостевые** ключи; данные аккаунта **не удаляются**, но больше не читаются, пока снова не войдёт тот же user id.
- Данные аккаунта A **не видны** аккаунту B в том же браузере.
- Миграция guest → user и sync **не** делаются на этом этапе.

### 1.2. Ключи и типы (логическая модель)

| Логическое поле | Тип значения | Назначение |
|-----------------|--------------|------------|
| notifications | `"true"` / `"false"` | Глобальные browser-уведомления |
| notifyMinutes | строка-число | Минуты до старта (default 5) |
| subscribed | `{ [eventId]: true }` | Будильники по id события |
| collapsed | `{ [category]: true }` | Свёрнутые категории |
| task lists | JSON array | Списки задач |
| tasks | JSON array | Задачи трекера |

Каталог событий / дейликов / викликов — только статика (`data/*.json`), не LocalStorage.

---

## 2. Задачи (`aatimer_tasks` / scoped `tasks`)

| Поле | Тип | Примечание |
|------|-----|------------|
| `id` | UUID string | |
| `listId` | UUID string | |
| `title` | string | |
| `kind` | `event` \| `daily` \| `weekly` \| `plain` | |
| `completed` | boolean | |
| `completedAt` | ISO \| null | **Обязателен** для сброса daily/weekly |
| `eventId` | string \| null | id из `events.json` |
| `eventName` | string \| null | снимок названия |
| `eventTime` | ISO \| null | снимок слота |
| `questId` | string \| null | id из dailies/weeklies |
| `sortOrder` | number | |
| `createdAt` / `updatedAt` | ISO | |
| `deletedAt` | ISO \| null | soft delete |

Локально **нет** `version` / `userId` (появятся при sync с сервера).

### 2.1. kind и квесты

| kind | Источник | Поля связи |
|------|----------|------------|
| `event` | таймер / модалка события | `eventId`, `eventName`, `eventTime` |
| `daily` | дейлик | `questId`; reset = 24ч от `completedAt` |
| `weekly` | виклик | `questId`; reset = вс 00:00 МСК ([`js/quests.js`](js/quests.js)) |
| `plain` | модель поддерживает | UI «обычная задача» пока без отдельной кнопки |

---

## 3. Списки (`aatimer_task_lists` / scoped `task_lists`)

| Поле | Тип |
|------|-----|
| `id` | UUID string |
| `title` | string |
| `sortOrder` | number |
| `isDefault` | boolean (локально; автосозданный «Мои задачи») |
| `createdAt` / `updatedAt` / `deletedAt` | ISO / null |

---

## 4. Данные таймеров для будущей синхронизации

| Local | Sync? | Supabase |
|-------|-------|----------|
| notify on/off | да | `user_settings.notifications_enabled` |
| notify minutes | да | `user_settings.notify_minutes` |
| subscribed map | да | `user_alarms` (N строк) |
| collapsed | да | `user_settings.collapsed_categories` |
| countdown / next / route | нет | клиент |
| `notifiedEvents` | нет | сессия |

---

## 5. Соответствие LocalStorage ↔ Supabase

```
LOCAL (logical)                 SUPABASE
────────────────────────────────────────────────────────
notify                       →  user_settings.notifications_enabled
notifyMinutes                →  user_settings.notify_minutes
collapsed                    →  user_settings.collapsed_categories
subscribed                   →  user_alarms (event_id + enabled)

task list                    →  task_lists
  id                         →  id
  title                      →  title
  sortOrder                  →  sort_order
  isDefault                  →  is_default
  createdAt/updatedAt/deletedAt → created_at/updated_at/deleted_at
  (auth)                     →  user_id, version

task                         →  tasks
  id                         →  id
  listId                     →  list_id
  title                      →  title
  kind                       →  kind          ✅ prep migration
  completed                  →  completed
  completedAt                →  completed_at  ✅ prep migration
  eventId                    →  event_id
  eventName                  →  event_name    ✅ prep migration
  eventTime                  →  event_time
  questId                    →  quest_id      ✅ prep migration
  sortOrder                  →  sort_order
  timestamps / soft delete  →  created_at, updated_at, deleted_at
  (auth)                     →  user_id, version
```

Прямого dump JSON → table нет: нужны snake_case, map↔rows для alarms, `user_id`.

---

## 6. Таблица `tasks` — поля после prep

Добавляются миграцией (если ещё нет):

| Column | Type | Constraint |
|--------|------|------------|
| `kind` | `text NOT NULL DEFAULT 'plain'` | `CHECK (kind IN ('event','daily','weekly','plain'))` |
| `quest_id` | `text NULL` | |
| `event_name` | `text NULL` | |
| `completed_at` | `timestamptz NULL` | |

Уже ожидались: `event_id`, `event_time`, `completed`, `sort_order`, soft delete, `version`, …

---

## 7. Дефолтный `task_list` — единый источник в облаке

**Решение:** канонический дефолтный список для авторизованных пользователей создаётся **только в signup trigger** `handle_new_user`:

1. `profiles`
2. `user_settings`
3. `task_lists` с `title = «Мои задачи»`, `is_default = true`

Защита от дублей:

- unique partial index: один активный `is_default` на `user_id`;
- insert только если такого списка ещё нет;
- backfill для существующих profiles.

**Клиент** (`ensureDefaultList`) по-прежнему создаёт локальный «Мои задачи» с `isDefault: true` **в текущем namespace** (гость или `aatimer:u:{id}:…`), чтобы UX работал **до** sync.

При будущем merge:

1. Cloud `is_default` список — канонический `id`.
2. Локальный `isDefault` список того же пользователя ремапится на cloud id (задачи обновляют `listId`).
3. Не создавать второй cloud default с клиента.

`profiles.guest_merged_at` — флаг одноразового guest→auth merge (колонка в prep SQL).

---

## 8. Готовность к sync (после применения SQL)

| Таблица | Готовность |
|--------|------------|
| `user_settings` | высокая (скаляры + jsonb) |
| `user_alarms` | средняя (трансформация map ↔ rows) |
| `task_lists` | высокая (+ `is_default`) |
| `tasks` | высокая **после** ALTER kind/quest_id/event_name/completed_at |
| LocalStorage isolation | готова (по user id) |
| Sync layer / Realtime | не начаты |

---

## 9. План реализации sync (без кода сейчас)

1. Применить SQL prep в Dashboard.  
2. Sync `user_settings` + `user_alarms`.  
3. Guest merge + `guest_merged_at`.  
4. Sync `task_lists` (remap default) → `tasks`.  
5. Realtime.  
6. Offline queue / смена аккаунта / bump SW.

Конфликты: LWW по `updated_at` + серверный `version`; soft delete.

---

## 10. Риски

| Риск | Митигация |
|------|-----------|
| Два UUID дефолтного списка (local + cloud) | `is_default` + remap при первом sync |
| Утечка данных между аккаунтами в браузере | scoped keys (сделано) |
| Потеря `completed_at` / `kind` | колонки в `tasks` (prep SQL) |
| Clock skew | `version` trigger на UPDATE |
| SW отдаёт старый JS | bump `CACHE_NAME` при релизах |

---

## Приложение — файлы prep

| Файл | Роль |
|------|------|
| `supabase/migrations/20260915_prep_tasks_and_signup.sql` | ALTER tasks, is_default, handle_new_user, backfill |
| `js/storage.js` | scoped LocalStorage |
| `js/auth.js` | `setActiveUserId` на смене сессии |
| `js/timers.js` | `reloadLocalPrefsFromStorage` |
| `js/app.js` / `js/tasks-page.js` | refresh UI при смене scope |

*Конец документа.*
