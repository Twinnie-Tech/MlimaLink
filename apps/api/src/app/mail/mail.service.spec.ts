import { MailService, renderMail } from './mail.service';

describe('renderMail', () => {
  it('escapes what users typed', () => {
    const html = renderMail({
      to: 'a@b.co',
      subject: 'Hi',
      paragraphs: ['<script>alert("x")</script>\nline two'],
      link: { label: 'Open & reply', url: 'https://example.com/?a=1&b=2' },
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;<br>line two',
    );
    expect(html).toContain('href="https://example.com/?a=1&amp;b=2"');
    expect(html).toContain('Open &amp; reply');
  });
});

describe('MailService', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('skips sending when SMTP isn’t configured', async () => {
    for (const key of ['SMTP_USER', 'GMAIL_USER', 'SMTP_PASS', 'GMAIL_PASS']) {
      vi.stubEnv(key, '');
    }

    await expect(
      new MailService().send({ to: 'a@b.co', subject: 'Hi', paragraphs: [] }),
    ).resolves.toBe(false);
  });
});
