import test from 'node:test';
import assert from 'node:assert/strict';
test('matches original login encryption test vector', async () => {
  const {encodeLogin} = await import('../server/login-codec.mjs');
  assert.equal(encodeLogin('admin', '1,2,3'), '012C2C9BA925FAF8045B2FD9B02A2664');
});
