'use client';

import { useState, type KeyboardEvent } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import type { ProductOptionValue } from '@org/models';
import type { OptionKind } from '@org/models/catalog';
import { inputClassName } from '../ui';

/** An option being edited: every value on offer, and the ones the seller ticked. */
export type OptionDraft = {
  id: string;
  name: string;
  kind: OptionKind;
  /** Added by the seller rather than suggested by the category, so it can be renamed or removed. */
  custom: boolean;
  values: ProductOptionValue[];
  selected: string[];
};

const MAX_VALUE_LENGTH = 30;

function Swatch({ colour }: { colour?: string }) {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 shrink-0 rounded-full border border-black/15 dark:border-white/20"
      style={{
        background:
          colour ??
          'conic-gradient(#dc2626, #facc15, #16a34a, #2563eb, #9333ea, #dc2626)',
      }}
    />
  );
}

export function OptionEditor({
  option,
  photoCount,
  error,
  onChange,
  onRemove,
}: {
  option: OptionDraft;
  photoCount: number;
  error?: string;
  onChange: (option: OptionDraft) => void;
  onRemove?: () => void;
}) {
  const [newValue, setNewValue] = useState('');
  const [newColour, setNewColour] = useState('#6b7280');
  const [valueError, setValueError] = useState<string | null>(null);
  const isColour = option.kind === 'colour';
  const label = option.name.trim() || 'this option';
  const nameId = `${option.id}-name`;

  const toggle = (value: string) =>
    onChange({
      ...option,
      selected: option.selected.includes(value)
        ? option.selected.filter((selected) => selected !== value)
        : [...option.selected, value],
    });

  const addValue = () => {
    const value = newValue.trim();
    if (!value) {
      setValueError(`Type a ${isColour ? 'colour' : 'value'} first.`);
      return;
    }
    if (value.length > MAX_VALUE_LENGTH) {
      setValueError(`Keep it under ${MAX_VALUE_LENGTH} characters.`);
      return;
    }
    const existing = option.values.find(
      (item) => item.label.toLowerCase() === value.toLowerCase(),
    );
    if (existing) {
      if (!option.selected.includes(existing.label)) toggle(existing.label);
      setNewValue('');
      setValueError(null);
      return;
    }
    onChange({
      ...option,
      values: [
        ...option.values,
        isColour ? { label: value, swatch: newColour } : { label: value },
      ],
      selected: [...option.selected, value],
    });
    setNewValue('');
    setValueError(null);
  };

  const onNewValueKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addValue();
    }
  };

  const setPhoto = (value: string, imageIndex: string) =>
    onChange({
      ...option,
      values: option.values.map((item) =>
        item.label === value
          ? {
              ...item,
              imageIndex: imageIndex === '' ? undefined : Number(imageIndex),
            }
          : item,
      ),
    });

  const selectedValues = option.values.filter((item) =>
    option.selected.includes(item.label),
  );

  return (
    <fieldset className="rounded-lg border border-neutral-200 p-4">
      <legend className="sr-only">{label}</legend>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        {option.custom ? (
          <div className="min-w-0 flex-1">
            <label htmlFor={nameId} className="sr-only">
              Option name
            </label>
            <input
              id={nameId}
              value={option.name}
              onChange={(event) =>
                onChange({ ...option, name: event.target.value })
              }
              maxLength={30}
              placeholder="Option name, e.g. Heel height"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${option.id}-error` : undefined}
              className={`${inputClassName} max-w-xs`}
            />
          </div>
        ) : (
          <h3 className="font-medium text-neutral-900">{option.name}</h3>
        )}
        <div className="flex items-center gap-3 text-xs">
          <span className="text-neutral-500">
            {option.selected.length} selected
          </span>
          {option.values.length > 0 && (
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...option,
                  selected:
                    option.selected.length === option.values.length
                      ? []
                      : option.values.map((item) => item.label),
                })
              }
              className="font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              {option.selected.length === option.values.length
                ? 'Clear'
                : 'Select all'}
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${label}`}
              className="rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-rose-600 dark:hover:bg-white/5"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {error && (
        <p
          id={`${option.id}-error`}
          className="mb-3 text-xs text-rose-600 dark:text-rose-400"
        >
          {error}
        </p>
      )}

      {option.values.length > 0 && (
        <div
          role="group"
          aria-label={`${label} values`}
          className="flex flex-wrap gap-2"
        >
          {option.values.map((item) => {
            const selected = option.selected.includes(item.label);
            return (
              <button
                key={item.label}
                type="button"
                aria-pressed={selected}
                onClick={() => toggle(item.label)}
                className={`inline-flex min-w-10 items-center justify-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition ${
                  selected
                    ? 'border-blue-600 bg-blue-600/10 font-medium text-blue-700'
                    : 'border-neutral-200 text-neutral-700 hover:border-neutral-300'
                }`}
              >
                {isColour && <Swatch colour={item.swatch} />}
                {item.label}
                {selected && isColour && <Check size={13} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {isColour && (
          <input
            type="color"
            value={newColour}
            onChange={(event) => setNewColour(event.target.value)}
            aria-label="Swatch for the new colour"
            className="h-9 w-10 cursor-pointer rounded border border-neutral-200 bg-transparent p-0.5"
          />
        )}
        <input
          value={newValue}
          onChange={(event) => setNewValue(event.target.value)}
          onKeyDown={onNewValueKey}
          maxLength={MAX_VALUE_LENGTH}
          placeholder={
            isColour
              ? 'Add a colour, e.g. Olive'
              : `Add ${option.name.trim() ? option.name.trim().toLowerCase() : 'a value'}`
          }
          aria-label={`New ${label} value`}
          className={`${inputClassName} max-w-56 py-2`}
        />
        <button
          type="button"
          onClick={addValue}
          aria-label={`Add to ${label}`}
          className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-100 dark:hover:bg-white/5"
        >
          <Plus size={14} /> Add
        </button>
      </div>
      {valueError && (
        <p
          role="alert"
          className="mt-1.5 text-xs text-rose-600 dark:text-rose-400"
        >
          {valueError}
        </p>
      )}

      {isColour && photoCount > 1 && selectedValues.length > 0 && (
        <div className="mt-4 border-t border-neutral-200 pt-3">
          <p className="mb-2 text-xs text-neutral-500">
            Pick the photo shoppers see when they choose each{' '}
            {label.toLowerCase()}.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {selectedValues.map((item) => (
              <label
                key={item.label}
                className="flex items-center gap-2 text-sm text-neutral-700"
              >
                <Swatch colour={item.swatch} />
                <span className="w-20 truncate">{item.label}</span>
                <select
                  value={item.imageIndex ?? ''}
                  onChange={(event) => setPhoto(item.label, event.target.value)}
                  aria-label={`Photo for ${item.label}`}
                  className={`${inputClassName} py-1.5`}
                >
                  <option value="">Cover photo</option>
                  {Array.from({ length: photoCount }, (_, index) => (
                    <option key={index} value={index}>
                      Photo {index + 1}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
      )}
    </fieldset>
  );
}
