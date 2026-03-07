# Domain

## Read Models

### [ItemReadModel](../domain/read-models/item.read-model.ts)

Основная проекция товара. Денормализованные данные извлекаются из виджетов при проекции события. Все блоки виджетов optional — зависят от типа товара и наличия виджета.

`ItemOwner` содержит `organizationId` (владелец-организация). Данные owner денормализованы в item для быстрого отображения.

**Projection:** `projectItemFromEvent(ItemPublishedEvent)` → `ItemReadModel` — извлекает данные из массива виджетов.

### [CategoryReadModel](../domain/read-models/category.read-model.ts)

Хранит узел дерева категорий. `ancestorIds` — путь от корня для эффективного показа товара в родительских категориях.

**Projection:** `projectCategory(CategoryPublishedEvent)` → `CategoryReadModel`.

### [CategoryListReadModel](../domain/read-models/category-list.read-model.ts)

Список дочерних категорий для каталога. Запрос: по parentCategoryId (null = корневые).

### [CategoryFiltersReadModel](../domain/read-models/category-filters.read-model.ts)

Доступные фильтры для страницы категории. Строится на основе атрибутов категории (+ унаследованных) и параметров допустимых типов.

### [AttributeReadModel](../domain/read-models/attribute.read-model.ts)

Атрибут категории. Наследуется дочерними категориями. Определяет фильтры в каталоге.

**Projection:** `projectAttributes(categoryId, CategoryAttribute[], now)` → `AttributeReadModel[]`.

### [ItemTypeReadModel](../domain/read-models/item-type.read-model.ts)

Тип товара. Определяет доступные и обязательные виджеты. `WidgetType` импортируется из `@/kernel/domain/vo/widget.js`.

**Projection:** `projectItemType(ItemTypeCreatedEvent | ItemTypeUpdatedEvent)` → `ItemTypeReadModel`.

### [OwnerReadModel](../domain/read-models/owner.read-model.ts)

Отдельная read model владельца — нужна для обновления данных владельца (рейтинг, имя) независимо от товаров. Discovery маппит организации и пользователей в единую модель.

**Projection:**
- `projectOwnerFromOrganization(OrganizationPublishedEvent)` → `OwnerReadModel`
- `projectOwnerFromUser(UserCreatedEvent | UserUpdatedEvent)` → `OwnerReadModel`

### [ItemListView](../domain/read-models/item-list-view.read-model.ts)

Карточка товара для списка / ленты. Проекция `ItemReadModel` → view через [toListView](../domain/mappers/item-list-view.mapper.ts).

### [LikedItemView](../domain/read-models/liked-item-view.read-model.ts)

Карточка лайкнутого товара. Расширяет `ItemListView` временем лайка.

### [SearchFacets](../domain/read-models/search-result.read-model.ts)

Фасеты поиска — доступные фильтры с количеством значений в текущей выборке.

### [PostRankingCandidate](../domain/read-models/post-ranking-candidate.read-model.ts)

Лёгкие метаданные кандидата для пост-ранкинга (без полного `ItemReadModel`). Используется в `GetCategoryItems` для ранкинга 500 кандидатов без загрузки полных данных.

### Связи между read models

```
ItemReadModel
  ├── typeId                       → ItemTypeReadModel
  ├── category.categoryIds[]       → CategoryReadModel
  ├── owner.organizationId         → OwnerReadModel (данные денормализованы в item)
  └── category.attributeValues[].attributeId → AttributeReadModel

CategoryReadModel
  ├── parentCategoryId             → CategoryReadModel (self)
  └── allowedTypeIds[]             → ItemTypeReadModel

CategoryListReadModel               — проекция CategoryReadModel для UI каталога
CategoryFiltersReadModel            — собирается из AttributeReadModel + ItemTypeReadModel + ItemReadModel

AttributeReadModel
  └── categoryId                   → CategoryReadModel
```

Связи логические (без FK constraints в PG). При обновлении OwnerReadModel — данные owner во всех связанных ItemReadModel обновляются через обработку Kafka-события владельца (денормализация).

## Mappers

### [toListView](../domain/mappers/item-list-view.mapper.ts)

`ItemReadModel` → `ItemListView`. Переиспользуется всеми interactors, возвращающими списки товаров.

### [toRankingCandidate](../domain/mappers/post-ranking-candidate.mapper.ts)

`ItemReadModel` → `PostRankingCandidate`. Используется в `GetFeed` для маппинга перед вызовом `PostRankingService`.

## Kernel Events

Domain events определены в kernel и приходят через Kafka. Виджеты и связанные VO вынесены в [@/kernel/domain/vo/widget.ts](../../../kernel/domain/vo/widget.ts).

### Item events — [item.events.ts](../../../kernel/domain/events/item.events.ts)
- `ItemPublishedEvent` — публикация товара с виджетами. `republished: true` = повторная публикация (обновление данных после модерации).
- `ItemUnpublishedEvent` — снятие с публикации.

### Category events — [category.events.ts](../../../kernel/domain/events/category.events.ts)
- `CategoryPublishedEvent` — публикация категории с атрибутами. `republished: true` = обновление.
- `CategoryUnpublishedEvent` — удаление категории.

### Item type events — [item-type.events.ts](../../../kernel/domain/events/item-type.events.ts)
- `ItemTypeCreatedEvent`, `ItemTypeUpdatedEvent`

### Organization events — [organization.events.ts](../../../kernel/domain/events/organization.events.ts)
- `OrganizationPublishedEvent` — публикация организации. `republished: true` = обновление данных.
- `OrganizationUnpublishedEvent` — снятие с публикации.

### User events — [user.events.ts](../../../kernel/domain/events/user.events.ts)
- `UserCreatedEvent`, `UserUpdatedEvent`, `UserDeletedEvent`

### Review events — [review.events.ts](../../../kernel/domain/events/review.events.ts)
- `ReviewCreatedEvent`, `ReviewDeletedEvent` — содержат `ReviewTarget` (item или organization) и pre-computed `newRating` + `newReviewCount`.

### Interaction events — [interaction.events.ts](../../../kernel/domain/events/interaction.events.ts)
- `InteractionRecordedEvent` — взаимодействие пользователя с товаром. `InteractionType`: `view`, `click`, `like`, `unlike`, `purchase`, `booking`.

**Веса для Gorse** (влияние на рекомендации):
| Тип | Вес | Описание |
|------|-----|----------|
| `view` | 1 | Пользователь открыл детальную страницу товара |
| `click` | 2 | Клик на карточку в списке / ленте |
| `like` | 4 | Лайк товара (сохранение) |
| `purchase` | 8 | Покупка товара |
| `booking` | 8 | Запись на услугу |

**Like** дополнительно сохраняется в read model для отображения лайкнутых товаров (GetLikedItems). **Unlike** удаляет лайк из read model и feedback из Gorse.

## Services

### [PostRankingService](../domain/services/post-ranking.service.ts)

Чистая доменная логика (без портов, без IO). Принимает ранжированный список `PostRankingCandidate[]`, применяет правила последовательно, возвращает переупорядоченный список. Подробнее — см. [Post-Ranking](./application.md#post-ranking).

## Errors

### [ServiceNotFoundError](../domain/errors.ts)

## Aggregates

Модуль — read model, агрегатов нет.
