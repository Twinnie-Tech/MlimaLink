'use client';

import { useState, type KeyboardEvent } from 'react';
import { ImageUp } from 'lucide-react';
import { CATEGORY_TEMPLATES } from '@org/models/catalog';
import {
  PageHeader,
  Panel,
  PreviewNotice,
  inputClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from '../../shared/dashboard/ui';

type Tab = 'categories' | 'logo' | 'banner';

const TABS: { id: Tab; label: string }[] = [
  { id: 'categories', label: 'Categories' },
  { id: 'logo', label: 'Logo' },
  { id: 'banner', label: 'Banner' },
];

function UploadBox({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-neutral-300 px-6 py-10 text-center">
      <ImageUp size={26} className="text-neutral-400" aria-hidden="true" />
      <p className="mt-3 font-medium text-neutral-900">{label}</p>
      <p className="mt-1 text-sm text-neutral-500">{hint}</p>
      <button
        type="button"
        disabled
        className={`${secondaryButtonClassName} mt-4`}
      >
        Choose file
      </button>
    </div>
  );
}

function CategoriesTab() {
  return (
    <>
      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 xl:grid-cols-3">
        {CATEGORY_TEMPLATES.map((category) => (
          <section key={category.name} aria-label={category.name}>
            <h3 className="font-poppins font-semibold text-neutral-900">
              {category.name}
            </h3>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-neutral-600">
              {category.subCategories.map((sub) => (
                <li key={sub.name}>{sub.name}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <fieldset
        disabled
        className="mt-8 space-y-3 border-t border-neutral-200 pt-6"
      >
        <legend className="sr-only">Add categories</legend>
        <div className="flex flex-wrap gap-3">
          <input
            aria-label="New category"
            placeholder="New category"
            className={`${inputClassName} max-w-xs`}
          />
          <button type="button" className={primaryButtonClassName}>
            Add category
          </button>
        </div>
        <div className="flex flex-wrap gap-3">
          <select
            aria-label="Category for the new subcategory"
            className={`${inputClassName} w-auto`}
          >
            <option>Select category</option>
            {CATEGORY_TEMPLATES.map((category) => (
              <option key={category.name}>{category.name}</option>
            ))}
          </select>
          <input
            aria-label="New subcategory"
            placeholder="New subcategory"
            className={`${inputClassName} max-w-xs`}
          />
          <button type="button" className={primaryButtonClassName}>
            Add subcategory
          </button>
        </div>
      </fieldset>
    </>
  );
}

function LogoTab() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <p className="mb-2 text-sm font-medium text-neutral-700">
          Current logo
        </p>
        <div className="flex h-40 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50">
          <span className="font-poppins text-4xl font-semibold text-neutral-900">
            MlimaLink
          </span>
        </div>
      </div>
      <UploadBox
        label="Upload a new logo"
        hint="SVG or PNG with a transparent background, at least 400 px wide."
      />
    </div>
  );
}

function BannerTab() {
  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-sm font-medium text-neutral-700">
          Current banner
        </p>
        <div className="flex h-44 flex-col justify-center rounded-xl bg-gradient-to-r from-brand-start to-brand-end px-8 text-white">
          <p className="font-poppins text-2xl font-semibold">
            Fresh from Mt Kenya
          </p>
          <p className="mt-1 text-sm text-white/80">
            The offers banner on the home page shows products on sale.
          </p>
        </div>
      </div>
      <UploadBox
        label="Upload a new banner"
        hint="JPG or PNG, 1600 × 500 px or larger."
      />
    </div>
  );
}

export default function CustomizationPage() {
  const [tab, setTab] = useState<Tab>('categories');

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const index = TABS.findIndex((t) => t.id === tab);
    const next = TABS[(index + step + TABS.length) % TABS.length];
    setTab(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  };

  return (
    <>
      <PageHeader
        title="Customization"
        description="The store's categories, logo and banner."
      />
      <PreviewNotice>
        A preview: categories come from the product catalog today, and saving
        changes here will be switched on in a later release.
      </PreviewNotice>

      <Panel>
        <div
          role="tablist"
          aria-label="What to customize"
          onKeyDown={onKeyDown}
          className="mb-6 flex gap-6 border-b border-neutral-200"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 pb-3 text-sm font-medium transition ${
                tab === t.id
                  ? 'border-blue-600 text-neutral-900'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
          {tab === 'categories' && <CategoriesTab />}
          {tab === 'logo' && <LogoTab />}
          {tab === 'banner' && <BannerTab />}
        </div>
      </Panel>
    </>
  );
}
