import {
  MAX_PORTFOLIO_PHOTOS,
  canMoveServiceRequest,
  describeQualification,
  experienceLabel,
  parseServiceProfileInput,
  parseServiceRequestInput,
  parseServiceRequestUpdate,
  serviceRequestStatusLabel,
} from './service.model.js';

const NOW = new Date('2026-09-30T12:00:00Z');
const photo = (name: string) =>
  `https://ik.imagekit.io/e4edrhdew/products/shop1/${name}.jpg`;

const profile = (overrides: Record<string, unknown> = {}) => ({
  headline: '  Full-stack developer building web and mobile apps ',
  about: 'Eight years shipping apps for Kenyan businesses.',
  skills: ['React', ' Node.js ', 'react', ''],
  yearsExperience: 8,
  qualifications: [
    {
      title: 'BSc Computer Science',
      issuer: 'University of Nairobi',
      year: 2017,
    },
    { title: 'AWS Certified Developer', issuer: '', year: '' },
  ],
  serviceArea: 'Nairobi and Kiambu',
  remote: true,
  portfolio: [photo('booking-app')],
  portfolioFileIds: ['file_1'],
  ...overrides,
});

const errorOf = (result: object) =>
  'error' in result ? (result as { error: string }).error : undefined;

describe('parseServiceProfileInput', () => {
  it('tidies a profile', () => {
    const result = parseServiceProfileInput(profile(), NOW);
    if (!('profile' in result)) throw new Error(result.error);

    expect(result.profile).toEqual({
      headline: 'Full-stack developer building web and mobile apps',
      about: 'Eight years shipping apps for Kenyan businesses.',
      skills: ['React', 'Node.js'],
      yearsExperience: 8,
      qualifications: [
        {
          title: 'BSc Computer Science',
          issuer: 'University of Nairobi',
          year: 2017,
        },
        { title: 'AWS Certified Developer' },
      ],
      serviceArea: 'Nairobi and Kiambu',
      remote: true,
      portfolio: [photo('booking-app')],
      portfolioFileIds: ['file_1'],
    });
  });

  it('only counts remote when it is exactly true', () => {
    const result = parseServiceProfileInput(profile({ remote: 'yes' }), NOW);
    expect('profile' in result && result.profile.remote).toBe(false);
  });

  it.each([
    [{ headline: 'Dev' }, 'Headline must be 5 to 100 characters.'],
    [{ skills: [] }, 'Add at least one skill.'],
    [{ skills: 'React' }, 'Skills must be a list.'],
    [
      { skills: ['x'.repeat(41)] },
      'Use up to 20 skills of 40 characters or fewer.',
    ],
    [
      { yearsExperience: 2.5 },
      'Years of experience must be a whole number from 0 to 60.',
    ],
    [
      { qualifications: [{ title: 'A' }] },
      'Give each qualification a name of 2 to 100 characters.',
    ],
    [
      { qualifications: [{ title: 'Diploma', year: 2027 }] },
      'Diploma: the year must be between 1950 and 2026.',
    ],
    [{ serviceArea: '' }, 'Say where you work, e.g. “Nairobi and Kiambu”.'],
    [
      { portfolio: ['https://example.com/a.jpg'] },
      `Add up to ${MAX_PORTFOLIO_PHOTOS} portfolio photos, uploaded from this page.`,
    ],
    [
      { portfolioFileIds: [] },
      `Add up to ${MAX_PORTFOLIO_PHOTOS} portfolio photos, uploaded from this page.`,
    ],
  ])('rejects %o', (overrides, message) => {
    expect(errorOf(parseServiceProfileInput(profile(overrides), NOW))).toBe(
      message,
    );
  });
});

describe('parseServiceRequestInput', () => {
  const request = (overrides: Record<string, unknown> = {}) => ({
    productId: 'p1',
    details: 'I need a booking app for my salon in Westlands.',
    ...overrides,
  });

  it('keeps the optional fields that were filled in', () => {
    expect(
      parseServiceRequestInput(
        request({
          budget: 799.999,
          neededBy: '2026-10-15',
          phone: '+254 712 345 678',
        }),
        NOW,
      ),
    ).toEqual({
      request: {
        productId: 'p1',
        details: 'I need a booking app for my salon in Westlands.',
        budget: 800,
        neededBy: '2026-10-15',
        phone: '+254712345678',
      },
    });
    expect(
      parseServiceRequestInput(
        request({ budget: '', neededBy: '', phone: '' }),
        NOW,
      ),
    ).toEqual({ request: request() });
  });

  it('allows today as the date', () => {
    expect(
      errorOf(
        parseServiceRequestInput(request({ neededBy: '2026-09-30' }), NOW),
      ),
    ).toBeUndefined();
  });

  it.each([
    [{ productId: '' }, 'Choose a service to request.'],
    [
      { details: 'Too short' },
      'Describe what you need in 20 to 2000 characters.',
    ],
    [{ budget: 0 }, 'Budget must be more than 0.'],
    [{ budget: '500' }, 'Budget must be more than 0.'],
    [{ neededBy: '2026-02-30' }, 'Pick a date you need it by.'],
    [
      { neededBy: '2026-09-29' },
      'The date you need it by can’t be in the past.',
    ],
    [{ phone: 'call me' }, 'Enter a phone number like +254712345678.'],
  ])('rejects %o', (overrides, message) => {
    expect(errorOf(parseServiceRequestInput(request(overrides), NOW))).toBe(
      message,
    );
  });
});

describe('service request status', () => {
  it('moves new requests to accepted or declined, then on to completed', () => {
    expect(canMoveServiceRequest('pending', 'accepted')).toBe(true);
    expect(canMoveServiceRequest('pending', 'declined')).toBe(true);
    expect(canMoveServiceRequest('pending', 'completed')).toBe(false);
    expect(canMoveServiceRequest('accepted', 'completed')).toBe(true);
    expect(canMoveServiceRequest('accepted', 'declined')).toBe(true);
    expect(canMoveServiceRequest('declined', 'accepted')).toBe(false);
    expect(canMoveServiceRequest('completed', 'declined')).toBe(false);
    expect(serviceRequestStatusLabel('pending')).toBe('New');
  });

  it('reads a provider’s reply', () => {
    expect(
      parseServiceRequestUpdate({ status: 'accepted', note: ' Sure! ' }),
    ).toEqual({
      status: 'accepted',
      note: 'Sure!',
    });
    expect(parseServiceRequestUpdate({ status: 'declined', note: '' })).toEqual(
      {
        status: 'declined',
      },
    );
    expect(errorOf(parseServiceRequestUpdate({ status: 'pending' }))).toBe(
      'Choose accept, decline or completed.',
    );
    expect(
      errorOf(
        parseServiceRequestUpdate({
          status: 'accepted',
          note: 'x'.repeat(501),
        }),
      ),
    ).toBe('Keep your message under 500 characters.');
  });
});

describe('labels', () => {
  it('describes experience and qualifications', () => {
    expect(experienceLabel(0)).toBe('Less than a year');
    expect(experienceLabel(1)).toBe('1 year');
    expect(experienceLabel(8)).toBe('8 years');
    expect(
      describeQualification({
        title: 'LLB',
        issuer: 'Kenya School of Law',
        year: 2015,
      }),
    ).toBe('LLB · Kenya School of Law · 2015');
    expect(describeQualification({ title: 'LLB' })).toBe('LLB');
  });
});
