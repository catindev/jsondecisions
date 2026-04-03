# Changelog

## [1.1.2] - 2026-04-03

Финальный патч по результатам второго раунда ревью `1.1.1`.

### Исправлено

- **`isPlainObject()` теперь является настоящей проверкой plain object.**
  Прежняя реализация (`val !== null && typeof val === 'object' && !Array.isArray(val)`)
  пропускала `Date`, `Map`, `Set`, `RegExp` и экземпляры пользовательских классов.
  Их передача в `run()` молча давала пустой набор фактов вместо `ABORT`.
  Новая реализация проверяет `Object.getPrototypeOf(val) === Object.prototype || === null`.
  `Object.create(null)` явно принимается - это валидный plain object без прототипа.

- **Удалена пустая функция `assert()` из `src/utils.js`.**
  Функция была нефункциональным артефактом и не экспортировалась ни в одну фазу.

### Тесты

- +17 тестов: `INVALID_FACTS_TYPE` для `Date`, `Map`, `RegExp`, class instance (+4),
  `Object.create(null)` как валидный вход (+1); `isPlainObject` unit-покрытие (+11)
  включая все пограничные случаи (null, array, Date, Map, RegExp, class, string, number,
  plain object, empty object, null-prototype).

## [1.1.1] - 2026-04-03

Патч-релиз по результатам ревью `1.1.0`. Все три пункта ниже это исправления,
не оптимизация. Без этих исправлений `1.1.0` не стоило выпускать в релиз.

### Исправлено

- **`UNREACHABLE_RULE` теперь корректно обрабатывает пустой `when: {}`.**
  Правило с пустым `when` совпадает с любыми фактами и субсумирует все следующие
  правила. В `1.1.0` условие `conditions.length > 0` исключало этот случай из
  проверки: компилятор молчал, хотя вся матрица за пустым правилом была мёртвой.
  Исправлено убиранием guard-а где пустое множество условий вакуумно удовлетворяет
  проверке подмножества, что формально верно.

- **`ABORT CONFLICTING_FACT_PATHS` — детерминизм facts.**
  Если `facts` содержал одновременно top-level dotted key (`"a.b"`) и вложенный
  объект по тому же первому сегменту (`a: { b: ... }`), `flattenFacts()` давал
  результат, зависящий от порядка ключей в объекте. Одни и те же логические данные
  при перестановке ключей могли дать разное решение. Теперь `run()` обнаруживает
  коллизию до вызова `flattenFacts()` и возвращает `ABORT` с кодом
  `CONFLICTING_FACT_PATHS` и `error.fact` это конфликтующий ключ.
  Добавлен `detectFlatNestedConflict()` в `src/utils.js`.

- **`ABORT INVALID_FACTS_TYPE` — строгий контракт типа `facts`.**
  Передача массива, числа, строки или любого не-объекта в `run()` ранее
  молча превращалась в пустой набор фактов через `flattenFacts(facts || {})`.
  Интеграционные ошибки маскировались вместо ранней диагностики.
  Теперь: `null` и `undefined` принимаются как `{}` (пустые факты),
  всё остальное не-plain-object возвращает `ABORT INVALID_FACTS_TYPE`.

### Прочее

- Deep-clone + freeze значений в `compiled.sources` при компиляции.
  Мутация `options.sources` после вызова `compile()` больше не влияет
  на диагностические данные в скомпилированном объекте.

- +19 тестов: empty-when субсумция (2), INVALID_FACTS_TYPE (5),
  CONFLICTING_FACT_PATHS (4), detectFlatNestedConflict unit (8).

## [1.1.0] - 2026-04-03

### Добавлено

- **Предупреждения компилятора** (`CompiledDecisions.warnings`).
  Компилятор теперь возвращает массив `CompilationWarningEntry[]` вместе с результатом
  компиляции. Предупреждения никогда не бросают исключение — они дополняют результат,
  не блокируя его.

- **`UNREACHABLE_RULE`** для статического анализа субсумции правил.
  Если правило A стоит раньше правила B, и все условия A являются подмножеством
  условий B, то B недостижимо при семантике `first_match_wins`. Компилятор выдаёт
  предупреждение с указанием обоих правил и их позиций.

- **`PATCH_PLAN_FROM_NOT_IN_REQUIRED_FACTS`** для контроля согласованности `patchPlanFrom`.
  Если правило читает факт через `patchPlanFrom`, но этот путь не объявлен
  в `requiredFacts`, то при его отсутствии рантайм молча вернёт `patchPlan: null`.
  Компилятор предупреждает об этой потенциально неочевидной ситуации.

- **`UNUSED_REQUIRED_FACT`** для контроля мёртвых объявлений в `requiredFacts`.
  Если путь объявлен в `requiredFacts`, но ни одно правило не использует его
  в условии `when`, компилятор предупреждает: либо объявление устарело, либо
  забыто условие.

- **Валидация путей в `when` и `requiredFacts`** добавлен новый код ошибки `INVALID_WHEN_PATH`
  и `INVALID_REQUIRED_FACT_PATH`. Пути с пустыми сегментами (`""`, `"."`, `"a..b"`,
  `"a."`) теперь отклоняются на этапе компиляции, а не проходят молча без шанса
  сработать в рантайме.

- **Ленивая аллокация `trace`** в рантайме. При `options.trace = false` массив
  трейса больше не аллоцируется, что снижает нагрузку на GC на высокочастотных путях.

### Изменено

- **Тип `CompiledDecisions`** дополнен полем `warnings: readonly CompilationWarningEntry[]`.
  Поле присутствует всегда пустой массив, если предупреждений нет.

- **Экспорт** `makeCompilationWarningEntry` добавлен в публичный API
  (для CLI и инструментального использования).

- **`index.d.ts`**: добавлен интерфейс `CompilationWarningEntry`, поле `warnings`
  в `CompiledDecisions`; удалено поле `entrypoint` (было в артефактах spec, но
  не влияло на поведение компилятора и рантайма — убрано как источник путаницы).

### Удалено

- Поле `entrypoint` из спецификации артефактов. Поле было передрано из `jsonspecs`
  без реального применения: вложенных decision-set не существует, `entrypoint: true`
  никак не влиял ни на компиляцию, ни на рантайм. Если поле присутствует в
  существующих артефактах, то оно молча игнорируется (компилятор не проверяет
  неизвестные поля).

### Исправлено

- Внутренняя константа `ALLOWED_WHEN_VALUE_TYPES` переименована в
  `SCALAR_WHEN_VALUE_TYPES` для соответствия её фактическому смыслу (`null`
  разрешён через отдельный guard, а не через эту константу).

## [1.0.0] - 2026-04-02

### Добавлено

- первая публичная реализация Node-библиотеки `jsondecisions`;
- `createEngine()`, `compile()`, `run()`;
- compile pipeline по фазам:
  - buildRegistry
  - validateSchema
  - validateRefs
  - buildDecisionSets
- рантайм с поддержкой:
  - `requiredFacts`
  - `missingFactPolicy`
  - `strict`
  - `patchPlanFrom`
  - `DecisionResult`
  - `trace`
- типы TypeScript в `index.d.ts`;
- структурированные compile-time ошибки `CompilationErrorEntry`;
- read-only façade для compiled collections;
- документация:
  - `README.md`
  - `docs/SPECIFICATION.md`
  - `docs/STRUCTURED_DIAGNOSTICS.md`
- CI workflow для GitHub Actions.

### Исправлено по сравнению с предыдущими версиями

- `patchPlanFrom` возвращает глубокую копию, а не shared reference;
- `compiled.registry` и `compiled.decisionSets` больше не отдаются наружу как живые мутируемые `Map`;
- `npm test` запускается корректно;
- acceptance tests отвязаны от жёстко зашитого локального `ref-project`;
- `flattenFacts()` усилен в части идемпотентности для dotted keys;
- `then.tags` валидируются поэлементно.

### Примечания

- beneficiary reference project живёт отдельно от репозитория библиотеки;
- `jsondecisions-cli` проектируется как отдельный репозиторий поверх библиотеки `jsondecisions`.
