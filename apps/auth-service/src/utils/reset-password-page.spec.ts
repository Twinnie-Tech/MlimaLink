import { readFileSync } from 'fs';
import { join } from 'path';
import ejs from 'ejs';

const template = readFileSync(
  join(__dirname, '..', 'assets', 'pages', 'reset-password.ejs'),
  'utf8',
);

function renderPage(tokenValid: boolean) {
  return ejs.render(template, {
    token: 'abc123',
    tokenValid,
    loginUrl: 'http://localhost:4200/login?from="reset"',
    forgotPasswordUrl: 'http://localhost:4200/forgot-password',
  });
}

describe('reset-password page', () => {
  it('renders both password fields with a show/hide toggle', () => {
    const html = renderPage(true);

    for (const id of ['password', 'confirmPassword']) {
      expect(html).toContain(`id="${id}"`);
      expect(html).toContain(`data-target="${id}"`);
    }
    expect(html.match(/aria-label="Show password"/g)).toHaveLength(2);
  });

  it('passes the escaped login URL to the redirect script', () => {
    const html = renderPage(true);

    expect(html).toContain(
      'data-login-url="http://localhost:4200/login?from=&#34;reset&#34;"',
    );
    expect(html).toContain('window.location.assign(loginUrl)');
  });

  it('offers a new link when the token is no longer valid', () => {
    const html = renderPage(false);

    expect(html).not.toContain('id="reset-form"');
    expect(html).toContain('href="http://localhost:4200/forgot-password"');
    expect(html).toContain('Request a new link');
  });
});
