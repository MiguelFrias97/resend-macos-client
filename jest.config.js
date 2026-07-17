module.exports = {
  preset: 'react-native',
  // The heavy screen suites (e.g. InboxScreen) render the full app shell; the
  // first render in a cold suite pays a one-time module-transform/init cost that
  // can exceed jest's default 5s timeout on a contended CI runner, even though it
  // takes ~200ms warm/local. Give that cold-start variance headroom so CI isn't
  // spuriously red.
  testTimeout: 15000,
};
