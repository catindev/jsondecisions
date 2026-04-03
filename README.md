# JSONDecisions

[![CI](https://github.com/catindev/jsondecisions/actions/workflows/ci.yml/badge.svg)](https://github.com/catindev/jsondecisions/actions)
[![npm](https://img.shields.io/npm/v/jsondecisions)](https://www.npmjs.com/package/jsondecisions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node 18+](https://img.shields.io/badge/Node-18%2B-green)](https://nodejs.org/)

Декларативный движок принятия решений по заранее подготовленным JSON-фактам.

Входит в ту же экосистему технологий, что и `jsonspecs` - декларативные DSL для описания бизнес-процессов. Библиотека предназначена для ситуаций, где нужно не валидировать данные, а **выбрать конкретный нормализованный бизнес-исход** по набору уже собранных признаков.

Ключевой ориентир:

- `jsonspecs` проверить данные
- `jsonmapping` собрать, нормализовать и преобразовать данные
- `jsondecisions` выбрать сценарий (команду, дальнейшее действие)

Подразумевается, что движок принятия решений и другие инструменты используются неким сервисом-оркестратором бизнес-процесса либо, в случае хореографии, отдельными микросервисами чтобы выполнить и связать между собой шаги процесса и провести обработку запроса по нужному маршруту.

## Архитектурный принцип v1

`jsondecisions` первой версии это **плоский движок локального выбора сценария**. Один entrypoint должен решать **одну локальную развилку процесса** и возвращать **одно нормализованное решение на выходе**.

Вложенные decision-блоки, рекурсивные вызовы и логика оркестрации внутрь DSL не вносятся.
Если матрица решений начинает требовать вложенности, это считается сигналом к выделению **нового entrypoint** и **нового decision step** во внешнем серисе-потребителе (например в оркестраторе), а не к усложнению языка.

## Что умеет библиотека

- компилировать decision-проект из JSON-артефактов;
- проверять схему артефактов и ссылки между ними;
- выполнять decision-set на объекте facts;
- поддерживать `requiredFacts`, `missingFactPolicy`, `strict`, `patchPlanFrom`;
- возвращать детерминированный `DecisionResult` и trace;
- отдавать **структурированные compile-time ошибки**, пригодные для CLI.

## Что библиотека не делает

`jsondecisions` не должен:

- валидировать обязательность полей и форматы как validation engine;
- вызывать внешние сервисы;
- выполнять HTTP или Kafka-вызовы;
- вычислять derived facts;
- проверять доменные инварианты facts;
- управлять жизненным циклом процесса;
- хранить состояние процесса;
- заменять оркестратор.

## Установка

```bash
npm install jsondecisions
```

Требуется Node.js 18+.

## Быстрый пример

Этот пример показывает, как jsondecisions помогает выбрать дальнейший сценарий обработки заказа в интернет-магазине на основе уже подготовленных фактов.

Движок не проверяет оплату сам, не ходит на склад и не управляет процессом заказа. Он получает на вход готовые признаки (например, статус оплаты и наличие товара) и возвращает одно нормализованное решение: подтвердить заказ, отменить его или уведомить покупателя об отсутствии товара.

Такой подход позволяет держать бизнес-логику выбора сценария отдельно от кода checkout-процесса: оркестратор управляет шагами процесса, а jsondecisions отвечает только за локальный выбор исхода по заданной матрице правил.

```js
const { createEngine } = require("jsondecisions");

const engine = createEngine();

const artifacts = [
  {
    id: "entrypoints.order.checkout.confirm",
    type: "decision-set",
    description: "Выбор сценария подтверждения заказа",
    version: "1.0.0",
    mode: "first_match_wins",
    requiredFacts: ["payment.status", "stock.available"],
    strict: true,
    defaultDecision: {
      decision: "MANUAL_REVIEW",
      reason: "NO_RULE_MATCHED",
    },
    rules: [
      "payment_failed_cancel",
      "out_of_stock_notify",
      "paid_and_available_confirm",
    ],
  },

  {
    id: "entrypoints.order.checkout.confirm.payment_failed_cancel",
    type: "decision-rule",
    description: "Если оплата не прошла, то заказ нужно отменить",
    when: {
      "payment.status": "FAILED",
    },
    then: {
      decision: "CANCEL_ORDER",
      reason: "PAYMENT_FAILED",
    },
  },

  {
    id: "entrypoints.order.checkout.confirm.out_of_stock_notify",
    type: "decision-rule",
    description: "Если товара нет в наличии, то сообщить об этом покупателю",
    when: {
      "payment.status": "PAID",
      "stock.available": false,
    },
    then: {
      decision: "NOTIFY_OUT_OF_STOCK",
      reason: "ITEM_NOT_AVAILABLE",
    },
  },

  {
    id: "entrypoints.order.checkout.confirm.paid_and_available_confirm",
    type: "decision-rule",
    description: "Если оплата успешна и товар в наличии, то подтверждаем заказ",
    when: {
      "payment.status": "PAID",
      "stock.available": true,
    },
    then: {
      decision: "CONFIRM_ORDER",
      reason: "PAID_AND_RESERVED",
    },
  },
];

const compiled = engine.compile(artifacts);

const result = engine.run(compiled, "entrypoints.order.checkout.confirm", {
  payment: { status: "PAID" },
  stock: { available: true },
});

console.log(result);
```

Ожидаемый результат:

```json
{
  "status": "MATCHED",
  "decision": "CONFIRM_ORDER",
  "reason": "PAID_AND_RESERVED",
  "matchedRuleId": "entrypoints.order.checkout.confirm.paid_and_available_confirm",
  "decisionSetVersion": "1.0.0",
  "patchPlan": null,
  "metadata": {},
  "tags": [],
  "trace": [
    {
      "ruleId": "entrypoints.order.checkout.confirm.payment_failed_cancel",
      "matched": false,
      "failedConditions": [
        {
          "fact": "payment.status",
          "expected": "FAILED",
          "actual": "PAID"
        }
      ]
    },
    {
      "ruleId": "entrypoints.order.checkout.confirm.out_of_stock_notify",
      "matched": false,
      "failedConditions": [
        {
          "fact": "stock.available",
          "expected": false,
          "actual": true
        }
      ]
    },
    {
      "ruleId": "entrypoints.order.checkout.confirm.paid_and_available_confirm",
      "matched": true
    }
  ]
}
```

## Программный API

```ts
interface DecisionEngine {
  compile(
    artifacts: unknown[],
    options?: { sources?: Map<string, SourceInfo> },
  ): CompiledDecisions;
  run(
    compiled: CompiledDecisions,
    entrypointId: string,
    facts: Record<string, unknown> | null | undefined,
    options?: RunOptions,
  ): DecisionResult;
}
```

### Контракт `facts`

`facts` должен быть **plain object** - объектом с прототипом `Object.prototype`
или `null` (т.е. `{}` или `Object.create(null)`).

`null` и `undefined` принимаются и нормализуются в `{}`.

Следующие значения возвращают `ABORT INVALID_FACTS_TYPE`:
массивы, строки, числа, `Date`, `Map`, `Set`, `RegExp`, экземпляры классов.

Если объект содержит одновременно top-level dotted key (`"a.b"`) и вложенный объект
с тем же первым сегментом (`a: { b: ... }`) — `ABORT CONFLICTING_FACT_PATHS`.
Такая комбинация делает результат нормализации зависящим от порядка ключей объекта.

Экспортируется через:

```js
const { createEngine, CompilationError } = require("jsondecisions");
```

## Предупреждения компилятора

`compile()` помимо `decisionSets` и `registry` возвращает поле `warnings`
с массивом `CompilationWarningEntry[]`. Предупреждения никогда не бросают исключение:
они сигнализируют о вероятных ошибках в матрице правил, которые не являются
структурными нарушениями, но почти наверняка являются ошибками автора.

```js
const compiled = engine.compile(artifacts);

if (compiled.warnings.length > 0) {
  for (const w of compiled.warnings) {
    console.warn(`[${w.code}] ${w.artifactId} (${w.path}): ${w.message}`);
  }
}
```

| Код предупреждения                      | Смысл                                                                                                                      |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `UNREACHABLE_RULE`                      | Правило никогда не сработает: более ранее правило субсумирует его условия                                                  |
| `PATCH_PLAN_FROM_NOT_IN_REQUIRED_FACTS` | `patchPlanFrom` ссылается на путь, не объявленный в `requiredFacts` — при отсутствии факта `patchPlan` молча станет `null` |
| `UNUSED_REQUIRED_FACT`                  | Путь объявлен в `requiredFacts`, но ни одно правило не использует его в `when`                                             |

В CI-сборках рекомендуется завершать процесс с ненулевым кодом при наличии
предупреждений — это обязанность CLI (`jsondecisions-cli`), а не библиотеки.

## Structured diagnostics

Compile-time ошибки возвращаются как `CompilationError.errors`, где каждый элемент — объект такого вида:

```js
{
  code: 'UNRESOLVED_REF',
  artifactId: 'entrypoints.beneficiary.register.find_create',
  path: 'rules[2]',
  message: 'resolves to "..." which does not exist'
}
```

Канон structured diagnostics описан отдельно: [docs/STRUCTURED_DIAGNOSTICS.md](docs/STRUCTURED_DIAGNOSTICS.md).

## TypeScript

В пакет включён `index.d.ts` с типами для:

- `createEngine`
- `CompilationError`
- `CompilationErrorEntry`
- `DecisionResult`
- `RunOptions`
- `CompiledDecisions`

## Тестирование

```bash
npm test
```

Доступные команды:

```bash
npm run test:unit
npm run test:acceptance
npm run pack:check
```

> `test:acceptance` использует внешний reference project и ожидает переменную окружения `JSONDECISIONS_REF_PROJECT`.

Пример:

```bash
JSONDECISIONS_REF_PROJECT=/path/to/beneficiary-decisions-ref-project npm run test:acceptance
```

## Структура репозитория

```text
jsondecisions/
  index.js
  index.d.ts
  src/
    engine.js
    runner.js
    errors.js
    utils.js
    compiler/
  tests/
  docs/
    SPECIFICATION.md
    STRUCTURED_DIAGNOSTICS.md
  .github/workflows/ci.yml
  CHANGELOG.md
  LICENSE
  README.md
```

## Документация

- [Спецификация](docs/SPECIFICATION.md)
- [Канон structured diagnostics](docs/STRUCTURED_DIAGNOSTICS.md)
- [История изменений](CHANGELOG.md)

## Связанные проекты

- `jsonspecs` движок проверок
- `jsonmapping` движок преобразований данных
- `jsondecisions-cli` CLI над библиотекой `jsondecisions`

## Лицензия

MIT см. [LICENSE](LICENSE).
