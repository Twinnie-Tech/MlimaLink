import type { Product } from './product.model.js';

/** A qualification that backs up a provider's skills, e.g. a degree, licence or certificate. */
export interface Qualification {
  /** e.g. "BSc Computer Science" or "Advocate of the High Court of Kenya" */
  title: string;
  /** Who awarded it, e.g. "University of Nairobi". */
  issuer?: string;
  year?: number;
}

/** What a seller fills in to present themselves as a service provider. */
export interface ServiceProfileInput {
  /** One line, e.g. "Full-stack developer building web and mobile apps". */
  headline: string;
  /** Plain text; may be empty. */
  about: string;
  skills: string[];
  yearsExperience: number;
  qualifications: Qualification[];
  /** Where they work, e.g. "Nairobi and Kiambu". */
  serviceArea: string;
  /** Also takes work online. */
  remote: boolean;
  /** Photos of past work: ImageKit URLs. */
  portfolio: string[];
  /** ImageKit file id of each portfolio photo, in the same order. */
  portfolioFileIds: string[];
}

/** A provider's profile as shoppers see it. */
export interface ServiceProfile extends Omit<
  ServiceProfileInput,
  'portfolioFileIds'
> {
  shopId: string;
  shopName: string;
  /** ISO date string. */
  updatedAt: string;
}

/** The seller's own profile, with the file ids they need to edit the portfolio. */
export type OwnServiceProfile = ServiceProfile &
  Pick<ServiceProfileInput, 'portfolioFileIds'>;

/** A provider's public page: their profile and the services they list. */
export interface Provider {
  profile: ServiceProfile;
  services: Product[];
}

export type ServiceRequestStatus =
  'pending' | 'accepted' | 'declined' | 'completed';

/** What a shopper sends to ask for a service. */
export interface ServiceRequestInput {
  /** The service listing (a product in the Services category). */
  productId: string;
  details: string;
  /** USD. */
  budget?: number;
  /** YYYY-MM-DD */
  neededBy?: string;
  /** Best number to reach the shopper on, e.g. "+254712345678". */
  phone?: string;
}

export interface ServiceRequest {
  id: string;
  productId: string;
  serviceTitle: string;
  shopId: string;
  shopName: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  details: string;
  budget?: number;
  neededBy?: string;
  status: ServiceRequestStatus;
  /** The provider's reply, shown to the shopper. */
  sellerNote?: string;
  /** ISO date strings. */
  createdAt: string;
  updatedAt: string;
}

export const MAX_SKILLS = 20;
export const MAX_QUALIFICATIONS = 10;
export const MAX_PORTFOLIO_PHOTOS = 6;
export const ABOUT_MAX = 2000;
export const REQUEST_DETAILS_MIN = 20;
export const REQUEST_DETAILS_MAX = 2000;
export const SELLER_NOTE_MAX = 500;

export const SERVICE_REQUEST_STATUSES: {
  id: ServiceRequestStatus;
  label: string;
}[] = [
  { id: 'pending', label: 'New' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'completed', label: 'Completed' },
  { id: 'declined', label: 'Declined' },
];

/** Where a request can go next: new requests are accepted or declined, accepted ones completed or declined. */
const NEXT_STATUSES: Record<ServiceRequestStatus, ServiceRequestStatus[]> = {
  pending: ['accepted', 'declined'],
  accepted: ['completed', 'declined'],
  declined: [],
  completed: [],
};

const MAX_BUDGET = 10_000_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PHONE = /^\+?[0-9][0-9 ]{6,18}$/;
const FILE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const IMAGEKIT_URL = /^https:\/\/ik\.imagekit\.io\/\S+$/;

const text = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';
const isoDay = (now: Date) => now.toISOString().slice(0, 10);
const isRealDay = (value: string) =>
  ISO_DATE.test(value) &&
  new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);

export const serviceRequestStatusLabel = (status: ServiceRequestStatus) =>
  SERVICE_REQUEST_STATUSES.find((entry) => entry.id === status)?.label ??
  status;

export const canMoveServiceRequest = (
  from: ServiceRequestStatus,
  to: ServiceRequestStatus,
) => NEXT_STATUSES[from].includes(to);

/** "5 years" or "Less than a year". */
export function experienceLabel(years: number): string {
  if (years < 1) return 'Less than a year';
  return `${years} year${years === 1 ? '' : 's'}`;
}

/** "BSc Computer Science · University of Nairobi · 2019" */
export function describeQualification(qualification: Qualification): string {
  return [qualification.title, qualification.issuer, qualification.year]
    .filter(Boolean)
    .join(' · ');
}

/** Checks a seller's provider profile. Returns it tidied, or a message saying what to fix. */
export function parseServiceProfileInput(
  value: unknown,
  now = new Date(),
): { profile: ServiceProfileInput } | { error: string } {
  const input = (value ?? {}) as Record<string, unknown>;

  const headline = text(input.headline);
  if (headline.length < 5 || headline.length > 100) {
    return { error: 'Headline must be 5 to 100 characters.' };
  }

  const about = text(input.about);
  if (about.length > ABOUT_MAX) {
    return { error: `Keep “About you” under ${ABOUT_MAX} characters.` };
  }

  const rawSkills = input.skills;
  if (!Array.isArray(rawSkills)) return { error: 'Skills must be a list.' };
  const skills = rawSkills
    .map(text)
    .filter(Boolean)
    .filter(
      (skill, index, list) =>
        list.findIndex(
          (other) => other.toLowerCase() === skill.toLowerCase(),
        ) === index,
    );
  if (skills.length === 0) return { error: 'Add at least one skill.' };
  if (skills.length > MAX_SKILLS || skills.some((skill) => skill.length > 40)) {
    return {
      error: `Use up to ${MAX_SKILLS} skills of 40 characters or fewer.`,
    };
  }

  const years = input.yearsExperience;
  if (
    !Number.isInteger(years) ||
    (years as number) < 0 ||
    (years as number) > 60
  ) {
    return {
      error: 'Years of experience must be a whole number from 0 to 60.',
    };
  }

  const rawQualifications = input.qualifications ?? [];
  if (
    !Array.isArray(rawQualifications) ||
    rawQualifications.length > MAX_QUALIFICATIONS
  ) {
    return { error: `Add up to ${MAX_QUALIFICATIONS} qualifications.` };
  }
  const thisYear = now.getUTCFullYear();
  const qualifications: Qualification[] = [];
  for (const raw of rawQualifications) {
    const entry = (raw ?? {}) as Record<string, unknown>;
    const title = text(entry.title);
    if (title.length < 2 || title.length > 100) {
      return {
        error: 'Give each qualification a name of 2 to 100 characters.',
      };
    }
    const qualification: Qualification = { title };
    const issuer = text(entry.issuer);
    if (issuer.length > 100) {
      return { error: `${title}: keep who awarded it under 100 characters.` };
    }
    if (issuer) qualification.issuer = issuer;
    if (entry.year !== undefined && entry.year !== null && entry.year !== '') {
      if (
        !Number.isInteger(entry.year) ||
        (entry.year as number) < 1950 ||
        (entry.year as number) > thisYear
      ) {
        return {
          error: `${title}: the year must be between 1950 and ${thisYear}.`,
        };
      }
      qualification.year = entry.year as number;
    }
    qualifications.push(qualification);
  }

  const serviceArea = text(input.serviceArea);
  if (serviceArea.length < 2 || serviceArea.length > 100) {
    return { error: 'Say where you work, e.g. “Nairobi and Kiambu”.' };
  }

  const portfolio = input.portfolio ?? [];
  const portfolioFileIds = input.portfolioFileIds ?? [];
  if (
    !Array.isArray(portfolio) ||
    !Array.isArray(portfolioFileIds) ||
    portfolio.length > MAX_PORTFOLIO_PHOTOS ||
    portfolio.length !== portfolioFileIds.length ||
    portfolio.some(
      (url) => typeof url !== 'string' || !IMAGEKIT_URL.test(url),
    ) ||
    portfolioFileIds.some((id) => typeof id !== 'string' || !FILE_ID.test(id))
  ) {
    return {
      error: `Add up to ${MAX_PORTFOLIO_PHOTOS} portfolio photos, uploaded from this page.`,
    };
  }

  return {
    profile: {
      headline,
      about,
      skills,
      yearsExperience: years as number,
      qualifications,
      serviceArea,
      remote: input.remote === true,
      portfolio: portfolio as string[],
      portfolioFileIds: portfolioFileIds as string[],
    },
  };
}

/** Checks a shopper's request for a service. Returns it tidied, or a message saying what to fix. */
export function parseServiceRequestInput(
  value: unknown,
  now = new Date(),
): { request: ServiceRequestInput } | { error: string } {
  const input = (value ?? {}) as Record<string, unknown>;

  const productId = text(input.productId);
  if (!productId) return { error: 'Choose a service to request.' };

  const details = text(input.details);
  if (
    details.length < REQUEST_DETAILS_MIN ||
    details.length > REQUEST_DETAILS_MAX
  ) {
    return {
      error: `Describe what you need in ${REQUEST_DETAILS_MIN} to ${REQUEST_DETAILS_MAX} characters.`,
    };
  }
  const request: ServiceRequestInput = { productId, details };

  if (
    input.budget !== undefined &&
    input.budget !== null &&
    input.budget !== ''
  ) {
    const budget = input.budget;
    if (
      typeof budget !== 'number' ||
      !Number.isFinite(budget) ||
      budget <= 0 ||
      budget > MAX_BUDGET
    ) {
      return { error: 'Budget must be more than 0.' };
    }
    request.budget = Math.round(budget * 100) / 100;
  }

  const neededBy = text(input.neededBy);
  if (neededBy) {
    if (!isRealDay(neededBy)) return { error: 'Pick a date you need it by.' };
    if (neededBy < isoDay(now)) {
      return { error: 'The date you need it by can’t be in the past.' };
    }
    request.neededBy = neededBy;
  }

  const phone = text(input.phone);
  if (phone) {
    if (!PHONE.test(phone)) {
      return { error: 'Enter a phone number like +254712345678.' };
    }
    request.phone = phone.replace(/\s+/g, '');
  }

  return { request };
}

/** Checks a provider's reply to a request. */
export function parseServiceRequestUpdate(
  value: unknown,
): { status: ServiceRequestStatus; note?: string } | { error: string } {
  const input = (value ?? {}) as Record<string, unknown>;
  const status = input.status;
  if (
    status !== 'accepted' &&
    status !== 'declined' &&
    status !== 'completed'
  ) {
    return { error: 'Choose accept, decline or completed.' };
  }
  const note = text(input.note);
  if (note.length > SELLER_NOTE_MAX) {
    return { error: `Keep your message under ${SELLER_NOTE_MAX} characters.` };
  }
  return note ? { status, note } : { status };
}
