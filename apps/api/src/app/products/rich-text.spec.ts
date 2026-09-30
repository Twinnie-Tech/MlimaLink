import { sanitizeDescription } from './rich-text';

describe('sanitizeDescription', () => {
  it('keeps the formatting sellers pick in the editor', () => {
    const html =
      '<h2 style="text-align: center">Why you’ll love it</h2>' +
      '<p style="text-align: justify"><span style="font-family: Georgia, serif; font-size: 18px; color: #b91c1c">Soft</span> ' +
      '<mark data-color="#fef08a" style="background-color: #fef08a">leather</mark> <strong>made</strong> <em>in</em> <u>Nairobi</u> H<sub>2</sub>O x<sup>2</sup></p>' +
      '<ul><li><p>Hand-stitched</p></li></ul><ol start="2"><li><p>Resoleable</p></li></ol>' +
      '<blockquote><p>Best loafers I own</p></blockquote><hr>';

    // Styles come back without the spaces after ":" and ";".
    const tidied = html
      .replace(
        /style="([^"]*)"/g,
        (_, style: string) => `style="${style.replace(/([:;])\s+/g, '$1')}"`,
      )
      .replace('<hr>', '<hr />');
    expect(sanitizeDescription(html)).toBe(tidied);
  });

  it('drops scripts, event handlers and unsafe styles and links', () => {
    expect(
      sanitizeDescription(
        '<p onclick="steal()">Hi<script>alert(1)</script><img src=x onerror="steal()"></p>' +
          '<p><span style="position: fixed; color: red; font-size: 18px">Big</span></p>' +
          '<p><a href="javascript:steal()">Click</a> <a href="https://mlimalink.com">Shop</a></p>',
      ),
    ).toBe(
      '<p>Hi</p>' +
        '<p><span style="font-size:18px">Big</span></p>' +
        '<p><a target="_blank" rel="noopener noreferrer nofollow">Click</a> ' +
        '<a href="https://mlimalink.com" target="_blank" rel="noopener noreferrer nofollow">Shop</a></p>',
    );
  });

  it('leaves plain text descriptions alone', () => {
    expect(sanitizeDescription('Fits ages 3 & up, <3 years with help.')).toBe(
      'Fits ages 3 & up, <3 years with help.',
    );
  });
});
