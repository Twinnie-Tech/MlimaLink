import type { PaginatedResponse } from './product.model.js';

export const REVIEW_COMMENT_MAX = 1000;
export const REVIEWS_PAGE_SIZE = 5;

/** A shopper's review of a product or a shop. */
export interface Review {
  id: string;
  /** Whole stars, 1 to 5. */
  rating: number;
  comment?: string;
  /** First name and last initial, e.g. "Amina K." */
  authorName: string;
  /** The shopper had a delivered order from this listing or shop when they posted. */
  verified: boolean;
  /** ISO date strings. */
  createdAt: string;
  updatedAt: string;
}

export interface ReviewSummary {
  /** Average rating to one decimal place, 0 before the first review. */
  average: number;
  count: number;
  /** How many reviews gave each rating: index 0 is 1 star, index 4 is 5 stars. */
  breakdown: [number, number, number, number, number];
}

/** One page of reviews, newest first, with the totals for every review. */
export interface ReviewPage extends PaginatedResponse<Review> {
  summary: ReviewSummary;
  /** The signed-in shopper's own review, so they can edit it. */
  mine?: Review;
}

export interface ReviewInput {
  rating: number;
  comment?: string;
}

/** Checks a shopper's review. Returns it tidied, or a message saying what to fix. */
export function parseReviewInput(
  value: unknown,
): { review: ReviewInput } | { error: string } {
  const input = (value ?? {}) as Record<string, unknown>;
  const rating = input.rating;
  if (
    typeof rating !== 'number' ||
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5
  ) {
    return { error: 'Choose a rating from 1 to 5 stars.' };
  }

  if (input.comment !== undefined && input.comment !== null) {
    if (typeof input.comment !== 'string') {
      return { error: 'Your review must be text.' };
    }
    const comment = input.comment.trim();
    if (comment.length > REVIEW_COMMENT_MAX) {
      return {
        error: `Keep your review under ${REVIEW_COMMENT_MAX} characters.`,
      };
    }
    if (comment) return { review: { rating, comment } };
  }
  return { review: { rating } };
}

/** "Amina Kariuki" becomes "Amina K.", so reviews don't show full names. */
export function reviewerName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'MlimaLink shopper';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}
