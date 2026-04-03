'use strict';

const { createEngine } = require('./src/engine');
const { CompilationError, makeCompilationWarningEntry } = require('./src/errors');

module.exports = { createEngine, CompilationError, makeCompilationWarningEntry };
