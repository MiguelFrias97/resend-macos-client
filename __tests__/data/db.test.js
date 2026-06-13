import {openTestDb} from '../../src/data/db';

test('openTestDb returns a db that can run a trivial query', async () => {
  const db = openTestDb();
  const res = await db.execute('SELECT 1 + 1 AS two');
  expect(res.rows[0].two).toBe(2);
});
