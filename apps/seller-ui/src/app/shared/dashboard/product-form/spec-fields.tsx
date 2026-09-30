'use client';

import { Plus, Trash2 } from 'lucide-react';
import { MAX_SPECS } from '@org/models/catalog';
import { inputClassName, labelClassName } from '../ui';

/** A product detail being edited. Category details have a fixed name; custom ones don't. */
export type SpecDraft = {
  id: string;
  name: string;
  value: string;
  custom: boolean;
  placeholder?: string;
  suggestions?: string[];
};

export function SpecFields({
  specs,
  error,
  onChange,
  nextId,
}: {
  specs: SpecDraft[];
  error?: string;
  onChange: (specs: SpecDraft[]) => void;
  nextId: () => string;
}) {
  const update = (id: string, changes: Partial<SpecDraft>) =>
    onChange(
      specs.map((spec) => (spec.id === id ? { ...spec, ...changes } : spec)),
    );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {specs
          .filter((spec) => !spec.custom)
          .map((spec) => {
            const listId = spec.suggestions
              ? `${spec.id}-suggestions`
              : undefined;
            return (
              <div key={spec.id}>
                <label htmlFor={spec.id} className={labelClassName}>
                  {spec.name}
                </label>
                <input
                  id={spec.id}
                  value={spec.value}
                  onChange={(event) =>
                    update(spec.id, { value: event.target.value })
                  }
                  maxLength={100}
                  list={listId}
                  placeholder={
                    spec.placeholder ??
                    (spec.suggestions
                      ? spec.suggestions.join(', ')
                      : 'Optional')
                  }
                  className={inputClassName}
                />
                {listId && (
                  <datalist id={listId}>
                    {spec.suggestions?.map((suggestion) => (
                      <option key={suggestion} value={suggestion} />
                    ))}
                  </datalist>
                )}
              </div>
            );
          })}
      </div>

      {specs
        .filter((spec) => spec.custom)
        .map((spec, index) => (
          <div key={spec.id} className="flex items-start gap-2">
            <input
              value={spec.name}
              onChange={(event) =>
                update(spec.id, { name: event.target.value })
              }
              maxLength={40}
              placeholder="Detail, e.g. Heel height"
              aria-label={`Detail ${index + 1} name`}
              className={inputClassName}
            />
            <input
              value={spec.value}
              onChange={(event) =>
                update(spec.id, { value: event.target.value })
              }
              maxLength={100}
              placeholder="Value, e.g. 5 cm"
              aria-label={`Detail ${index + 1} value`}
              className={inputClassName}
            />
            <button
              type="button"
              onClick={() =>
                onChange(specs.filter((item) => item.id !== spec.id))
              }
              aria-label={`Remove detail ${index + 1}`}
              className="mt-1.5 rounded p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-rose-600 dark:hover:bg-white/5"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}

      {error && (
        <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      {specs.length < MAX_SPECS && (
        <button
          type="button"
          onClick={() =>
            onChange([
              ...specs,
              { id: nextId(), name: '', value: '', custom: true },
            ])
          }
          className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          <Plus size={15} /> Add a detail
        </button>
      )}
    </div>
  );
}
