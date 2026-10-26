const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('debug-entry.js', 'utf8');
const body = source.slice(source.indexOf('function announceDebug('), source.indexOf('function copyTextFallback('));
const published = [], logged = [], timers = [];
let region = { textContent: '' };
const context = vm.createContext({
  document: { getElementById: () => region },
  announce: text => published.push(text),
  console: { info: text => logged.push(text) },
  setTimeout: callback => timers.push(callback)
});
vm.runInContext(body, context);
context.announceDebug('Copied');
assert.deepEqual(published, ['Copied'], 'Debug feedback must use the shared modal-aware announcement channel');
assert.equal(timers.length, 0, 'Debug feedback must not leave an independent timer overwriting later feedback');
region = null;
context.announceDebug('Startup feedback');
assert.deepEqual(logged, ['Startup feedback']);
console.log('Debug announcement routing checks passed.');
