# Документация базы данных
# Проект: Электронная очередь приемной комиссии ВУЗа

---

# Содержание

1. Общая информация  
2. Архитектура БД  
3. Таблица users  
4. Таблица operators  
5. Таблица windows  
6. Таблица services  
7. Таблица applicants  
8. Таблица appointments  
9. Таблица tickets  
10. Таблица ticket_events  
11. Таблица notifications  
12. Таблица queue_snapshots  
13. Статусы талонов  
14. Индексы  
15. Связи таблиц  
16. Рекомендации по развитию  

---

# 1. Общая информация

## Назначение БД

База данных предназначена для:
- хранения информации об абитуриентах;
- хранения очередей;
- управления талонами;
- хранения логов;
- аналитики;
- realtime отображения очереди;
- интеграции с Telegram и другими сервисами.

---

# 2. Архитектура БД

## Основные сущности

| Таблица | Назначение |
|---|---|
| users | Пользователи системы |
| operators | Операторы приемной комиссии |
| windows | Окна обслуживания |
| services | Категории услуг |
| applicants | Абитуриенты |
| appointments | Онлайн-запись |
| tickets | Талоны очереди |
| ticket_events | История изменений талонов |
| notifications | Уведомления |
| queue_snapshots | Аналитика очередей |

---

# 3. Таблица users

## Назначение

Хранение пользователей системы:
- администраторы;
- операторы;
- менеджеры.

---

## SQL

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Описание полей

| Поле | Тип | Описание |
|---|---|---|
| id | UUID | Уникальный идентификатор пользователя |
| full_name | VARCHAR(255) | Полное имя сотрудника |
| email | VARCHAR(255) | Email для входа |
| password_hash | TEXT | Хеш пароля |
| role | VARCHAR(50) | Роль пользователя |
| is_active | BOOLEAN | Активен ли аккаунт |
| created_at | TIMESTAMP | Дата создания |

---

## Возможные роли

```text
ADMIN
OPERATOR
MANAGER
```

---

# 4. Таблица operators

## Назначение

Дополнительная информация об операторах.

---

## SQL

```sql
CREATE TABLE operators (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    window_id UUID,
    status VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Описание полей

| Поле | Тип | Описание |
|---|---|---|
| id | UUID | ID оператора |
| user_id | UUID | Связь с users |
| window_id | UUID | Назначенное окно |
| status | VARCHAR(50) | Статус оператора |
| created_at | TIMESTAMP | Дата создания |

---

## Статусы операторов

```text
ONLINE
OFFLINE
BUSY
BREAK
```

---

# 5. Таблица windows

## Назначение

Окна обслуживания абитуриентов.

---

## SQL

```sql
CREATE TABLE windows (
    id UUID PRIMARY KEY,
    name VARCHAR(100),
    code VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE
);
```

---

## Описание полей

| Поле | Тип | Описание |
|---|---|---|
| id | UUID | ID окна |
| name | VARCHAR(100) | Название окна |
| code | VARCHAR(50) | Код окна |
| is_active | BOOLEAN | Активно ли окно |

---

## Примеры

| name | code |
|---|---|
| Окно 1 | WIN-1 |
| Магистратура | MASTER-1 |

---

# 6. Таблица services

## Назначение

Категории услуг.

---

## SQL

```sql
CREATE TABLE services (
    id UUID PRIMARY KEY,
    name VARCHAR(255),
    code VARCHAR(50),
    priority INTEGER DEFAULT 0,
    estimated_duration INTEGER,
    is_active BOOLEAN DEFAULT TRUE
);
```

---

## Описание полей

| Поле | Тип | Описание |
|---|---|---|
| id | UUID | ID услуги |
| name | VARCHAR(255) | Название услуги |
| code | VARCHAR(50) | Код услуги |
| priority | INTEGER | Приоритет услуги |
| estimated_duration | INTEGER | Среднее время обслуживания в минутах |
| is_active | BOOLEAN | Доступна ли услуга |

---

## Примеры услуг

| name | code |
|---|---|
| Консультация | CONSULT |
| Подача документов | DOCS |
| Магистратура | MASTER |
| Общежитие | DORM |

---

# 7. Таблица applicants

## Назначение

Информация об абитуриентах.

---

## SQL

```sql
CREATE TABLE applicants (
    id UUID PRIMARY KEY,
    full_name VARCHAR(255),
    iin VARCHAR(12) UNIQUE,
    phone VARCHAR(20),
    telegram_chat_id BIGINT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Описание полей

| Поле | Тип | Описание |
|---|---|---|
| id | UUID | ID абитуриента |
| full_name | VARCHAR(255) | Полное имя |
| iin | VARCHAR(12) | ИИН |
| phone | VARCHAR(20) | Номер телефона |
| telegram_chat_id | BIGINT | Telegram Chat ID |
| created_at | TIMESTAMP | Дата регистрации |

---

# 8. Таблица appointments

## Назначение

Онлайн-запись на определенное время.

---

## SQL

```sql
CREATE TABLE appointments (
    id UUID PRIMARY KEY,
    applicant_id UUID REFERENCES applicants(id),
    service_id UUID REFERENCES services(id),
    appointment_date DATE,
    appointment_time TIME,
    status VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Описание полей

| Поле | Тип | Описание |
|---|---|---|
| id | UUID | ID записи |
| applicant_id | UUID | Абитуриент |
| service_id | UUID | Услуга |
| appointment_date | DATE | Дата записи |
| appointment_time | TIME | Время записи |
| status | VARCHAR(50) | Статус записи |
| created_at | TIMESTAMP | Дата создания |

---

## Статусы записи

```text
BOOKED
CONFIRMED
CANCELLED
COMPLETED
EXPIRED
```

---

# 9. Таблица tickets

## Назначение

Главная таблица системы.

Хранит:
- электронные талоны;
- статусы очереди;
- время обслуживания;
- связи с операторами.

---

## SQL

```sql
CREATE TABLE tickets (
    id UUID PRIMARY KEY,
    applicant_id UUID REFERENCES applicants(id),
    service_id UUID REFERENCES services(id),
    operator_id UUID REFERENCES operators(id),
    window_id UUID REFERENCES windows(id),

    ticket_number VARCHAR(50),
    queue_number INTEGER,

    priority INTEGER DEFAULT 0,

    status VARCHAR(50),

    estimated_wait INTEGER,

    created_at TIMESTAMP DEFAULT NOW(),
    called_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP
);
```

---

## Описание полей

| Поле | Тип | Описание |
|---|---|---|
| id | UUID | ID талона |
| applicant_id | UUID | Абитуриент |
| service_id | UUID | Тип услуги |
| operator_id | UUID | Оператор |
| window_id | UUID | Окно обслуживания |
| ticket_number | VARCHAR(50) | Номер талона |
| queue_number | INTEGER | Номер в очереди |
| priority | INTEGER | Приоритет |
| status | VARCHAR(50) | Статус талона |
| estimated_wait | INTEGER | Примерное ожидание в минутах |
| created_at | TIMESTAMP | Время создания |
| called_at | TIMESTAMP | Время вызова |
| started_at | TIMESTAMP | Начало обслуживания |
| completed_at | TIMESTAMP | Завершение обслуживания |

---

# 10. Таблица ticket_events

## Назначение

Полный audit trail системы.

Фиксирует:
- изменение статусов;
- вызовы;
- пропуски;
- действия операторов.

---

## SQL

```sql
CREATE TABLE ticket_events (
    id UUID PRIMARY KEY,
    ticket_id UUID REFERENCES tickets(id),

    event_type VARCHAR(100),

    old_status VARCHAR(50),
    new_status VARCHAR(50),

    operator_id UUID,

    metadata JSONB,

    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Описание полей

| Поле | Тип | Описание |
|---|---|---|
| id | UUID | ID события |
| ticket_id | UUID | Связь с талоном |
| event_type | VARCHAR(100) | Тип события |
| old_status | VARCHAR(50) | Старый статус |
| new_status | VARCHAR(50) | Новый статус |
| operator_id | UUID | Оператор |
| metadata | JSONB | Дополнительные данные |
| created_at | TIMESTAMP | Время события |

---

## Примеры event_type

```text
TICKET_CREATED
TICKET_CALLED
TICKET_SKIPPED
TICKET_COMPLETED
STATUS_CHANGED
```

---

# 11. Таблица notifications

## Назначение

Хранение уведомлений.

---

## SQL

```sql
CREATE TABLE notifications (
    id UUID PRIMARY KEY,

    applicant_id UUID REFERENCES applicants(id),
    ticket_id UUID REFERENCES tickets(id),

    type VARCHAR(50),
    payload JSONB,

    status VARCHAR(50),

    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Описание полей

| Поле | Тип | Описание |
|---|---|---|
| id | UUID | ID уведомления |
| applicant_id | UUID | Абитуриент |
| ticket_id | UUID | Талон |
| type | VARCHAR(50) | Тип уведомления |
| payload | JSONB | Содержимое |
| status | VARCHAR(50) | Статус |
| sent_at | TIMESTAMP | Время отправки |
| created_at | TIMESTAMP | Время создания |

---

## Типы уведомлений

```text
TELEGRAM
SMS
EMAIL
PUSH
```

---

# 12. Таблица queue_snapshots

## Назначение

Хранение аналитики очередей.

---

## SQL

```sql
CREATE TABLE queue_snapshots (
    id UUID PRIMARY KEY,

    queue_size INTEGER,
    active_windows INTEGER,
    waiting_avg INTEGER,

    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Описание полей

| Поле | Тип | Описание |
|---|---|---|
| id | UUID | ID snapshot |
| queue_size | INTEGER | Размер очереди |
| active_windows | INTEGER | Количество активных окон |
| waiting_avg | INTEGER | Среднее ожидание |
| created_at | TIMESTAMP | Время фиксации |

---

# 13. Статусы талонов

```text
NEW
WAITING
CALLED
IN_PROGRESS
COMPLETED
SKIPPED
CANCELLED
EXPIRED
```

---

## Описание статусов

| Статус | Описание |
|---|---|
| NEW | Только создан |
| WAITING | Ожидает вызова |
| CALLED | Вызван |
| IN_PROGRESS | Обслуживается |
| COMPLETED | Завершен |
| SKIPPED | Пропущен |
| CANCELLED | Отменен |
| EXPIRED | Истек |

---

# 14. Индексы

## Обязательные индексы

```sql
CREATE INDEX idx_tickets_status
ON tickets(status);

CREATE INDEX idx_tickets_created_at
ON tickets(created_at);

CREATE INDEX idx_ticket_events_ticket
ON ticket_events(ticket_id);

CREATE INDEX idx_applicants_iin
ON applicants(iin);
```

---

## Назначение индексов

| Индекс | Назначение |
|---|---|
| idx_tickets_status | Быстрый поиск очереди |
| idx_tickets_created_at | Сортировка по времени |
| idx_ticket_events_ticket | Быстрый audit |
| idx_applicants_iin | Быстрый поиск абитуриента |

---

# 15. Связи таблиц

```text
users
 └── operators

operators
 └── tickets

windows
 └── tickets

services
 ├── appointments
 └── tickets

applicants
 ├── appointments
 ├── tickets
 └── notifications

tickets
 ├── ticket_events
 └── notifications
```

---

# 16. Рекомендации по развитию

## Рекомендуется добавить

### service_groups
Группы услуг.

---

### operator_services
Какие услуги умеет обрабатывать оператор.

---

### audit_logs
Общий системный audit.

---

### file_storage
Документы абитуриентов.

---

### outbox_events
Для надежной отправки уведомлений.

---

# Конец документа