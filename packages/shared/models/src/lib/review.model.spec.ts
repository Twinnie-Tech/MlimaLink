import {
  REVIEW_COMMENT_MAX,
  parseReviewInput,
  reviewerName,
} from './review.model.js';

describe('parseReviewInput', () => {
  it('accepts a whole-star rating with a trimmed comment', () => {
    expect(parseReviewInput({ rating: 4, comment: '  Lovely  ' })).toEqual({
      review: { rating: 4, comment: 'Lovely' },
    });
  });

  it('drops a blank comment', () => {
    expect(parseReviewInput({ rating: 5, comment: '   ' })).toEqual({
      review: { rating: 5 },
    });
    expect(parseReviewInput({ rating: 5, comment: null })).toEqual({
      review: { rating: 5 },
    });
  });

  it('rejects missing, fractional and out-of-range ratings', () => {
    for (const rating of [undefined, 0, 6, 3.5, '4']) {
      expect(parseReviewInput({ rating })).toEqual({
        error: 'Choose a rating from 1 to 5 stars.',
      });
    }
    expect(parseReviewInput(null)).toHaveProperty('error');
  });

  it('rejects comments that are too long or not text', () => {
    expect(
      parseReviewInput({
        rating: 3,
        comment: 'a'.repeat(REVIEW_COMMENT_MAX + 1),
      }),
    ).toHaveProperty('error');
    expect(parseReviewInput({ rating: 3, comment: 42 })).toEqual({
      error: 'Your review must be text.',
    });
  });
});

describe('reviewerName', () => {
  it('shows a first name and last initial', () => {
    expect(reviewerName('Amina Wanjiru kariuki')).toBe('Amina K.');
    expect(reviewerName('Otieno')).toBe('Otieno');
    expect(reviewerName('  ')).toBe('MlimaLink shopper');
  });
});
