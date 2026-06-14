import {createSender} from '../../src/net/sender';

test('send POSTs the payload and returns the id', async () => {
  let captured;
  const fetchImpl = async (url, opts) => {
    captured = {url, opts};
    return {status: 200, json: async () => ({id: 'eml_1'})};
  };
  const sender = createSender({apiKey: 're_x', fetchImpl});
  const res = await sender.send({from: 'a@x', to: 'b@y', subject: 'Re: hi', html: '<p>x</p>'});
  expect(res.id).toBe('eml_1');
  expect(captured.url).toBe('https://api.resend.com/emails');
  expect(captured.opts.method).toBe('POST');
  expect(JSON.parse(captured.opts.body).subject).toBe('Re: hi');
});

test('send sets the Idempotency-Key header when given', async () => {
  let captured;
  const fetchImpl = async (url, opts) => {
    captured = opts;
    return {status: 200, json: async () => ({id: 'eml_1'})};
  };
  const sender = createSender({apiKey: 're_x', fetchImpl});
  await sender.send({subject: 'Re: hi'}, {idempotencyKey: 'out_abc'});
  expect(captured.headers['Idempotency-Key']).toBe('out_abc');
});

test('send throws on a non-2xx response', async () => {
  const fetchImpl = async () => ({status: 422, json: async () => ({message: 'bad'})});
  const sender = createSender({apiKey: 're_x', fetchImpl});
  await expect(sender.send({})).rejects.toThrow(/422/);
});
