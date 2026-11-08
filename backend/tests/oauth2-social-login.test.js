const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'oauth_test_secret';

const app = require('../src/app');

let server;
let baseUrl;

describe('OAuth2 Social Login Route Tests', () => {
  before(async () => {
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('GET /oauth2/authorization/google redirects to login with error when GOOGLE_CLIENT_ID not configured', async () => {
    const res = await fetch(`${baseUrl}/oauth2/authorization/google`, { redirect: 'manual' });
    assert.strictEqual(res.status, 302);
    const location = res.headers.get('location') || '';
    assert.match(location, /\/login\?error=/);
  });

  it('GET /oauth2/authorization/facebook redirects to login with error when FACEBOOK_CLIENT_ID not configured', async () => {
    const res = await fetch(`${baseUrl}/oauth2/authorization/facebook`, { redirect: 'manual' });
    assert.strictEqual(res.status, 302);
    const location = res.headers.get('location') || '';
    assert.match(location, /\/login\?error=/);
  });

  it('GET /oauth2/callback/google with error param redirects to FE login with error message', async () => {
    const res = await fetch(`${baseUrl}/oauth2/callback/google?error=access_denied&error_description=User%20denied`, {
      redirect: 'manual',
    });
    assert.strictEqual(res.status, 302);
    const location = res.headers.get('location') || '';
    assert.match(location, /\/login\?error=User/);
  });

  it('GET /oauth2/callback/facebook with error param redirects to FE login with error message', async () => {
    const res = await fetch(`${baseUrl}/oauth2/callback/facebook?error=access_denied`, {
      redirect: 'manual',
    });
    assert.strictEqual(res.status, 302);
    const location = res.headers.get('location') || '';
    assert.match(location, /\/login\?error=access_denied/);
  });
});
