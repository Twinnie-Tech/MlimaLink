import Link from 'next/link';
import { Award, BadgeCheck, Briefcase, Globe, MapPin } from 'lucide-react';
import type { ServiceProfile } from '@org/models';
import { imageSrcSet, sizedImage } from '@org/models/catalog';
import { describeQualification, experienceLabel } from '@org/models/services';

/** A provider's skills, qualifications, experience and past work. */
export function ProviderCard({
  profile,
  showProfileLink = false,
}: {
  profile: ServiceProfile;
  showProfileLink?: boolean;
}) {
  return (
    <section
      aria-label={`About ${profile.shopName}`}
      className="rounded-xl border border-neutral-200 bg-white p-5 text-left shadow-sm"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-start/10 text-brand-start">
          <BadgeCheck size={22} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="font-poppins font-semibold text-neutral-900">
            {profile.shopName}
          </p>
          <p className="text-sm text-neutral-600">{profile.headline}</p>
        </div>
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-neutral-600">
        <li className="inline-flex items-center gap-1.5">
          <Briefcase size={15} aria-hidden="true" />
          {experienceLabel(profile.yearsExperience)} experience
        </li>
        <li className="inline-flex items-center gap-1.5">
          <MapPin size={15} aria-hidden="true" />
          {profile.serviceArea}
        </li>
        {profile.remote && (
          <li className="inline-flex items-center gap-1.5">
            <Globe size={15} aria-hidden="true" />
            Works online
          </li>
        )}
      </ul>

      {profile.about && (
        <p className="mt-4 text-sm whitespace-pre-line text-neutral-700">
          {profile.about}
        </p>
      )}

      <h3 className="mt-4 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
        Skills
      </h3>
      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Skills">
        {profile.skills.map((skill) => (
          <li
            key={skill}
            className="rounded-full bg-brand-start/10 px-2.5 py-1 text-xs font-medium text-brand-start"
          >
            {skill}
          </li>
        ))}
      </ul>

      {profile.qualifications.length > 0 && (
        <>
          <h3 className="mt-4 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
            Qualifications
          </h3>
          <ul className="mt-2 space-y-1.5" aria-label="Qualifications">
            {profile.qualifications.map((qualification) => (
              <li
                key={describeQualification(qualification)}
                className="flex items-start gap-2 text-sm text-neutral-700"
              >
                <Award
                  size={15}
                  className="mt-0.5 shrink-0 text-amber-500"
                  aria-hidden="true"
                />
                {describeQualification(qualification)}
              </li>
            ))}
          </ul>
        </>
      )}

      {profile.portfolio.length > 0 && (
        <>
          <h3 className="mt-4 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
            Past work
          </h3>
          <ul className="mt-2 grid grid-cols-3 gap-2" aria-label="Past work">
            {profile.portfolio.map((url, index) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noreferrer">
                  <img
                    src={sizedImage(url, 320)}
                    srcSet={imageSrcSet(url, [240, 480])}
                    sizes="120px"
                    alt={`Past work ${index + 1} by ${profile.shopName}`}
                    loading="lazy"
                    className="aspect-square w-full rounded-lg object-cover"
                  />
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      {showProfileLink && (
        <Link
          href={`/providers/${profile.shopId}`}
          className="mt-4 inline-flex text-sm font-medium text-brand-start hover:text-brand-end"
        >
          See all services from {profile.shopName} →
        </Link>
      )}
    </section>
  );
}
