# Domain

## Read Models

### [ItemReadModel](../domain/read-models/item.read-model.ts)

Основная проекция товара. Денормализованные данные извлекаются из виджетов при проекции события. Все блоки виджетов optional — зависят от типа товара и наличия виджета.

### [CategoryReadModel](../domain/read-models/category.read-model.ts)

Хранит узел дерева категорий. `ancestorIds` — путь от корня для эффективного показа товара в родительских категориях.

### [CategoryListReadModel](../domain/read-models/category-list.read-model.ts)

Список дочерних категорий для каталога. Запрос: по parentCategoryId (null = корневые).

### [CategoryFiltersReadModel](../domain/read-models/category-filters.read-model.ts)

Доступные фильтры для страницы категории. Строится на основе атрибутов категории (+ унаследованных) и параметров допустимых типов.

### [AttributeReadModel](../domain/read-models/attribute.read-model.ts)

Атрибут категории. Наследуется дочерними категориями. Определяет фильтры в каталоге.

### [ProductTypeReadModel](../domain/read-models/product-type.read-model.ts)

Тип товара. Определяет доступные и обязательные виджеты.

### [OwnerReadModel](../domain/read-models/owner.read-model.ts)

Отдельная read model владельца — нужна для обновления данных владельца (рейтинг, имя) независимо от товаров.

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
  ├── typeId                 → ProductTypeReadModel
  ├── category.categoryIds[] → CategoryReadModel
  ├── owner.ownerId          → OwnerReadModel (данные денормализованы в item)
  └── category.attributeValues[].attributeId → AttributeReadModel

CategoryReadModel
  ├── parentCategoryId       → CategoryReadModel (self)
  └── allowedTypeIds[]       → ProductTypeReadModel

CategoryListReadModel         — проекция CategoryReadModel для UI каталога
CategoryFiltersReadModel      — собирается из AttributeReadModel + ProductTypeReadModel + ItemReadModel

AttributeReadModel
  └── categoryId             → CategoryReadModel
```

Связи логические (без FK constraints в PG). При обновлении OwnerReadModel — данные owner во всех связанных ItemReadModel обновляются через обработку Kafka-события владельца (денормализация).

## Mappers

### [toListView](../domain/mappers/item-list-view.mapper.ts)

`ItemReadModel` → `ItemListView`. Переиспользуется всеми interactors, возвращающими списки товаров.

### [toRankingCandidate](../domain/mappers/post-ranking-candidate.mapper.ts)

`ItemReadModel` → `PostRankingCandidate`. Используется в `GetFeed` для маппинга перед вызовом `PostRankingService`.

## Events

### [UserInteractionEvent](../domain/events/user-interaction.event.ts)

Доменные события взаимодействия пользователя с товаром. Используются для обучения Gorse и хранения лайков. Источник событий будет определён позже — здесь описан формат.

**Веса для Gorse** (влияние на рекомендации):
| Тип | Вес | Описание |
|------|-----|----------|
| `view` | 1 | Пользователь открыл детальную страницу товара |
| `click` | 2 | Клик на карточку в списке / ленте |
| `like` | 4 | Лайк товара (сохранение) |
| `purchase` | 8 | Покупка товара |
| `booking` | 8 | Запись на услугу |

**Like** дополнительно сохраняется в read model для отображения лайкнутых товаров (GetLikedItems).

## Services

### [PostRankingService](../domain/services/post-ranking.service.ts)

Чистая доменная логика (без портов, без IO). Принимает ранжированный список `PostRankingCandidate[]`, применяет правила последовательно, возвращает переупорядоченный список. Подробнее — см. [Post-Ranking](./application.md#post-ranking).

## Errors

### [ServiceNotFoundError](../domain/errors.ts)

## Aggregates

Модуль — read model, агрегатов нет.
