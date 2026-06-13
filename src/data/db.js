// Real database handle backed by the native op-sqlite module.
//
// The native module is lazy-required inside openDb so that importing this
// file (e.g. to use the openTestDb seam below) does not force the native
// binding to load. That keeps the test seam runnable under plain Node/Jest
// without a simulator.
export function openDb({name = 'resendmail.sqlite', location} = {}) {
  const {open} = require('@op-engineering/op-sqlite');
  return open({name, location});
}

// Test seam: a tiny in-memory fake honoring the subset of the API we use.
export function openTestDb() {
  const tables = {};
  return {
    async execute(sql, params = []) {
      if (/SELECT 1 \+ 1 AS two/i.test(sql)) {
        return {rows: [{two: 2}]};
      }
      return {rows: [], rowsAffected: 0, tables, params};
    },
  };
}
