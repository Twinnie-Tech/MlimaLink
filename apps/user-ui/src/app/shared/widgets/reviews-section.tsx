'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import {
  BadgeCheck,
  CheckCircle2,
  Loader2,
  MessageSquareText,
  Star,
} from 'lucide-react';
import type { Review, ReviewSummary } from '@org/models';
import { REVIEW_COMMENT_MAX, parseReviewInput } from '@org/models/reviews';
import { formatDate, primaryButtonClassName } from '../dashboard/ui';
import { useUser } from '../hooks/use-user';
import { rememberReturnTo } from '../utils/return-to';
import {
  listReviews,
  postReview,
  reviewsQueryKey,
  type ReviewTarget,
} from '../utils/reviews-api';

const RATING_WORDS = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

export function Stars({
  rating,
  size = 16,
}: {
  rating: number;
  size?: number;
}) {
  return (
    <span
      role="img"
      aria-label={`${rating} out of 5 stars`}
      className="inline-flex"
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          size={size}
          aria-hidden
          className={
            star <= Math.round(rating)
              ? 'fill-amber-400 text-amber-400'
              : 'text-neutral-300'
          }
        />
      ))}
    </span>
  );
}

function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (rating: number) => void;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-neutral-700">
        Your rating
      </legend>
      <div className="flex items-center gap-3">
        <div className="flex" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((star) => (
            <label
              key={star}
              onMouseEnter={() => setHover(star)}
              className="cursor-pointer p-0.5"
            >
              <input
                type="radio"
                name="rating"
                value={star}
                checked={value === star}
                onChange={() => onChange(star)}
                className="peer sr-only"
              />
              <span className="sr-only">
                {star} {star === 1 ? 'star' : 'stars'}
              </span>
              <Star
                size={28}
                aria-hidden
                className={`rounded transition peer-focus-visible:ring-2 peer-focus-visible:ring-brand-start ${
                  star <= shown
                    ? 'fill-amber-400 text-amber-400'
                    : 'text-neutral-300'
                }`}
              />
            </label>
          ))}
        </div>
        {shown > 0 && (
          <span className="text-sm text-neutral-600">
            {RATING_WORDS[shown - 1]}
          </span>
        )}
      </div>
    </fieldset>
  );
}

function SummaryPanel({ summary }: { summary: ReviewSummary }) {
  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
      <div className="text-center sm:w-36">
        <p className="font-poppins text-5xl font-bold text-neutral-900">
          {summary.count ? summary.average.toFixed(1) : '–'}
        </p>
        <Stars rating={summary.average} />
        <p className="mt-1 text-sm text-neutral-600">
          {summary.count === 1 ? '1 review' : `${summary.count} reviews`}
        </p>
      </div>
      <ul aria-label="Ratings breakdown" className="flex-1 space-y-1.5">
        {[5, 4, 3, 2, 1].map((stars) => {
          const count = summary.breakdown[stars - 1];
          const share = summary.count ? (count / summary.count) * 100 : 0;
          return (
            <li key={stars} className="flex items-center gap-3 text-sm">
              <span className="w-12 text-neutral-600">{stars} star</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
                <span
                  className="block h-full rounded-full bg-amber-400"
                  style={{ width: `${share}%` }}
                />
              </span>
              <span className="w-8 text-right text-neutral-600">{count}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ReviewForm({
  target,
  subject,
  mine,
  onSaved,
}: {
  target: ReviewTarget;
  subject: string;
  mine?: Review;
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(mine?.rating ?? 0);
  const [comment, setComment] = useState(mine?.comment ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (review: Parameters<typeof postReview>[1]) =>
      postReview(target, review),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: reviewsQueryKey(target),
      });
      onSaved?.();
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseReviewInput({ rating, comment });
    if ('error' in parsed) {
      setFormError(parsed.error);
      return;
    }
    setFormError(null);
    mutation.mutate(parsed.review);
  };

  const error =
    formError ??
    (mutation.error instanceof Error ? mutation.error.message : null);

  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Write a review">
      <p className="font-poppins font-semibold text-neutral-900">
        {mine ? 'Edit your review' : `Review ${subject}`}
      </p>
      <StarPicker value={rating} onChange={setRating} />
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-neutral-700">
          Your review{' '}
          <span className="font-normal text-neutral-500">(optional)</span>
        </span>
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={REVIEW_COMMENT_MAX}
          rows={4}
          placeholder="What did you like? How was delivery?"
          className="w-full rounded-lg border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none transition focus:border-brand-start focus:ring-2 focus:ring-brand-start/20"
        />
        <span className="mt-1 block text-right text-xs text-neutral-500">
          {comment.length}/{REVIEW_COMMENT_MAX}
        </span>
      </label>
      {error && (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      )}
      {mutation.isSuccess && !mutation.isPending && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm font-medium text-emerald-700"
        >
          <CheckCircle2 size={16} aria-hidden />
          {mutation.data.message ?? 'Thanks for your review!'}
        </p>
      )}
      <button
        type="submit"
        disabled={mutation.isPending}
        className={primaryButtonClassName}
      >
        {mutation.isPending && <Loader2 size={16} className="animate-spin" />}
        {mine ? 'Update review' : 'Post review'}
      </button>
    </form>
  );
}

function ReviewItem({ review }: { review: Review }) {
  return (
    <li className="space-y-2 border-t border-neutral-200 py-5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Stars rating={review.rating} size={14} />
        <span className="text-sm font-medium text-neutral-900">
          {review.authorName}
        </span>
        {review.verified && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
            <BadgeCheck size={14} aria-hidden />
            Verified buyer
          </span>
        )}
        <span className="text-xs text-neutral-500">
          {formatDate(review.createdAt)}
          {review.updatedAt !== review.createdAt && ' · edited'}
        </span>
      </div>
      {review.comment && (
        <p className="text-sm whitespace-pre-line text-neutral-700">
          {review.comment}
        </p>
      )}
    </li>
  );
}

/** Ratings summary, the shopper's review form and the reviews of a product or shop. */
export function ReviewsSection({
  target,
  subject,
  returnTo,
  onSaved,
}: {
  target: ReviewTarget;
  /** What is being reviewed, e.g. "this product" or the shop's name. */
  subject: string;
  /** Page to come back to after logging in to write a review. */
  returnTo: string;
  onSaved?: () => void;
}) {
  const { user, isLoading: userLoading } = useUser();
  const query = useInfiniteQuery({
    queryKey: [...reviewsQueryKey(target), user?.id ?? null],
    queryFn: ({ pageParam }) => listReviews(target, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page < last.totalPages ? last.page + 1 : undefined,
    enabled: !userLoading,
  });

  const first = query.data?.pages[0];
  const reviews = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section
      id="reviews"
      aria-labelledby="reviews-heading"
      className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-8"
    >
      <h2
        id="reviews-heading"
        className="flex items-center gap-2 font-poppins text-xl font-semibold text-neutral-900"
      >
        <MessageSquareText size={20} className="text-brand-start" aria-hidden />
        Reviews
      </h2>

      {query.isPending ? (
        <div role="status" aria-label="Loading reviews" className="py-10">
          <Loader2
            className="mx-auto animate-spin text-brand-start"
            size={24}
          />
        </div>
      ) : query.error || !first ? (
        <p className="py-6 text-sm text-neutral-600">
          Reviews couldn’t be loaded.{' '}
          <button
            type="button"
            onClick={() => query.refetch()}
            className="font-medium text-brand-start hover:text-brand-end"
          >
            Try again
          </button>
        </p>
      ) : (
        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="space-y-8">
            <SummaryPanel summary={first.summary} />
            <div className="rounded-xl bg-neutral-50 p-5">
              {user ? (
                <ReviewForm
                  key={user.id}
                  target={target}
                  subject={subject}
                  mine={first.mine}
                  onSaved={onSaved}
                />
              ) : (
                <>
                  <p className="font-poppins font-semibold text-neutral-900">
                    Share your thoughts
                  </p>
                  <p className="mt-1 text-sm text-neutral-600">
                    Log in to rate {subject} and help other shoppers.
                  </p>
                  <Link
                    href="/login"
                    onClick={() => rememberReturnTo(returnTo)}
                    className={`mt-4 ${primaryButtonClassName}`}
                  >
                    Log in to write a review
                  </Link>
                </>
              )}
            </div>
          </div>

          <div>
            {reviews.length === 0 ? (
              <p className="rounded-xl border border-dashed border-neutral-300 px-6 py-10 text-center text-sm text-neutral-600">
                No reviews yet. Be the first to review {subject}.
              </p>
            ) : (
              <>
                <ul aria-label="Customer reviews">
                  {reviews.map((review) => (
                    <ReviewItem key={review.id} review={review} />
                  ))}
                </ul>
                {query.hasNextPage && (
                  <button
                    type="button"
                    onClick={() => query.fetchNextPage()}
                    disabled={query.isFetchingNextPage}
                    className="mt-2 inline-flex items-center gap-2 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:border-brand-start hover:text-brand-start disabled:opacity-60"
                  >
                    {query.isFetchingNextPage && (
                      <Loader2 size={16} className="animate-spin" />
                    )}
                    Show more reviews
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
