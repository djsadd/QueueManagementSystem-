# Документация для разработчика

## Назначение системы

Проект реализует электронную очередь для приемной комиссии. Пользовательский поток выглядит так:

1. Абитуриент выбирает услугу на терминале или через публичный API.
2. Backend создает талон в статусе `WAITING`.
3. Оператор в своем окне вызывает следующий подходящий талон.
4. Табло очереди и второе табло оператора получают обновления через WebSocket.
5. История действий сохраняется в `ticket_events` для аудита и аналитики.

## Архитектура

```text
terminal-desktop / public API client
          |
          v
frontend -> nginx -> backend -> PostgreSQL
                         |
                         +-> Redis
                         |
                         +-> Kafka, если KAFKA_ENABLED=true
```

Основной backend API написан на FastAPI. Данные хранятся в PostgreSQL через SQLAlchemy async engine. Схема БД управляется Alembic. Frontend и desktop-клиенты написаны на React; desktop-версии запускаются через Electron.

## Backend

### Структура

| Путь | Назначение |
| --- | --- |
| `backend/app/main.py` | Создание FastAPI-приложения, подключение роутеров, startup/shutdown |
| `backend/app/api` | HTTP и WebSocket endpoints |
| `backend/app/models` | SQLAlchemy ORM-модели |
| `backend/app/schemas` | Pydantic-схемы запросов и ответов |
| `backend/app/services` | Бизнес-логика |
| `backend/app/repositories` | Запросы к БД для отдельных доменов |
| `backend/app/dependencies` | FastAPI dependencies: БД, авторизация |
| `backend/app/core` | Конфигурация и общие enum |
| `backend/alembic/versions` | Миграции БД |
| `backend/tests` | Pytest-тесты API и сервисов |

### Конфигурация

Настройки загружаются через `pydantic-settings` из переменных окружения и корневого `.env`.

Обязательные переменные:

| Переменная | Назначение |
| --- | --- |
| `DATABASE_URL` | Async SQLAlchemy URL, например `postgresql+asyncpg://admin:admin@localhost:5432/queue_db` |
| `REDIS_URL` | URL Redis |
| `JWT_SECRET` | Секрет подписи JWT |

Опциональные переменные:

| Переменная | Значение по умолчанию | Назначение |
| --- | --- | --- |
| `KAFKA_ENABLED` | `false` | Включает отправку событий в Kafka |
| `KAFKA_BOOTSTRAP_SERVERS` | `kafka:9092` | Адрес Kafka broker |

### API-модули

| Prefix | Файл | Назначение |
| --- | --- | --- |
| `/auth` | `app/api/auth/auth.py` | Регистрация, логин, refresh token, текущий пользователь |
| `/public` | `app/api/public/routes.py` | Публичные услуги, программы, создание и просмотр талона, данные табло |
| `/ws` | `app/api/realtime/routes.py` | WebSocket для окна оператора, табло очереди и регистратуры |
| `/tickets` | `app/api/tickets/routes.py` | Управление талонами, вызов, завершение, пропуск, экспорт |
| `/ticket-events` | `app/api/ticket_events/routes.py` | История талонов и аналитика |
| `/services` | `app/api/services/routes.py` | CRUD услуг |
| `/windows` | `app/api/windows/routes.py` | CRUD окон обслуживания |
| `/operators` | `app/api/operators/routes.py` | Операторы, профили, привязки к услугам и программам |
| `/users` | `app/api/users/routes.py` | CRUD пользователей |
| `/applicants` | `app/api/applicants/routes.py` | CRUD абитуриентов |
| `/applicant-reports` | `app/api/applicant_reports/routes.py` | Отчеты абитуриента |
| `/academic-degrees` | `app/api/education/routes.py` | Академические степени |
| `/educational-programs` | `app/api/education/routes.py` | Образовательные программы |

Swagger доступен на `/docs`, OpenAPI schema - на `/openapi.json`.

### Авторизация

Пользователи имеют роли:

- `ADMIN`
- `OPERATOR`
- `MANAGER`

Административные CRUD endpoints обычно защищены `require_admin`. Операторские endpoints используют текущего пользователя из JWT и проверяют роль через dependencies.

### Очередь и статусы талонов

Актуальные статусы заданы в `backend/app/core/enums.py`:

- `WAITING`
- `CALLED`
- `COMPLETED`
- `SKIPPED`
- `CANCELLED`

При изменении статуса нужно проверять не только модель `Ticket`, но и:

- `ticket_events` для аудита;
- WebSocket-уведомления в `app/realtime.py`;
- публичное табло `/public/queue-display`;
- operator UI в `frontend/src/pages/dashboard`;
- тесты `backend/tests/test_ticket_*`.

### Миграции

Backend-контейнер запускает миграции автоматически через `backend/docker-entrypoint.sh`.

Для локальной разработки:

```powershell
cd backend
alembic upgrade head
```

Создание новой миграции:

```powershell
cd backend
alembic revision --autogenerate -m "short_description"
```

После генерации миграцию нужно прочитать вручную. Autogenerate не всегда корректно определяет enum, server defaults, индексы и сложные изменения типов.

### Тесты backend

```powershell
cd backend
pip install -r requirements-test.txt
pytest
```

Тестовая конфигурация находится в `backend/pytest.ini`, фикстуры - в `backend/tests/conftest.py`.

## Frontend

### Структура

| Путь | Назначение |
| --- | --- |
| `frontend/src/app` | Инициализация приложения и роутинг |
| `frontend/src/features/auth` | API и типы авторизации |
| `frontend/src/features/admin` | Клиент административного API |
| `frontend/src/features/public` | Клиент публичного API |
| `frontend/src/pages/auth` | Страница входа |
| `frontend/src/pages/dashboard` | Админка и рабочее место оператора |
| `frontend/src/pages/public-ticket` | Публичная выдача талона |
| `frontend/src/pages/queue-display` | Общее табло очереди |
| `frontend/src/pages/operator-second-display` | Второе табло оператора |
| `frontend/src/shared` | Общие UI-компоненты, API client, token storage |

### Роутинг

Роутинг реализован внутри `frontend/src/app/AppRouter.tsx` без отдельной router-библиотеки.

Основные URL:

- `/` - вход;
- `/{lang}/admin/services` - админка;
- `/{lang}/admin/my-window` - рабочее окно оператора;
- `/{lang}/admin/reception` - регистратура;
- `/{lang}/admin/analytics` - аналитика;
- `/{lang}/admin/operator-display?fullscreen=1` - второе табло оператора;
- `/{lang}/queue-display` - общее табло.

Поддерживаемые языки в UI:

- `ru`
- `kk`
- `en`

В коде также встречается legacy-префикс `kz`, который приводится к `kk`.

### API base URL

`frontend/src/shared/config/env.ts` использует:

```text
VITE_API_BASE_URL=/api
VITE_API_WS_BASE_URL=derived from VITE_API_BASE_URL
```

В dev-режиме Vite проксирует `/api` на `VITE_PROXY_TARGET` или `http://localhost:8000`.

## Desktop-клиенты

### `operator-desktop`

Electron-приложение для оператора. UI общается с backend через Electron IPC. Основные команды:

```powershell
cd operator-desktop
npm install
npm run dev
npm run build
npm run package
```

Конфигурация:

```ini
ServerUrl=http://192.168.115.12
ApiBaseUrl=http://192.168.115.12/api
DisplayUrl=http://192.168.115.12/ru/admin/operator-display?fullscreen=1
MonitorIndex=2
DisplayMode=Kiosk
DisplayScale=0.9
DisplayAutoFit=true
FullScreen=false
RefreshSeconds=5
Browser=Auto
RememberEmail=true
```

### `terminal-desktop`

Electron kiosk для выдачи и печати талонов. Electron закреплен на версии `22.3.27`, потому что эта ветка поддерживает Windows 7/8/8.1.

Основные команды:

```powershell
cd terminal-desktop
npm install
npm run dev
npm run build
npm run package
```

Конфигурация:

```ini
ApiBaseUrl=http://192.168.115.12:8000
PrinterName=
FullScreen=true
ReceiptWidthMm=80
ReceiptBottomFeedMm=5
AutoResetSeconds=30
```

Если `PrinterName` пустой, используется принтер Windows по умолчанию.

## Docker и nginx

`docker-compose.yml` поднимает:

- `backend` на `8000`;
- `frontend` на `5173`;
- `postgres` на `5432`;
- `redis` на `6379`;
- `kafka` на `9092`;
- `nginx` на `80`.

`nginx/nginx.conf` проксирует:

- `/api/` в `backend:8000`;
- все остальное во `frontend:5173`;
- WebSocket upgrade headers для realtime endpoints.

## База данных

Источник истины для схемы:

1. SQLAlchemy-модели в `backend/app/models`.
2. Alembic-миграции в `backend/alembic/versions`.
3. Импорт моделей в `backend/app/db/models.py`, чтобы Alembic видел metadata.

При добавлении новой таблицы:

1. Создайте модель в `backend/app/models`.
2. Добавьте импорт в `backend/app/db/models.py`.
3. Создайте Pydantic-схемы в `backend/app/schemas`.
4. Добавьте сервис/репозиторий, если нужна бизнес-логика.
5. Добавьте router в `backend/app/api`.
6. Подключите router в `backend/app/main.py`.
7. Сгенерируйте и проверьте миграцию.
8. Добавьте тесты.

## Realtime

Realtime-слой находится в:

- `backend/app/realtime.py`;
- `backend/app/api/realtime/routes.py`;
- `frontend/src/shared/hooks/useTicketCallSound.ts`;
- страницы табло и рабочего окна оператора.

Если меняется payload события, нужно синхронно обновить backend schemas/services и frontend types/API clients.

## Правила разработки

- Не храните реальные секреты в репозитории.
- Любое изменение модели БД сопровождайте Alembic-миграцией.
- Любое изменение API-контракта сопровождайте обновлением TypeScript-типов/клиентов во frontend.
- Статусы талонов меняйте осторожно: они используются backend-сервисами, аналитикой, табло и desktop-клиентами.
- Перед merge проверяйте минимум backend tests и frontend build.
- Не используйте `DB.MD` как единственный источник истины, если он расходится с моделями и миграциями.

## Частые команды

```powershell
# Запустить весь стек
docker compose up -d --build

# Посмотреть контейнеры
docker compose ps

# Логи backend
docker compose logs --tail=80 backend

# Применить миграции локально
cd backend
alembic upgrade head

# Запустить backend tests
cd backend
pytest

# Собрать frontend
cd frontend
npm run build

# Собрать operator desktop
cd operator-desktop
npm run package

# Собрать terminal desktop
cd terminal-desktop
npm run package
```

## Troubleshooting

### Backend не стартует

Проверьте:

- доступность PostgreSQL;
- корректность `DATABASE_URL`;
- логи миграций `docker compose logs backend`;
- что все новые модели импортированы в `backend/app/db/models.py`.

### Frontend получает 404 или CORS

В Docker используйте nginx или Vite proxy. В локальном frontend проверьте:

```text
VITE_PROXY_TARGET=http://localhost:8000
```

Для production-like сценария frontend должен ходить на `/api`, а nginx должен проксировать этот prefix в backend.

### WebSocket не обновляет табло

Проверьте:

- endpoint `/ws/queue-display` или `/ws/my-window`;
- nginx headers `Upgrade` и `Connection`;
- что frontend строит `VITE_API_WS_BASE_URL` из правильного API base URL;
- backend logs при подключении клиента.

### Не печатает терминал

Проверьте:

- `PrinterName` в `terminal.config`;
- принтер Windows по умолчанию;
- ширину бумаги 80 мм в настройках драйвера;
- что `ApiBaseUrl` указывает на backend API, а не на web frontend.
