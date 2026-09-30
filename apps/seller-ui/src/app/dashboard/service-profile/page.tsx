'use client';

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  CloudOff,
  ExternalLink,
  ImagePlus,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import type { OwnServiceProfile } from '@org/models';
import { sizedImage } from '@org/models/catalog';
import {
  ABOUT_MAX,
  MAX_PORTFOLIO_PHOTOS,
  MAX_QUALIFICATIONS,
  MAX_SKILLS,
  parseServiceProfileInput,
} from '@org/models/services';
import { useDashboardSeller } from '../../shared/dashboard/seller-context';
import {
  Field,
  PageHeader,
  Panel,
  describedBy,
  inputClassName,
  labelClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from '../../shared/dashboard/ui';
import {
  deleteProductImage,
  uploadProductImage,
} from '../../shared/utils/product-images-api';
import { AuthRequestError } from '../../shared/utils/seller-api';
import {
  getMyServiceProfile,
  saveServiceProfile,
} from '../../shared/utils/services-api';

const PROFILE_KEY = ['seller-service-profile'];
const SHOP_URL = (
  process.env.NEXT_PUBLIC_SHOP_URL ?? 'http://localhost:4200'
).replace(/\/+$/, '');

type ProfileForm = {
  headline: string;
  about: string;
  yearsExperience: string;
  serviceArea: string;
  remote: boolean;
};

type QualificationDraft = {
  id: number;
  title: string;
  issuer: string;
  year: string;
};

type PortfolioPhoto = {
  /** What to show: a local preview while uploading, then the ImageKit URL. */
  src: string;
  file?: File;
  status: 'uploading' | 'uploaded' | 'failed';
  fileId?: string;
  url?: string;
  /** Already part of the saved profile, so the api deletes it when it's removed on save. */
  saved: boolean;
};

let draftId = 0;
const nextId = () => ++draftId;

const isMissingRoute = (error: unknown) =>
  error instanceof AuthRequestError && error.status === 404;

const errorMessage = (error: unknown, fallback: string) => {
  if (isMissingRoute(error)) {
    return 'Service profiles aren’t available right now. Please try again in a few minutes.';
  }
  return error instanceof AuthRequestError ? error.message : fallback;
};

/** Deletes an upload that never became part of the saved profile. */
function discardUnsaved(photo: PortfolioPhoto) {
  if (photo.file) URL.revokeObjectURL(photo.src);
  if (!photo.saved && photo.fileId) {
    deleteProductImage(photo.fileId).catch(() => undefined);
  }
}

const savedPhotos = (profile: OwnServiceProfile | null): PortfolioPhoto[] =>
  (profile?.portfolio ?? []).map((url, index) => ({
    src: url,
    url,
    fileId: profile?.portfolioFileIds[index],
    status: 'uploaded',
    saved: true,
  }));

function ProfileEditor({ profile }: { profile: OwnServiceProfile | null }) {
  const { shop } = useDashboardSeller();
  const queryClient = useQueryClient();
  const [skills, setSkills] = useState<string[]>(profile?.skills ?? []);
  const [skillDraft, setSkillDraft] = useState('');
  const [skillError, setSkillError] = useState<string | null>(null);
  const [qualifications, setQualifications] = useState<QualificationDraft[]>(
    () =>
      (profile?.qualifications ?? []).map((qualification) => ({
        id: nextId(),
        title: qualification.title,
        issuer: qualification.issuer ?? '',
        year: qualification.year ? String(qualification.year) : '',
      })),
  );
  const [photos, setPhotos] = useState<PortfolioPhoto[]>(() =>
    savedPhotos(profile),
  );
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const photosRef = useRef(photos);
  const discarded = useRef(new Set<string>());

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ProfileForm>({
    defaultValues: {
      headline: profile?.headline ?? '',
      about: profile?.about ?? '',
      yearsExperience: profile !== null ? String(profile.yearsExperience) : '',
      serviceArea: profile?.serviceArea ?? '',
      remote: profile?.remote ?? false,
    },
  });
  const about = watch('about') ?? '';

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => () => photosRef.current.forEach(discardUnsaved), []);

  const addSkill = () => {
    const skill = skillDraft.trim();
    if (!skill) return;
    if (skill.length > 40) {
      setSkillError('Keep each skill to 40 characters or fewer.');
      return;
    }
    if (skills.some((item) => item.toLowerCase() === skill.toLowerCase())) {
      setSkillError(`${skill} is already listed.`);
      return;
    }
    if (skills.length >= MAX_SKILLS) {
      setSkillError(`You can list up to ${MAX_SKILLS} skills.`);
      return;
    }
    setSkills((current) => [...current, skill]);
    setSkillDraft('');
    setSkillError(null);
  };

  const onSkillKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addSkill();
    }
  };

  const updateQualification = (
    id: number,
    change: Partial<QualificationDraft>,
  ) =>
    setQualifications((current) =>
      current.map((item) => (item.id === id ? { ...item, ...change } : item)),
    );

  const updatePhoto = (src: string, change: Partial<PortfolioPhoto>) =>
    setPhotos((current) =>
      current.map((photo) =>
        photo.src === src ? { ...photo, ...change } : photo,
      ),
    );

  const upload = (photo: PortfolioPhoto) => {
    if (!photo.file) return;
    uploadProductImage(photo.file).then(
      ({ fileId, url }) => {
        if (discarded.current.has(photo.src)) {
          deleteProductImage(fileId).catch(() => undefined);
        } else {
          updatePhoto(photo.src, { status: 'uploaded', fileId, url });
        }
      },
      (error: unknown) => {
        if (discarded.current.has(photo.src)) return;
        updatePhoto(photo.src, { status: 'failed' });
        setPhotoError(
          error instanceof Error ? error.message : 'Could not upload a photo.',
        );
      },
    );
  };

  const addPhotos = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((file) =>
      file.type.startsWith('image/'),
    );
    event.target.value = '';
    const room = MAX_PORTFOLIO_PHOTOS - photos.length;
    setPhotoError(
      files.length > room
        ? `You can show up to ${MAX_PORTFOLIO_PHOTOS} photos.`
        : null,
    );
    const added = files.slice(0, room).map((file): PortfolioPhoto => ({
      file,
      src: URL.createObjectURL(file),
      status: 'uploading',
      saved: false,
    }));
    setPhotos((current) => [...current, ...added]);
    added.forEach(upload);
  };

  const removePhoto = (photo: PortfolioPhoto) => {
    discarded.current.add(photo.src);
    discardUnsaved(photo);
    setPhotos((current) => current.filter((item) => item.src !== photo.src));
    setPhotoError(null);
  };

  const onSubmit = async (form: ProfileForm) => {
    setSaved(null);
    setSubmitError(null);
    if (photos.some((photo) => photo.status === 'uploading')) {
      setSubmitError('Wait for your photos to finish uploading.');
      return;
    }
    if (photos.some((photo) => photo.status === 'failed')) {
      setSubmitError('Some photos didn’t upload. Retry or remove them.');
      return;
    }

    const parsed = parseServiceProfileInput({
      headline: form.headline,
      about: form.about,
      skills,
      yearsExperience: Number(form.yearsExperience),
      qualifications: qualifications
        .filter((item) => item.title.trim() || item.issuer.trim() || item.year)
        .map((item) => ({
          title: item.title,
          issuer: item.issuer,
          ...(item.year && { year: Number(item.year) }),
        })),
      serviceArea: form.serviceArea,
      remote: form.remote,
      portfolio: photos.map((photo) => photo.url),
      portfolioFileIds: photos.map((photo) => photo.fileId),
    });
    if ('error' in parsed) {
      setSubmitError(parsed.error);
      return;
    }

    setSaving(true);
    try {
      const response = await saveServiceProfile(parsed.profile);
      queryClient.setQueryData(PROFILE_KEY, response.data);
      photos.forEach((photo) => {
        if (photo.file) URL.revokeObjectURL(photo.src);
      });
      setPhotos(savedPhotos(response.data));
      setSaved(response.message ?? 'Your provider profile is saved.');
    } catch (error) {
      setSubmitError(
        errorMessage(error, 'Could not save your profile. Please try again.'),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="grid gap-6 xl:grid-cols-3"
    >
      <div className="space-y-6 xl:col-span-2">
        <Panel
          title="About you"
          description="Shoppers see this next to every service you list."
        >
          <div className="space-y-5">
            <Field
              id="headline"
              label="Headline"
              hint="5–100 characters"
              error={errors.headline?.message}
            >
              <input
                {...describedBy('headline', errors.headline?.message)}
                placeholder="e.g. Full-stack developer building web and mobile apps"
                maxLength={100}
                className={inputClassName}
                {...register('headline', {
                  required: 'Add a headline',
                  validate: (value) =>
                    value.trim().length >= 5 || 'Use at least 5 characters',
                })}
              />
            </Field>

            <Field
              id="about"
              label="About your work"
              hint={`${about.length}/${ABOUT_MAX}`}
            >
              <textarea
                id="about"
                rows={5}
                maxLength={ABOUT_MAX}
                placeholder="What you do, who you've worked with and how you like to work."
                className={inputClassName}
                {...register('about')}
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                id="yearsExperience"
                label="Years of experience"
                error={errors.yearsExperience?.message}
              >
                <input
                  {...describedBy(
                    'yearsExperience',
                    errors.yearsExperience?.message,
                  )}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="60"
                  step="1"
                  placeholder="0"
                  className={inputClassName}
                  {...register('yearsExperience', {
                    required: 'Enter your years of experience',
                    validate: (value) => {
                      const years = Number(value);
                      return (
                        (Number.isInteger(years) &&
                          years >= 0 &&
                          years <= 60) ||
                        'Enter a whole number from 0 to 60'
                      );
                    },
                  })}
                />
              </Field>

              <Field
                id="serviceArea"
                label="Where you work"
                error={errors.serviceArea?.message}
              >
                <input
                  {...describedBy('serviceArea', errors.serviceArea?.message)}
                  placeholder="e.g. Nairobi and Kiambu"
                  maxLength={100}
                  className={inputClassName}
                  {...register('serviceArea', {
                    required: 'Say where you work',
                  })}
                />
              </Field>
            </div>

            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-blue-600"
                {...register('remote')}
              />
              <span>
                <span className="block font-medium text-neutral-900">
                  I also work online
                </span>
                <span className="text-neutral-500">
                  Shoppers anywhere can hire you for remote work.
                </span>
              </span>
            </label>
          </div>
        </Panel>

        <Panel
          title="Skills"
          description={`Up to ${MAX_SKILLS}. Shoppers search by these.`}
        >
          <label htmlFor="skill" className={labelClassName}>
            Add a skill
          </label>
          <div className="flex gap-2">
            <input
              id="skill"
              value={skillDraft}
              onChange={(event) => {
                setSkillDraft(event.target.value);
                setSkillError(null);
              }}
              onKeyDown={onSkillKey}
              placeholder="e.g. React, Bridal makeup, Conveyancing"
              aria-invalid={Boolean(skillError)}
              aria-describedby={skillError ? 'skill-error' : undefined}
              className={inputClassName}
            />
            <button
              type="button"
              onClick={addSkill}
              className={secondaryButtonClassName}
            >
              <Plus size={15} /> Add
            </button>
          </div>
          {skillError && (
            <p
              id="skill-error"
              className="mt-1.5 text-xs text-rose-600 dark:text-rose-400"
            >
              {skillError}
            </p>
          )}
          {skills.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Your skills">
              {skills.map((skill) => (
                <li
                  key={skill}
                  className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 py-1 pr-1 pl-3 text-sm text-blue-800 dark:text-blue-300"
                >
                  {skill}
                  <button
                    type="button"
                    onClick={() =>
                      setSkills((current) =>
                        current.filter((item) => item !== skill),
                      )
                    }
                    aria-label={`Remove ${skill}`}
                    className="rounded-full p-1 hover:bg-blue-500/20"
                  >
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Qualifications"
          description="Degrees, licences and certificates that back up your skills. Optional."
        >
          <div className="space-y-4">
            {qualifications.map((item, index) => (
              <fieldset
                key={item.id}
                className="grid gap-3 rounded-lg border border-neutral-200 p-3 sm:grid-cols-[2fr_2fr_1fr_auto] sm:items-end"
              >
                <legend className="sr-only">Qualification {index + 1}</legend>
                <div>
                  <label
                    htmlFor={`qualification-${item.id}-title`}
                    className={labelClassName}
                  >
                    Qualification
                  </label>
                  <input
                    id={`qualification-${item.id}-title`}
                    value={item.title}
                    onChange={(event) =>
                      updateQualification(item.id, {
                        title: event.target.value,
                      })
                    }
                    placeholder="e.g. BSc Computer Science"
                    maxLength={100}
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label
                    htmlFor={`qualification-${item.id}-issuer`}
                    className={labelClassName}
                  >
                    Awarded by
                  </label>
                  <input
                    id={`qualification-${item.id}-issuer`}
                    value={item.issuer}
                    onChange={(event) =>
                      updateQualification(item.id, {
                        issuer: event.target.value,
                      })
                    }
                    placeholder="e.g. University of Nairobi"
                    maxLength={100}
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label
                    htmlFor={`qualification-${item.id}-year`}
                    className={labelClassName}
                  >
                    Year
                  </label>
                  <input
                    id={`qualification-${item.id}-year`}
                    value={item.year}
                    onChange={(event) =>
                      updateQualification(item.id, {
                        year: event.target.value,
                      })
                    }
                    type="number"
                    inputMode="numeric"
                    placeholder="2019"
                    className={inputClassName}
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setQualifications((current) =>
                      current.filter((entry) => entry.id !== item.id),
                    )
                  }
                  aria-label={`Remove qualification ${index + 1}`}
                  className="justify-self-start rounded-lg p-2.5 text-neutral-500 hover:bg-neutral-100 hover:text-rose-600 dark:hover:bg-white/5"
                >
                  <Trash2 size={16} />
                </button>
              </fieldset>
            ))}
            {qualifications.length < MAX_QUALIFICATIONS && (
              <button
                type="button"
                onClick={() =>
                  setQualifications((current) => [
                    ...current,
                    { id: nextId(), title: '', issuer: '', year: '' },
                  ])
                }
                className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                <Plus size={15} /> Add a qualification
              </button>
            )}
          </div>
        </Panel>

        <Panel
          title="Portfolio"
          description={`Up to ${MAX_PORTFOLIO_PHOTOS} photos of work you've done. Optional.`}
        >
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {photos.map((photo, index) => (
              <div
                key={photo.src}
                className="relative aspect-square overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50"
              >
                <img
                  src={photo.file ? photo.src : sizedImage(photo.src, 240)}
                  alt={`Portfolio photo ${index + 1}`}
                  className="h-full w-full object-cover"
                />
                {photo.status === 'uploading' && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                    <Loader2
                      size={20}
                      className="animate-spin"
                      aria-hidden="true"
                    />
                    <span className="sr-only">
                      Uploading portfolio photo {index + 1}
                    </span>
                  </span>
                )}
                {photo.status === 'failed' && (
                  <button
                    type="button"
                    onClick={() => {
                      updatePhoto(photo.src, { status: 'uploading' });
                      setPhotoError(null);
                      upload(photo);
                    }}
                    aria-label={`Retry uploading portfolio photo ${index + 1}`}
                    className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-rose-700/60 text-[11px] font-medium text-white hover:bg-rose-700/70"
                  >
                    <RotateCcw size={18} aria-hidden="true" />
                    Retry
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removePhoto(photo)}
                  aria-label={`Remove portfolio photo ${index + 1}`}
                  className="absolute top-1 right-1 rounded-full bg-black/70 p-1 text-white hover:bg-rose-600"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {photos.length < MAX_PORTFOLIO_PHOTOS && (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-neutral-300 text-xs text-neutral-500 transition hover:border-blue-500/50 hover:text-blue-700"
              >
                <ImagePlus size={22} />
                Add photo
              </button>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            onChange={addPhotos}
            className="sr-only"
            aria-label="Upload portfolio photos"
            tabIndex={-1}
          />
          {photoError && (
            <p
              role="alert"
              className="mt-3 text-xs text-rose-600 dark:text-rose-400"
            >
              {photoError}
            </p>
          )}
        </Panel>
      </div>

      <div className="space-y-6">
        <Panel title="How shoppers find you">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-600">
            <li>Fill in this profile.</li>
            <li>
              <Link
                href="/dashboard/create-product"
                className="font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                Create a listing
              </Link>{' '}
              in the Services category for each service you offer, with a
              starting price.
            </li>
            <li>
              Shoppers send requests to your{' '}
              <Link
                href="/dashboard/service-requests"
                className="font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                Service Requests
              </Link>{' '}
              inbox, and you get an email for each one.
            </li>
          </ol>
          {profile && (
            <a
              href={`${SHOP_URL}/providers/${shop.id}`}
              target="_blank"
              rel="noreferrer"
              className={`${secondaryButtonClassName} mt-5 w-full`}
            >
              <ExternalLink size={15} /> View your public profile
            </a>
          )}
        </Panel>

        {saved && (
          <p
            role="status"
            className="flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-3 text-sm text-emerald-800"
          >
            <CheckCircle2
              size={18}
              className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400"
            />
            {saved}
          </p>
        )}

        {submitError && (
          <p
            role="alert"
            className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700"
          >
            {submitError}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className={`${primaryButtonClassName} w-full`}
        >
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </form>
  );
}

export default function ServiceProfilePage() {
  const { data, isPending, error, refetch, isRefetching } = useQuery({
    queryKey: PROFILE_KEY,
    queryFn: getMyServiceProfile,
    retry: (failures, failure) =>
      !(
        failure instanceof AuthRequestError &&
        failure.status >= 400 &&
        failure.status < 500
      ) && failures < 2,
    // Edits live in the form, so don't swap the profile out underneath them.
    refetchOnWindowFocus: false,
  });

  return (
    <>
      <PageHeader
        title="Service Profile"
        description="Show shoppers your skills, qualifications and past work so they can hire you."
      />
      {isPending ? (
        <div
          role="status"
          aria-label="Loading your service profile"
          className="flex justify-center py-14"
        >
          <Loader2 className="animate-spin text-blue-600" size={28} />
        </div>
      ) : error ? (
        <Panel>
          <div
            role="alert"
            className="flex flex-col items-center px-6 py-12 text-center"
          >
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <CloudOff size={22} />
            </span>
            <p className="font-poppins font-semibold text-neutral-900">
              Couldn&apos;t load your profile
            </p>
            <p className="mt-1.5 max-w-sm text-sm text-neutral-500">
              {errorMessage(
                error,
                'Something went wrong while loading your service profile.',
              )}
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isRefetching}
              className={`${secondaryButtonClassName} mt-5`}
            >
              <RefreshCw
                size={15}
                className={isRefetching ? 'animate-spin' : undefined}
              />
              {isRefetching ? 'Trying again…' : 'Try again'}
            </button>
          </div>
        </Panel>
      ) : (
        <ProfileEditor profile={data ?? null} />
      )}
    </>
  );
}
