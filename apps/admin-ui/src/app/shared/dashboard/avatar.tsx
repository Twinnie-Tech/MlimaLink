'use client';

import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { sizedImage } from '@org/models/catalog';
import { initials } from '../hooks/use-admin';

const TONES = [
  'bg-blue-500/15 text-blue-700',
  'bg-emerald-500/15 text-emerald-700',
  'bg-violet-500/15 text-violet-700',
  'bg-amber-500/15 text-amber-700',
  'bg-rose-500/15 text-rose-700',
];

/** The same name always gets the same colour. */
function toneFor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length];
}

/** A round photo, or the person's initials when there is none or it fails to load. */
export function Avatar({
  name,
  src,
  size = 36,
}: {
  name: string;
  src?: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };

  if (src && !failed) {
    return (
      <img
        src={sizedImage(src, size * 2)}
        alt=""
        style={style}
        className="shrink-0 rounded-full bg-neutral-100 object-cover"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ ...style, fontSize: size * 0.38 }}
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${toneFor(name)}`}
    >
      {initials(name)}
    </span>
  );
}

/** A product's cover photo, or a placeholder when it has none. */
export function ProductThumb({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      <img
        src={sizedImage(src, 96)}
        alt=""
        className="h-12 w-12 shrink-0 rounded-lg bg-neutral-100 object-cover"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-400"
    >
      <ImageOff size={18} />
    </span>
  );
}

/** Name and email beside an avatar, the first cell of the account tables. */
export function PersonCell({
  name,
  email,
  src,
  detail,
}: {
  name: string;
  email: string;
  src?: string | null;
  detail?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Avatar name={name} src={src} />
      <span className="min-w-0">
        <span className="block font-medium text-neutral-900">{name}</span>
        <span className="block text-xs text-neutral-500">{email}</span>
        {detail && (
          <span className="block text-xs text-neutral-500">{detail}</span>
        )}
      </span>
    </div>
  );
}
