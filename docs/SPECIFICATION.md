# JSONDecisions: Спецификация

> Поведение компилятора и среды исполнения нормативно определяется настоящим документом.

## Содержание

1. [Общие правила для всех артефактов](#1-общие-правила-для-всех-артефактов)
2. [Идентификаторы и видимость](#2-идентификаторы-и-видимость)
3. [Разрешение ссылок](#3-разрешение-ссылок)
4. [Артефакт: decision-rule](#4-артефакт-decision-rule)
   - 4.1 [Схема](#41-схема)
   - 4.2 [when — условная часть](#42-when--условная-часть)
   - 4.3 [then — результирующая часть](#43-then--результирующая-часть)
5. [Артефакт: decision-set](#5-артефакт-decision-set)
   - 5.1 [Схема](#51-схема)
   - 5.2 [requiredFacts — обязательный входной контракт](#52-requiredfacts--обязательный-входной-контракт)
   - 5.3 [strict — строгий режим](#53-strict--строгий-режим)
6. [Поведение компилятора](#6-поведение-компилятора)
7. [Поведение среды исполнения](#7-поведение-среды-исполнения)
8. [Формат DecisionResult](#8-формат-decisionresult)
   - 8.1 [Матрица полей по статусам](#81-матрица-полей-по-статусам)
   - 8.2 [Примеры ответов](#82-примеры-ответов)
9. [Формат trace](#9-формат-trace)
10. [Программный API](#10-программный-api)
11. [CLI](#11-cli)
12. [Структура проекта](#12-структура-проекта)
13. [Тестовые фикстуры](#13-тестовые-фикстуры)
14. [Версионирование](#14-версионирование)
15. [Отличия от jsonspecs](#15-отличия-от-jsonspecs)

---

## 1. Общие правила для всех артефактов

Каждый артефакт — самодостаточный JSON-объект, как правило один файл `.json`.
Все поля, перечисленные как обязательные, проверяются компилятором.
Отсутствие обязательного поля является ошибкой компиляции — `compile()` бросает
`CompilationError` с полным списком ошибок.

**Поля, обязательные для любого артефакта независимо от типа:**

| Поле          | Тип              | Обязательное | Описание                                 |
| ------------- | ---------------- | :----------: | ---------------------------------------- |
| `id`          | string, непустой |      да      | Уникальный идентификатор. Задаётся явно. |
| `type`        | string           |      да      | `"decision-rule"` или `"decision-set"`   |
| `description` | string, непустой |      да      | Описание в свободной форме.              |

Совпадение значений `id` у двух артефактов является ошибкой компиляции.

---

## 2. Идентификаторы и видимость

Идентификаторы используют пространства имён через точечную нотацию — идентично jsonspecs.

| Префикс         | Видимость                                          |
| --------------- | -------------------------------------------------- |
| `library.*`     | везде — из любого `decision-set` и `decision-rule` |
| `entrypoints.*` | вызывается как точка входа верхнего уровня         |
| `internal.*`    | только внутри текущего проекта                     |

**Правила видимости применяются компилятором в фазе 4 (`validateRefs`).**

`decision-set` с идентификатором `entrypoints.X.Y` может ссылаться на любое правило
с префиксом `library.*`, на любое правило с префиксом `entrypoints.X.Y.*`
(в пределах своего пространства имён) и на любое правило по абсолютному идентификатору
(межпространственная ссылка).

---

## 3. Разрешение ссылок

Когда `decision-set` перечисляет правила в массиве `rules`, каждая ссылка разрешается
по следующему алгоритму:

| Форма ссылки            | Поведение                                                      |
| ----------------------- | -------------------------------------------------------------- |
| Начинается с `library.` | абсолютная ссылка, используется как есть                       |
| Содержит `.`            | абсолютная ссылка, используется как есть                       |
| Не содержит `.`         | относительная ссылка: раскрывается в `{id decision-set}.{ref}` |

**Пример:** внутри `decision-set` с идентификатором `entrypoints.order.routing`
ссылка `"not_found"` раскрывается в `"entrypoints.order.routing.not_found"`.

---

## 4. Артефакт: decision-rule

### 4.1 Схема

| Поле          | Тип    | Обязательное | Описание                              |
| ------------- | ------ | :----------: | ------------------------------------- |
| `id`          | string |      да      | Уникальный идентификатор              |
| `type`        | string |      да      | `"decision-rule"`                     |
| `description` | string |      да      | Описание в свободной форме            |
| `when`        | object |      да      | Условная часть — см. раздел 4.2       |
| `then`        | object |      да      | Результирующая часть — см. раздел 4.3 |

**Пример:**

```json
{
  "id": "entrypoints.order.routing.not_found",
  "type": "decision-rule",
  "description": "Карточка не найдена в реестре — создать и привязать",
  "when": {
    "registry.findResult": "NOT_FOUND"
  },
  "then": {
    "decision": "CREATE_AND_BIND",
    "reason": "REGISTRY_CARD_NOT_FOUND"
  }
}
```

---

### 4.2 when - условная часть

#### Синтаксис v1: плоский объект, логическое AND

В версии 1 `when` это плоский JSON-объект, где каждый ключ это путь к факту в точечной нотации, а значение это требуемое точное значение.

Все условия вычисляются как логическое **AND**. Правило срабатывает только если **каждая** пара ключ-значение совпадает с соответствующим фактом.

**Поддерживаемые типы значений:** `string`, `number`, `boolean`, `null`.

```json
{
  "when": {
    "registry.findResult": "FOUND",
    "diff.fullMatch": true,
    "abs.hasActiveProducts": false
  }
}
```

#### Поведение при отсутствии факта

Если путь из `when` отсутствует в объекте `facts`, условие принимает значение `false` (правило не срабатывает).

Поведение регулируется полем `missingFactPolicy` в `decision-set`:

| `missingFactPolicy`   | Поведение при отсутствии пути                 |
| --------------------- | --------------------------------------------- |
| `"false"` (по умолч.) | условие равно `false`, правило не срабатывает |
| `"error"`             | `DecisionResult.status` = `"ABORT"`           |

#### Синтаксис v2 (запланирован, не входит в v1)

В версии 2 планируется поддержка явных групп `all` / `any` / `not`.

```json
{
  "when": {
    "all": [
      { "fact": "registry.findResult", "op": "eq", "value": "FOUND" },
      { "fact": "diff.hasCriticalMismatch", "op": "eq", "value": true }
    ],
    "any": [
      { "fact": "abs.createdBy", "op": "eq", "value": "OTHER_API_USER" },
      { "fact": "abs.createdBy", "op": "eq", "value": "SELF" }
    ]
  }
}
```

**Движок v1 обязан отклонять синтаксис v2** наличие ключей `all`, `any` или `not` в `when` является ошибкой компиляции в версии 1.

**Стратегия эволюции синтаксиса.** Расширение `when` в v2 производится только через введение явных ключей-операторов (`all`, `any`, `not`) в объект `when`. Новые режимы `mode`, дополнительные поля на уровне `decision-rule` и прочие структурные изменения для этой цели не вводятся. Движок определяет версию синтаксиса автоматически по наличию зарезервированных ключей. Это исключает появление переходных "маленьких операторов", расширяющих v1 в обход этого принципа.

---

### 4.3 then - результирующая часть

| Поле            | Тип      | Обязательное | Описание                                                                      |
| --------------- | -------- | ------------ | ----------------------------------------------------------------------------- |
| `decision`      | string   | да           | Код бизнес-исхода. Движок не интерпретирует значение.                         |
| `reason`        | string   | да           | Нормализованный код причины. Движок не интерпретирует значение.               |
| `patchPlanFrom` | string   | нет          | Путь к факту в точечной нотации. Значение по пути копируется в `patchPlan`.   |
| `metadata`      | object   | нет          | Произвольные пары ключ-значение. Передаются в `DecisionResult` без изменений. |
| `tags`          | string[] | нет          | Метки для диагностики и аналитики.                                            |

`decision` и `reason` это непрозрачные строки для движка. Их семантика полностью определяется потребителем результата (например, оркестратором).

`patchPlanFrom` это ссылка только для чтения на значение в `facts`. Движок читает значение по указанному пути и копирует его в `DecisionResult.patchPlan`.

**Контракт `patchPlanFrom`:**

- Значение копируется **как есть**, без валидации типа или структуры и может быть массивом, объектом или скаляром.
- Если путь отсутствует в `facts`, то `patchPlan: null`. Это **не** вызывает ABORT независимо от `missingFactPolicy`.
- `patchPlanFrom` никогда не является триггером `missingFactPolicy: "error"` и его отсутствие всегда молчаливо.
- Движок не вычисляет, не трансформирует и не интерпретирует скопированное значение.
- Если факт обязателен для данного правила, он должен быть объявлен в `requiredFacts` явно (см. раздел 5.2).

**Пример с patchPlanFrom:**

```json
{
  "then": {
    "decision": "ENRICH_AND_BIND",
    "reason": "FILL_EMPTY_FIELDS_ONLY",
    "patchPlanFrom": "diff.fillableEmptyFields",
    "tags": ["enrich_path", "partial_update"]
  }
}
```

---

## 5. Артефакт: decision-set

`decision-set` — точка входа для движка. Определяет упорядоченный список ссылок
на `decision-rule`, режим сопоставления, входной контракт и решение по умолчанию.

### 5.1 Схема

| Поле                | Тип      | Обязательное | По умолч. | Описание                                                                        |
| ------------------- | -------- | ------------ | --------- | ------------------------------------------------------------------------------- |
| `id`                | string   | да           | —         | Уникальный идентификатор                                                        |
| `type`              | string   | да           | —         | `"decision-set"`                                                                |
| `description`       | string   | да           | —         | Описание в свободной форме                                                      |
| `version`           | string   | да           | —         | Семантическая версия данного decision-set. См. раздел 14.                       |
| `mode`              | string   | да           | —         | Режим сопоставления. В v1 поддерживается только `"first_match_wins"`.           |
| `missingFactPolicy` | string   | нет          | `"false"` | `"false"` или `"error"`. Применяется к фактам в `when`. См. раздел 4.2.         |
| `requiredFacts`     | string[] | нет          | `[]`      | Обязательный входной контракт. См. раздел 5.2.                                  |
| `strict`            | boolean  | нет          | `false`   | Строгий режим: `DEFAULTED` трактуется как `ABORT`. См. раздел 5.3.              |
| `defaultDecision`   | object   | да           | —         | Возвращается, если ни одно правило не сработало. Требует `decision` и `reason`. |
| `rules`             | string[] | да           | —         | Упорядоченный список ссылок на `decision-rule`. Разрешаются по разделу 3.       |

**Правила проверяются в том порядке, в котором они перечислены в `rules`.** Первое сработавшее правило завершает вычисление. Последующие правила не проверяются.

**Схема `defaultDecision`:**

| Поле       | Тип    | Обязательное |
| ---------- | ------ | :----------: |
| `decision` | string |      да      |
| `reason`   | string |      да      |

**Пример:**

```json
{
  "id": "entrypoints.order.routing",
  "type": "decision-set",
  "description": "Маршрутизация заявки по состоянию реестра и расхождений",
  "version": "1.0.0",
  "mode": "first_match_wins",
  "missingFactPolicy": "false",
  "requiredFacts": [
    "registry.findResult",
    "diff.fullMatch",
    "diff.hasCriticalMismatch"
  ],
  "strict": true,
  "defaultDecision": {
    "decision": "REJECT_TECH",
    "reason": "NO_RULE_MATCHED"
  },
  "rules": ["not_found", "full_match", "library.common.reject_compliance"]
}
```

---

### 5.2 requiredFacts - обязательный входной контракт

`requiredFacts` это массив путей фактов в точечной нотации, которые **обязаны присутствовать** в объекте `facts` на входе `run()`.

Это **двухуровневая модель** проверки отсутствия фактов:

**Уровень 1: `requiredFacts` (upfront, до начала исполнения правил).**
Движок проверяет все пути из `requiredFacts` до вычисления первого правила.
Если хотя бы один путь отсутствует — немедленно возвращается `ABORT`
с `error.code: "REQUIRED_FACT_MISSING"` и `error.fact` — первый отсутствующий путь.
Это поведение не зависит от `missingFactPolicy`.

**Уровень 2: `missingFactPolicy` (lazy, во время вычисления условий `when`).**
Применяется к каждому пути в `when`, который отсутствует в `facts` в момент
вычисления конкретного условия. `missingFactPolicy` работает независимо от того,
объявлен ли путь в `requiredFacts` или нет.

```
run() →
  1. Проверить все пути из requiredFacts (upfront)
     Любой отсутствующий путь → ABORT (REQUIRED_FACT_MISSING)
  2. Для каждого правила:
     Для каждого условия when:
       Если путь отсутствует → применить missingFactPolicy
         "false" → условие = false (lazy)
         "error" → ABORT (MISSING_FACT)
```

**Upfront-проверка `requiredFacts`** не зависит от значения факта. Путь считается присутствующим, если он **существует** в нормализованных facts, даже если его значение равно `null`. Значение `null` это допустимое значение факта, не эквивалентное отсутствию пути. Если путь существует со значением `null`, то проверка `requiredFacts` по этому пути пройдена успешно.

**Отношение `requiredFacts` к `catalog.facts`:** `catalog.facts` используется только в studio для отображения. `requiredFacts` это нормативный контракт, проверяемый в рантайме. Компилятор в фазе 4 выдаёт предупреждение, если путь из `requiredFacts` не объявлен в `catalog.facts`, то это несогласованность между контрактом и документацией. В CI-окружениях рекомендуется повышать такие предупреждения до ошибок сборки, чтобы `requiredFacts` и `catalog.facts` оставались синхронизированными.

---

### 5.3 strict - строгий режим

При `strict: true` статус `DEFAULTED` является ошибкой проектирования, а не штатным исходом. Движок возвращает `ABORT` вместо `DEFAULTED`.

**Взаимодействие `strict` и `trace`.** Поле `error.details.traceBeforeDefault` заполняется по тому же принципу, что и основное поле `trace`: если `options.trace = false`, то `traceBeforeDefault` содержит пустой массив `[]`. Strict mode не форсирует принудительный сбор trace и решение принимается один раз через `RunOptions.trace`.

```json
{
  "status": "ABORT",
  "decision": null,
  "reason": null,
  "error": {
    "code": "DEFAULT_REACHED_IN_STRICT_MODE",
    "message": "Ни одно правило не сработало, но strict=true запрещает DEFAULTED",
    "entrypointId": "entrypoints.order.routing",
    "details": {
      "traceBeforeDefault": [ ... ]
    }
  }
}
```

`strict: true` рекомендуется для entrypoint, где незакрытый кейс является багом матрицы, а не допустимым сценарием.

---

## 6. Поведение компилятора

Компилятор вызывается через `compile(artifacts, options)`. Принимает плоский массив всех артефактов и возвращает заморожённый объект `CompiledDecisions` либо бросает `CompilationError`.

Фазы компиляции выполняются последовательно. Каждая фаза накапливает **все** ошибки перед остановкой. При наличии ошибок в любой фазе компиляция прерывается и последующие фазы не выполняются.

### Фаза 1: buildRegistry

- Собрать все артефакты в `Map<id, artifact>`.
- Ошибки: отсутствует `id`, отсутствует `type`, отсутствует `description`, дублирующийся `id`.

### Фаза 2: validateSchema

Для каждого артефакта проверить обязательные и запрещённые поля по типу.

- `decision-rule`: требует `when` (объект), `then` (объект с `decision` и `reason`).
- `decision-set`: требует `version`, `mode`, `defaultDecision`, `rules` (массив).
- Неизвестный `type` является ошибкой.
- Значение `mode`, отличное от `"first_match_wins"`, является ошибкой в v1.
- Наличие ключей `all`, `any` или `not` в `when` является ошибкой в v1.
- `patchPlanFrom`, если указан, должен быть непустой строкой.
- `requiredFacts`, если указан, должен быть массивом непустых строк.
- `strict`, если указан, должен быть булевым значением.
- Каждый ключ в `when` должен быть корректным путём в точечной нотации: непустая строка без пустых сегментов. Примеры некорректных путей: `""`, `"."`, `"a."`, `".b"`, `"a..b"`. Ошибка: `INVALID_WHEN_PATH`.
- Каждый элемент `requiredFacts` должен быть корректным путём в точечной нотации по тому же правилу. Ошибка: `INVALID_REQUIRED_FACT_PATH`.

### Фаза 3: validateCodeUniqueness

- Идентификаторы `decision-rule` должны быть глобально уникальны (проверяется в фазе 1).
- Дополнительных ограничений уникальности в v1 нет.

### Фаза 4: validateRefs

Для каждого `decision-set` разрешить каждый элемент `rules` (по разделу 3) и убедиться, что разрешённый идентификатор существует в реестре и имеет тип
`"decision-rule"`. Ошибки: неразрешимая ссылка, ссылка на артефакт неверного типа.

Если `requiredFacts` объявлен, выдать **предупреждение** (не ошибку) для каждого пути из `requiredFacts`, который не задекларирован в `catalog.facts` манифеста.

### Фаза 5: buildDecisionSets

Сформировать `CompiledDecisionSet` для каждого `decision-set`:

- Разрешить все ссылки на правила до абсолютных идентификаторов.
- Скомпилировать `when` в упорядоченный список объектов `CompiledCondition`.
- Собрать множество фактических путей, используемых в `when` всех правил набора.
- Заморозить скомпилированную структуру.

### Фаза 6: analyzeDecisionSets

Статический анализ скомпилированных decision-set. Выполняется всегда — не только
при явном вызове lint. Никогда не бросает `CompilationError`. Результаты помещаются
в `CompiledDecisions.warnings: readonly CompilationWarningEntry[]`.

**`UNREACHABLE_RULE`**

Правило B на позиции j недостижимо, если существует правило A на позиции i < j,
все условия которого являются подмножеством условий B (по паре `path + expected`).
При семантике `first_match_wins` A срабатывает раньше для любого входа, который
совпал бы с B. Предупреждение содержит идентификаторы обоих правил и их позиции.

Частный случай — правило с пустым `when: {}`. Пустое множество условий вакуумно
удовлетворяет проверке подмножества: такое правило совпадает с любыми фактами и
субсумирует все правила, следующие за ним. Компилятор выдаёт `UNREACHABLE_RULE`
для каждого правила после пустого `when: {}`.

Пустой `when: {}` в конце списка правил легитимен — он выступает как явный "catch-all"
и ничего не субсумирует.

**`PATCH_PLAN_FROM_NOT_IN_REQUIRED_FACTS`**

Правило использует `patchPlanFrom`, указывающий на путь, не объявленный в
`requiredFacts` соответствующего decision-set. Если этот путь отсутствует в
`facts` при вызове `run()`, движок молча вернёт `patchPlan: null`.
Предупреждение помогает обнаружить потенциально неочевидное молчаливое поведение.

**`UNUSED_REQUIRED_FACT`**

Путь объявлен в `requiredFacts`, но не встречается ни в одном условии `when`
ни одного правила данного decision-set. Объявление либо устарело (мёртвый контракт),
либо указывает на забытое условие в одном из правил.

---

## 7. Поведение среды исполнения

### Входные данные

```
run(compiled, entrypointId, facts, options?)
```

| Параметр       | Тип    | Описание                                                    |
| -------------- | ------ | ----------------------------------------------------------- |
| `compiled`     | object | Результат вызова `compile()`                                |
| `entrypointId` | string | Идентификатор `decision-set`, который нужно выполнить       |
| `facts`        | object | Подготовленные значения фактов. Вложенный JSON или плоский. |
| `options`      | object | Опционально. `trace: boolean` (по умолчанию `true`).        |

Движок **нормализует `facts` в плоский словарь с точечными ключами** перед вычислением.
Принимаются и вложенный JSON (`{ "a": { "b": 1 } }`), и уже плоский (`{ "a.b": 1 }`).
Нормализация идемпотентна.

### Алгоритм выполнения

```
0а. Валидация типа facts:
    Допустимые значения: plain object, null, undefined.
    Plain object — объект с прототипом Object.prototype или null
    (т.е. {} или Object.create(null)). Не являются plain object:
    Date, Map, Set, RegExp, экземпляры классов, массивы, строки, числа.
    null и undefined нормализуются в {} (пустой набор фактов).
    Всё остальное → ABORT (INVALID_FACTS_TYPE).

0б. Поиск decision-set по entrypointId:
    Если не найден → вернуть ABORT (UNKNOWN_ENTRYPOINT)

0в. Обнаружение коллизии flat/nested ключей:
    Если facts содержит одновременно top-level dotted key (напр. "a.b")
    и top-level объект с тем же первым сегментом (напр. a: { b: ... }) →
      вернуть ABORT (CONFLICTING_FACT_PATHS, fact: <конфликтующий ключ>)
    Такая комбинация делает результат flattenFacts() зависящим от порядка
    ключей объекта, что недопустимо для детерминированного движка решений.

1.  Нормализовать facts → плоский словарь

2.  [Уровень 1] Upfront-проверка requiredFacts:
    Для каждого пути из decision-set.requiredFacts:
      Если путь отсутствует в плоском словаре facts →
        вернуть ABORT (REQUIRED_FACT_MISSING, fact: <путь>)
    Эта проверка выполняется до вычисления первого правила.
    Не зависит от missingFactPolicy.

3.  Для каждой ссылки на правило в compiledDecisionSet.rules (по порядку):
      а. Найти decision-rule по разрешённому идентификатору
      б. [Уровень 2] Для каждого условия when:
           Вычислить значение по пути в плоском словаре facts
           Если путь отсутствует → применить missingFactPolicy:
             "false" → условие = false (lazy, правило не срабатывает)
             "error" → вернуть ABORT (MISSING_FACT, fact: <путь>)
      в. Собрать результат → { matched: bool, failedConditions: [] }
      г. Добавить запись в trace: { ruleId, matched, failedConditions? }
      д. Если matched:
           - Разрешить patchPlan: если задан then.patchPlanFrom,
             прочитать facts[patchPlanFrom] → patchPlan (null если путь отсутствует;
             patchPlanFrom никогда не вызывает missingFactPolicy: "error")
           - Вернуть результат MATCHED (см. раздел 8)

4.  Ни одно правило не сработало:
    Если decision-set.strict = true →
      вернуть ABORT (DEFAULT_REACHED_IN_STRICT_MODE, с traceBeforeDefault)
    Иначе →
      вернуть результат DEFAULTED, используя defaultDecision
```

### Вычисление `when`

Для плоского объектного синтаксиса v1 каждая пара ключ-значение проверяется
строгим равенством (`===`) со значением соответствующего пути в плоском словаре фактов.

**Семантика `null` в условиях.** Если условие `"x": null` проверяет наличие факта `x`
с точным значением `null`, то это не проверка отсутствия пути. Если путь `x` отсутствует
в `facts`, срабатывает `missingFactPolicy`, а не это условие. Разница принципиальная:
`{ "x": null }` в `when` совпадает только с фактом, у которого `x` существует и равен `null`;
если `x` отсутствует, то условие не совпало (или ABORT при `"error"`).

`missingFactPolicy` применяется **лениво** для каждого конкретного условия в момент
его вычисления, если путь отсутствует в `facts`. Это уровень 2 проверки (см. раздел 5.2):

- `"false"`: отсутствующий путь → условие `false` → правило не срабатывает.
- `"error"`: отсутствующий путь → немедленно вернуть ABORT (`MISSING_FACT`).

Пути из `requiredFacts` проверяются upfront (уровень 1) до начала вычисления правил
и не дублируются через `missingFactPolicy`.

Правило срабатывает тогда и только тогда, когда **все** условия в `when` принимают значение `true`.

---

## 8. Формат DecisionResult

### 8.1 Матрица полей по статусам

Внешний контракт ответа движка. Поля, помеченные `—`, в данном статусе отсутствуют.

| Поле                 | MATCHED                          | DEFAULTED                        | ABORT                            |
| -------------------- | -------------------------------- | -------------------------------- | -------------------------------- |
| `status`             | `"MATCHED"`                      | `"DEFAULTED"`                    | `"ABORT"`                        |
| `decision`           | string из `then.decision`        | string из `defaultDecision`      | `null`                           |
| `reason`             | string из `then.reason`          | string из `defaultDecision`      | `null`                           |
| `matchedRuleId`      | string (абс. id правила)         | `null`                           | `null`                           |
| `decisionSetVersion` | string из `decision-set.version` | string из `decision-set.version` | string из `decision-set.version` |
| `patchPlan`          | any \| `null`                    | `null`                           | `null`                           |
| `metadata`           | object из `then.metadata`        | `{}`                             | `{}`                             |
| `tags`               | string[] из `then.tags`          | `[]`                             | `[]`                             |
| `trace`              | TraceEntry[]                     | TraceEntry[]                     | TraceEntry[] (до точки сбоя)     |
| `error`              | отсутствует                      | отсутствует                      | object                           |

Поля `decision`, `reason`, `patchPlan`, `metadata`, `tags` всегда присутствуют в ответе
(не `undefined`) при статусах `DEFAULTED` и `ABORT` принимают нулевые значения
согласно таблице. Это гарантирует стабильную десериализацию на стороне оркестратора.

Поле `error` **присутствует только при `ABORT`**. При `MATCHED` и `DEFAULTED` это поле
**отсутствует** и не передаётся как `null`, а именно отсутствует в объекте ответа.
Оркестратор не должен опираться на `error: null` как на признак успешного исхода.

**Коды `error.code` рантайма:**

| Код                              | Триггер                                                                   |
| -------------------------------- | ------------------------------------------------------------------------- |
| `INVALID_FACTS_TYPE`             | `facts` не plain object: Date, Map, RegExp, класс-инстанс, массив, примитив  |
| `CONFLICTING_FACT_PATHS`         | `facts` содержит и dotted key `"a.b"`, и объект `a` — порядок-зависимость |
| `REQUIRED_FACT_MISSING`          | Путь из `requiredFacts` отсутствует в `facts` (upfront, ур. 1)            |
| `MISSING_FACT`                   | Путь из `when` отсутствует при `missingFactPolicy: "error"` (lazy, ур. 2) |
| `DEFAULT_REACHED_IN_STRICT_MODE` | Ни одно правило не сработало при `strict: true`                           |
| `UNKNOWN_ENTRYPOINT`             | `entrypointId` не найден в скомпилированных артефактах                    |
| `RUNTIME_EXCEPTION`              | Непредвиденное исключение в рантайме                                      |

**Коды compile-time предупреждений (`CompilationWarningEntry.code`):**

| Код                                      | Триггер                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| `UNREACHABLE_RULE`                       | Правило субсумировано более ранним правилом и никогда не сработает             |
| `PATCH_PLAN_FROM_NOT_IN_REQUIRED_FACTS`  | `patchPlanFrom` ссылается на путь, не объявленный в `requiredFacts`            |
| `UNUSED_REQUIRED_FACT`                   | Путь объявлен в `requiredFacts`, но не используется ни в одном условии `when`  |

---

### 8.2 Примеры ответов

**MATCHED:**

```json
{
  "status": "MATCHED",
  "decision": "CREATE_AND_BIND",
  "reason": "REGISTRY_CARD_NOT_FOUND",
  "matchedRuleId": "entrypoints.order.routing.not_found",
  "decisionSetVersion": "1.0.0",
  "patchPlan": null,
  "metadata": {},
  "tags": [],
  "trace": [ ... ]
}
```

**DEFAULTED (только при `strict: false`):**

```json
{
  "status": "DEFAULTED",
  "decision": "REJECT_TECH",
  "reason": "NO_RULE_MATCHED",
  "matchedRuleId": null,
  "decisionSetVersion": "1.0.0",
  "patchPlan": null,
  "metadata": {},
  "tags": [],
  "trace": [ ... ]
}
```

**ABORT: отсутствует обязательный факт (уровень 1):**

```json
{
  "status": "ABORT",
  "decision": null,
  "reason": null,
  "matchedRuleId": null,
  "decisionSetVersion": "1.0.0",
  "patchPlan": null,
  "metadata": {},
  "tags": [],
  "trace": [],
  "error": {
    "code": "REQUIRED_FACT_MISSING",
    "message": "Обязательный факт отсутствует: registry.findResult",
    "fact": "registry.findResult"
  }
}
```

**ABORT: strict mode, матрица не покрыта:**

```json
{
  "status": "ABORT",
  "decision": null,
  "reason": null,
  "matchedRuleId": null,
  "decisionSetVersion": "1.0.0",
  "patchPlan": null,
  "metadata": {},
  "tags": [],
  "trace": [ ... ],
  "error": {
    "code": "DEFAULT_REACHED_IN_STRICT_MODE",
    "message": "Ни одно правило не сработало, но strict=true запрещает DEFAULTED",
    "entrypointId": "entrypoints.order.routing",
    "details": {
      "traceBeforeDefault": [ ... ]
    }
  }
}
```

---

## 9. Формат trace

Каждая запись `TraceEntry` описывает одну попытку вычисления правила.

```json
{
  "ruleId": "entrypoints.order.routing.full_match",
  "matched": false,
  "failedConditions": [
    {
      "fact": "registry.findResult",
      "expected": "FOUND",
      "actual": "NOT_FOUND"
    }
  ]
}
```

| Поле               | Тип     | Присутствует когда | Описание                                         |
| ------------------ | ------- | :----------------: | ------------------------------------------------ |
| `ruleId`           | string  |       всегда       | Абсолютный идентификатор правила                 |
| `matched`          | boolean |       всегда       | Сработало ли правило                             |
| `failedConditions` | array   | `matched = false`  | Несовпавшие условия. Может быть пустым массивом. |

Поля записи `failedConditions`:

| Поле       | Тип                    | Описание                                                     |
| ---------- | ---------------------- | ------------------------------------------------------------ |
| `fact`     | string                 | Путь несовпавшего условия в точечной нотации                 |
| `expected` | any                    | Значение из `when`                                           |
| `actual`   | any \| `"__MISSING__"` | Значение из facts или `"__MISSING__"` если путь отсутствовал |

При `options.trace = false` поле `trace` является пустым массивом,
а `failedConditions` не вычисляется.

---

## 10. Программный API

```ts
interface DecisionEngine {
  compile(
    artifacts: unknown[],
    options?: { sources?: Map<string, SourceInfo> },
  ): CompiledDecisions;

  run(
    compiled: CompiledDecisions,
    entrypointId: string,
    facts: unknown,
    options?: RunOptions,
  ): DecisionResult;
}

interface RunOptions {
  trace?: boolean; // по умолчанию: true
}

interface SourceInfo {
  file: string; // абсолютный путь
  rel: string; // относительный путь от директории decisions
}

function createEngine(): DecisionEngine;
```

**Паттерн использования:**

```js
const { createEngine } = require("jsondecisions");
const engine = createEngine();

// Загрузить один раз при старте
const compiled = engine.compile(artifacts, { sources });

// Вызывать многократно с разными фактами
const result = engine.run(compiled, "entrypoints.order.routing", facts);

console.log(result.decision); // "CREATE_AND_BIND"
console.log(result.matchedRuleId); // "entrypoints.order.routing.not_found"
```

`compiled` это замороженный объект. Безопасен для использования в параллельных вызовах.
Движок не имеет внутреннего состояния между вызовами `run()`.

---

## 11. CLI

**Примечание.** CLI реализуется в отдельном пакете **`jsondecisions-cli`**. Ниже описан его нормативный контракт и ожидаемое поведение, совместимое с библиотекой **`jsondecisions`**. Наличие этого раздела в спецификации не означает, что CLI входит в состав текущего репозитория библиотеки.

CLI обнаруживает проект по `manifest.json` (поиск вверх от текущей директории).

### `jsondecisions validate`

Выполняет фазы компилятора 1–5. Выводит все ошибки компиляции. Выходные файлы не создаются.

```
jsondecisions validate
[jsondecisions] validate OK: 12 артефактов, 3 decision-set
```

### `jsondecisions build`

Выполняет фазы компилятора 1–5. При успехе записывает `snapshot.json` и `build-info.json` в директорию `dist/`.

```
jsondecisions build
[jsondecisions] build OK
[jsondecisions] snapshot: ./dist/snapshot.json
[jsondecisions] build info: ./dist/build-info.json
```

### `jsondecisions run <entrypoint> --facts <файл>`

Загружает проект, компилирует и выполняет на фактах из `<файл>` (JSON).
Выводит `DecisionResult` в формате JSON.

```bash
jsondecisions run entrypoints.order.routing --facts ./fixtures/TC-01.json
```

```json
{
  "status": "MATCHED",
  "decision": "CREATE_AND_BIND",
  "reason": "REGISTRY_CARD_NOT_FOUND",
  "matchedRuleId": "entrypoints.order.routing.not_found",
  "trace": [...]
}
```

### `jsondecisions test`

Обнаруживает все файлы фикстур в директории `fixtures/` (рекурсивно, `*.json`).
Для каждой фикстуры выполняет движок и сравнивает результат с `expect`.
Выводит результат pass/fail по каждой фикстуре.

```
jsondecisions test
[jsondecisions] TC-01  PASS
[jsondecisions] TC-02  PASS
[jsondecisions] TC-03  FAIL. Decision: ожидалось CREATE_AND_BIND, получено BIND_ONLY
[jsondecisions] 2 прошло, 1 упало
```

### `jsondecisions lint <entrypoint>`

Выполняет анализ фазы 6 для указанного `decision-set`. Выводит перекрытые, недостижимые правила и правила, перекрытые подмножеством.

```
jsondecisions lint entrypoints.order.routing
[jsondecisions] WARN правило entrypoints.order.routing.legacy_bind перекрыто правилом full_match (идентичный when)
[jsondecisions] 1 предупреждение
```

### `jsondecisions init`

Создаёт скелет нового jsondecisions-проекта с `manifest.json` и пустой структурой директорий.

---

## 12. Структура проекта

```
jsondecisions-project/
  manifest.json
  decisions/
    library/
      <общие-правила>.json
    entrypoints/
      <домен>/
        <название-набора>.json       ← артефакт decision-set
        <название-набора>/
          <название-правила>.json    ← артефакты decision-rule (в пространстве набора)
    internal/
      <домен>/
        <название-правила>.json      ← внутренние правила, не вызываются извне
  fixtures/
    <домен>/
      <название-набора>/
        TC-01-<описание>.json
        TC-02-<описание>.json
  dist/
    snapshot.json
    build-info.json
```

**Обязательные поля `manifest.json`:**

```json
{
  "project": {
    "id": "my-decisions",
    "title": "Мои правила решений",
    "description": "...",
    "language": "ru"
  },
  "paths": {
    "decisions": "./decisions",
    "fixtures": "./fixtures",
    "dist": "./dist"
  },
  "studio": {
    "port": 3200,
    "openBrowser": true
  },
  "build": {
    "snapshotFile": "snapshot.json",
    "buildInfoFile": "build-info.json"
  },
  "catalog": {
    "facts": {},
    "entrypoints": {},
    "artifacts": {}
  }
}
```

`catalog.facts` это словарь известных путей фактов с метаданными для отображения. Используется только в studio. Не влияет на поведение движка.

---

## 13. Тестовые фикстуры

Фикстура это JSON-файл, описывающий один тест-кейс: входные факты и ожидаемый `DecisionResult`.

**Схема:**

```json
{
  "id": "TC-01",
  "description": "Если карточка не найдена, то должна быть создана новая и привязана к счету",
  "entrypoint": "entrypoints.order.routing",
  "facts": {
    "registry.findResult": "NOT_FOUND",
    "diff.fullMatch": false
  },
  "expect": {
    "status": "MATCHED",
    "decision": "CREATE_AND_BIND",
    "reason": "REGISTRY_CARD_NOT_FOUND",
    "matchedRuleId": "entrypoints.order.routing.not_found"
  }
}
```

**Поля `expect`, проверяемые командой `jsondecisions test`:**

| Поле            | Тип            | Обязательное | Описание                                                                                               |
| --------------- | -------------- | :----------: | ------------------------------------------------------------------------------------------------------ |
| `status`        | string         |      да      | Должно совпадать с `DecisionResult.status`                                                             |
| `decision`      | string         |     нет      | Если указано — должно совпадать с `DecisionResult.decision`                                            |
| `reason`        | string         |     нет      | Если указано — должно совпадать с `DecisionResult.reason`                                              |
| `matchedRuleId` | string \| null |     нет      | Если указано — должно совпадать с `DecisionResult.matchedRuleId`                                       |
| `errorCode`     | string         |     нет      | Если указано — должно совпадать с `DecisionResult.error.code`. Применимо только при `status: "ABORT"`. |

Поля, не перечисленные в `expect`, не проверяются (утверждение не формируется).
`trace` никогда не является частью `expect` — trace является диагностическим,
а не нормативным.

Поле `errorCode` в фикстурах рекомендуется **всегда указывать** при `status: "ABORT"`,
поскольку движок различает коды причин нормативно (`REQUIRED_FACT_MISSING`,
`DEFAULT_REACHED_IN_STRICT_MODE`, `MISSING_FACT` и т.д.) — проверка только `status`
не позволяет отличить ожидаемый технический сбой от случайного.

**Факты в фикстурах могут быть вложенными или плоскими** — движок нормализует оба формата.

---

## 14. Версионирование

Каждый `decision-set` содержит поле `version` (строка в формате semver,
например `"1.0.0"`). Версия передаётся в `DecisionResult` как `decisionSetVersion`.

Версионирование в v1 носит информационный характер:

- Движок не выбирает между версиями — он выполняет тот артефакт, который скомпилирован.
- Оркестратор может сохранять `decisionSetVersion` вместе с `matchedRuleId` для
  аудиторского следа.
- При обновлении `decision-set` (изменение бизнес-правил) версия должна быть повышена.

`DecisionResult` с версией:

```json
{
  "status": "MATCHED",
  "decision": "CREATE_AND_BIND",
  "decisionSetVersion": "1.2.0",
  "matchedRuleId": "..."
}
```

---

## 15. Отличия от jsonspecs

| Аспект              | jsonspecs                                | jsondecisions                                             |
| ------------------- | ---------------------------------------- | --------------------------------------------------------- |
| Основной результат  | Список ошибок (валидация)                | Одно решение (маршрутизация)                              |
| Роль артефакта rule | `check` или `predicate`                  | Нет ролей — каждое правило имеет `when` + `then`          |
| Артефакт condition  | Отдельный артефакт `condition` с `when`  | `when` встроен непосредственно в `decision-rule`          |
| Модель исполнения   | Собрать все совпавшие ошибки             | Остановиться на первом совпавшем правиле                  |
| Запись trace        | Лог выполнения шага                      | Результат match/fail по правилу с failedConditions        |
| Статус результата   | `OK` / `ERROR` / `EXCEPTION` / `ABORT`   | `MATCHED` / `DEFAULTED` / `ABORT`                         |
| Операторы `when`    | Полный набор (not_empty, regex, ...)     | Только равенство в v1                                     |
| Входные данные      | Payload для валидации                    | Заранее подготовленные факты (движок ничего не вычисляет) |
| Концепция pipeline  | Есть — упорядоченные шаги с вложенностью | Нет — плоский упорядоченный список правил в decision-set  |
| Артефакт dictionary | Есть                                     | Не входит в scope v1                                      |

**Фундаментальное ограничение проектирования:**
jsondecisions никогда не вычисляет факты самостоятельно. Все условия `when` работают
исключительно со значениями, переданными в объекте `facts`. Любые вычисления,
обогащение или классификация должны выполняться за пределами движка
(в предшествующем шаге оркестратора).
