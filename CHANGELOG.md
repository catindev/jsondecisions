# Changelog

Формат основан на принципах Keep a Changelog.

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
