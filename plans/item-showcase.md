# Feature: Item Showcase (Просмотр товара)

## Концепция

Расширение Discovery для отображения детальной страницы товара. Discovery остаётся **read-only витриной** — отдаёт полные данные виджетов. Клиент сам определяет UI и доступные действия по типам виджетов. Механизмы действий (booking, checkout, reviews) — отдельные фичи.

---

## Ключевые решения

### Discovery, не отдельная фича

Данные уже спроецированы в `ItemReadModel`. Detail view — другой маппер над теми же данными. Отдельная фича не оправдана: нет своего домена, нет write-операций, нет агрегатов.

### Сервер отдаёт данные, клиент решает что рисовать

Сервер **не резолвит actions и не определяет кнопки**. Клиент получает массив виджетов с полными данными и сам знает:
- `schedule` → кнопка "Записаться" → `POST /booking/slots`
- `payment` (strategy=one-time, price=1500) → "Купить за 1500 руб." → `POST /orders`
- `location` → карта + "Как добраться"
- и т.д.

### ItemWidgetView — публичная проекция виджета

`ItemWidget` из kernel содержит сырые внутренние данные. Со временем в виджетах могут появиться приватные поля организации (токены интеграций, внутренние конфиги). `ItemWidgetView` — это публичный контракт API:
- Убирает приватные/внутренние поля
- Является стабильным контрактом — не ломается при изменении внутреннего `ItemWidget`
- Маппинг `ItemWidget → ItemWidgetView` — явный и контролируемый

### Разница list view vs detail view

| | List View (`ItemListView`) | Detail View (`ItemDetailView`) |
|---|---|---|
| Данные | Обрезанные: title, price, rating, owner name | Полные: все виджеты через `ItemWidgetView[]` |
| Формат | Плоская структура | Массив типизированных виджетов |
| Где используется | Лента, поиск, категории | Страница товара |

---

## Типы данных

### ItemDetailView

```typescript
type ItemDetailView = {
  itemId: ItemId;
  typeId: TypeId;
  widgets: ItemWidgetView[];
  publishedAt: Date;
};
```

### ItemWidgetView

Публичная проекция каждого виджета. Discriminated union по `type`:

```typescript
type ItemWidgetView =
  | { type: 'base-info'; title: string; description: string; imageId: FileId | null }
  | { type: 'age-group'; value: AgeGroup }
  | { type: 'location'; cityId: string; lat: number; lng: number; address: string | null }
  | { type: 'payment'; strategy: PaymentStrategy; price: number | null }
  | { type: 'category'; categoryIds: CategoryId[] }
  | { type: 'owner'; organizationId: OrganizationId; name: string; avatarId: FileId | null }
  | { type: 'item-review'; rating: number | null; reviewCount: number }
  | { type: 'owner-review'; rating: number | null; reviewCount: number }
  | { type: 'event-date-time'; dates: string[] }
  | { type: 'schedule'; entries: ScheduleEntry[] };
```

Сейчас `ItemWidgetView` почти совпадает с `ItemWidget`, но это **отдельный тип** — при добавлении приватных полей в kernel-виджеты публичный контракт не сломается.

---

## Структура файлов

```
src/features/discovery/
  domain/
    read-models/
      item-detail-view.read-model.ts         # ItemDetailView, ItemWidgetView
    mappers/
      item-detail-view.mapper.ts             # toDetailView(ItemReadModel) → ItemDetailView

  application/
    use-cases/
      view-item/
        get-item-detail.interactor.ts        # use case: загрузить item, замаппить
        get-item-detail.request.ts           # { itemId }

  adapters/
    http/
      item-detail.controller.ts              # GET /discovery/items/:id
      dto/
        item-detail.response.ts              # OpenAPI response DTO
```

---

## Задачи

### Фаза 1 — Detail View

- [ ] **1.1** Создать типы `ItemDetailView` и `ItemWidgetView` в `domain/read-models/item-detail-view.read-model.ts`
- [ ] **1.2** Реализовать `toDetailView(ItemReadModel) → ItemDetailView` — маппер, собирающий `ItemWidgetView[]` из optional-полей read model
- [ ] **1.3** Добавить метод `findById(tx, itemId)` в существующий query-порт (или создать новый если нужно)
- [ ] **1.4** Реализовать DB-адаптер для загрузки полного item по ID (со всеми связанными таблицами: schedules, event_dates, categories, attributes)
- [ ] **1.5** Реализовать `GetItemDetailInteractor` — загрузка + маппинг
- [ ] **1.6** Создать response DTO для OpenAPI
- [ ] **1.7** Создать `ItemDetailController` — `GET /discovery/items/:id`
- [ ] **1.8** Зарегистрировать в `discovery.module.ts`

### Фаза 2 — E2E тесты

- [ ] **2.1** Тест: detail view опубликованного товара — все виджеты с полными данными
- [ ] **2.2** Тест: товар не найден → 404
- [ ] **2.3** Тест: разные itemType → разный набор виджетов в ответе

---

## Будущее: кастомные виджеты

Когда понадобится интеграция с внешними системами записи:

```typescript
// Расширение в kernel
export type CustomWidget = {
  type: 'custom';
  customType: string;                // 'external-booking' | 'telegram-bot'
  config: Record<string, unknown>;   // приватный конфиг организации (НЕ попадает в ItemWidgetView)
  renderUrl?: string;                // публичный URL для iframe/webview
};

// Публичная проекция — только то, что нужно клиенту
// В ItemWidgetView:
| { type: 'custom'; customType: string; renderUrl: string }   // config скрыт
```

---

## Связь с другими фичами

```
item.published (Kafka)
  ├── Discovery  → проецирует всё для витрины + detail view
  ├── Booking    → проецирует schedule/event-date-time (будущее)
  └── Checkout   → проецирует payment (будущее)

Client flow:
  1. GET /discovery/items/:id → { widgets: [...] }
  2. Клиент видит schedule widget → рисует "Записаться"
  3. POST /booking/slots { itemId, slotId } → отдельная фича
```

Feature никогда не импортирует другую feature. Коммуникация — через kernel events.
