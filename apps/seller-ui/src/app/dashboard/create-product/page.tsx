'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useForm } from 'react-hook-form';
import { ImagePlus, Package, X } from 'lucide-react';
import { shopCategories } from '../../../configs/shop-categories';
import { useDashboardSeller } from '../../shared/dashboard/seller-context';
import {
  Field,
  NotLiveNotice,
  PageHeader,
  Panel,
  describedBy,
  formatMoney,
  inputClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from '../../shared/dashboard/ui';

const MAX_IMAGES = 6;
const SHORT_DESCRIPTION_MAX = 150;

type ProductForm = {
  title: string;
  shortDescription: string;
  description: string;
  category: string;
  tags: string;
  price: string;
  salePrice: string;
  stock: string;
};

type ProductImage = { file: File; url: string };

export default function CreateProductPage() {
  const { shop } = useDashboardSeller();
  const [images, setImages] = useState<ProductImage[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const imagesRef = useRef(images);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<ProductForm>({
    defaultValues: {
      category: shopCategories.includes(shop.category) ? shop.category : '',
    },
  });

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(
    () => () =>
      imagesRef.current.forEach((image) => URL.revokeObjectURL(image.url)),
    [],
  );

  const addImages = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((file) =>
      file.type.startsWith('image/'),
    );
    event.target.value = '';
    const room = MAX_IMAGES - images.length;
    if (files.length > room) {
      setImageError(`You can add up to ${MAX_IMAGES} images.`);
    } else {
      setImageError(null);
    }
    setImages((current) => [
      ...current,
      ...files
        .slice(0, room)
        .map((file) => ({ file, url: URL.createObjectURL(file) })),
    ]);
  };

  const removeImage = (url: string) => {
    URL.revokeObjectURL(url);
    setImages((current) => current.filter((image) => image.url !== url));
    setImageError(null);
  };

  const onSubmit = () => {
    if (images.length === 0) {
      setImageError('Add at least one product image.');
      return;
    }
    setChecked(true);
  };

  const startOver = () => {
    images.forEach((image) => URL.revokeObjectURL(image.url));
    setImages([]);
    setImageError(null);
    setChecked(false);
    reset();
  };

  const title = watch('title');
  const shortDescription = watch('shortDescription') ?? '';
  const price = Number(watch('price'));
  const salePrice = Number(watch('salePrice'));
  const category = watch('category');
  const hasSale = salePrice > 0 && salePrice < price;

  return (
    <>
      <PageHeader
        title="Create Product"
        description={`Add a new product to ${shop.name}.`}
      />

      <NotLiveNotice>
        Product listings aren&apos;t connected to the store yet. You can fill in
        and check this form, but nothing will be saved or shown to shoppers.
      </NotLiveNotice>

      {checked && (
        <div
          role="status"
          className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800"
        >
          <span>
            Everything looks good. This product wasn&apos;t saved because
            listings aren&apos;t live yet.
          </span>
          <button
            type="button"
            onClick={startOver}
            className={secondaryButtonClassName}
          >
            Start over
          </button>
        </div>
      )}

      <form
        onSubmit={handleSubmit(onSubmit, () => {
          if (images.length === 0)
            setImageError('Add at least one product image.');
        })}
        noValidate
        className="grid gap-6 xl:grid-cols-3"
      >
        <div className="space-y-6 xl:col-span-2">
          <Panel
            title="Images"
            description={`Up to ${MAX_IMAGES} images. The first one is your cover photo.`}
          >
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {images.map((image, index) => (
                <div
                  key={image.url}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50"
                >
                  <img
                    src={image.url}
                    alt={`Product image ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                  {index === 0 && (
                    <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      Cover
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeImage(image.url)}
                    aria-label={`Remove image ${index + 1}`}
                    className="absolute top-1 right-1 rounded-full bg-black/70 p-1 text-white hover:bg-rose-600"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {images.length < MAX_IMAGES && (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-neutral-300 text-xs text-neutral-500 transition hover:border-blue-500/50 hover:text-blue-700"
                >
                  <ImagePlus size={22} />
                  Add image
                </button>
              )}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              onChange={addImages}
              className="sr-only"
              aria-label="Upload product images"
              tabIndex={-1}
            />
            {imageError && (
              <p
                role="alert"
                className="mt-3 text-xs text-rose-600 dark:text-rose-400"
              >
                {imageError}
              </p>
            )}
          </Panel>

          <Panel title="Details">
            <div className="space-y-5">
              <Field
                id="title"
                label="Product title"
                error={errors.title?.message}
              >
                <input
                  {...describedBy('title', errors.title?.message)}
                  placeholder="e.g. Fresh Hass avocados (1 kg)"
                  className={inputClassName}
                  {...register('title', {
                    required: 'Product title is required',
                    minLength: {
                      value: 3,
                      message: 'Use at least 3 characters',
                    },
                    maxLength: {
                      value: 120,
                      message: 'Keep it under 120 characters',
                    },
                  })}
                />
              </Field>

              <Field
                id="shortDescription"
                label="Short description"
                hint={`${shortDescription.length}/${SHORT_DESCRIPTION_MAX}`}
                error={errors.shortDescription?.message}
              >
                <input
                  {...describedBy(
                    'shortDescription',
                    errors.shortDescription?.message,
                  )}
                  placeholder="One line shoppers see in search results"
                  maxLength={SHORT_DESCRIPTION_MAX}
                  className={inputClassName}
                  {...register('shortDescription', {
                    required: 'Short description is required',
                  })}
                />
              </Field>

              <Field
                id="description"
                label="Description"
                error={errors.description?.message}
              >
                <textarea
                  {...describedBy('description', errors.description?.message)}
                  rows={6}
                  placeholder="Describe the product, how it's grown or made, sizes, and how to use or store it."
                  className={inputClassName}
                  {...register('description', {
                    required: 'Description is required',
                    minLength: {
                      value: 20,
                      message: 'Use at least 20 characters',
                    },
                  })}
                />
              </Field>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  id="category"
                  label="Category"
                  error={errors.category?.message}
                >
                  <select
                    {...describedBy('category', errors.category?.message)}
                    className={inputClassName}
                    {...register('category', { required: 'Choose a category' })}
                  >
                    <option value="">Select a category</option>
                    {shopCategories.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field id="tags" label="Tags" hint="Comma separated">
                  <input
                    id="tags"
                    placeholder="organic, fresh, local"
                    className={inputClassName}
                    {...register('tags')}
                  />
                </Field>
              </div>
            </div>
          </Panel>

          <Panel title="Pricing & inventory">
            <div className="grid gap-5 sm:grid-cols-3">
              <Field
                id="price"
                label="Price (USD)"
                error={errors.price?.message}
              >
                <input
                  {...describedBy('price', errors.price?.message)}
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  className={inputClassName}
                  {...register('price', {
                    required: 'Price is required',
                    validate: (value) =>
                      Number(value) > 0 || 'Price must be more than 0',
                  })}
                />
              </Field>

              <Field
                id="salePrice"
                label="Sale price"
                hint="Optional"
                error={errors.salePrice?.message}
              >
                <input
                  {...describedBy('salePrice', errors.salePrice?.message)}
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  className={inputClassName}
                  {...register('salePrice', {
                    validate: (value, form) =>
                      !value ||
                      (Number(value) > 0 &&
                        Number(value) < Number(form.price)) ||
                      'Sale price must be lower than the price',
                  })}
                />
              </Field>

              <Field id="stock" label="Stock" error={errors.stock?.message}>
                <input
                  {...describedBy('stock', errors.stock?.message)}
                  type="number"
                  inputMode="numeric"
                  step="1"
                  min="0"
                  placeholder="0"
                  className={inputClassName}
                  {...register('stock', {
                    required: 'Stock is required',
                    validate: (value) =>
                      (Number.isInteger(Number(value)) && Number(value) >= 0) ||
                      'Enter a whole number, 0 or more',
                  })}
                />
              </Field>
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel
            title="Preview"
            description="How shoppers will see this product."
          >
            <div className="overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50">
              <div className="flex aspect-[4/3] items-center justify-center bg-neutral-50">
                {images[0] ? (
                  <img
                    src={images[0].url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Package size={40} className="text-neutral-400" />
                )}
              </div>
              <div className="space-y-1.5 p-4">
                <p className="text-xs text-neutral-500">
                  {category || 'Category'}
                </p>
                <p className="font-medium text-neutral-900">
                  {title || 'Product title'}
                </p>
                {shortDescription && (
                  <p className="text-sm text-neutral-500">{shortDescription}</p>
                )}
                <p className="flex items-baseline gap-2 pt-1">
                  <span className="text-lg font-semibold text-neutral-900">
                    {formatMoney(hasSale ? salePrice : price > 0 ? price : 0)}
                  </span>
                  {hasSale && (
                    <span className="text-sm text-neutral-500 line-through">
                      {formatMoney(price)}
                    </span>
                  )}
                </p>
                <p className="text-xs text-neutral-500">Sold by {shop.name}</p>
              </div>
            </div>
          </Panel>

          <div className="flex flex-col gap-3">
            <button type="submit" className={primaryButtonClassName}>
              Check product
            </button>
            <button
              type="button"
              onClick={startOver}
              className={secondaryButtonClassName}
            >
              Clear form
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
