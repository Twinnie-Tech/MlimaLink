'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { Controller, useForm } from 'react-hook-form';
import {
  CheckCircle2,
  ImagePlus,
  Loader2,
  Package,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import type { PaymentOption, ProductOption, ProductVariant } from '@org/models';
import {
  DEFAULT_PAYMENT_OPTIONS,
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  MAX_OPTIONS,
  MAX_PRODUCT_IMAGES,
  MAX_VARIANTS,
  PAYMENT_OPTIONS,
  PRODUCT_CATEGORIES,
  SHORT_DESCRIPTION_MAX,
  countWords,
  descriptionText,
  getSubCategories,
  getSubCategoryTemplate,
  listingTerms,
  parseProductInput,
  priceRange,
  variantCombinations,
  variantLabel,
} from '@org/models/catalog';
import { useDashboardSeller } from '../../shared/dashboard/seller-context';
import {
  OptionEditor,
  type OptionDraft,
} from '../../shared/dashboard/product-form/option-editor';
import { RichTextEditor } from '../../shared/dashboard/product-form/rich-text-editor';
import {
  SpecFields,
  type SpecDraft,
} from '../../shared/dashboard/product-form/spec-fields';
import {
  EMPTY_VARIANT,
  VariantTable,
  type VariantDraft,
} from '../../shared/dashboard/product-form/variant-table';
import {
  Field,
  PageHeader,
  Panel,
  describedBy,
  formatMoney,
  inputClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from '../../shared/dashboard/ui';
import {
  deleteProductImage,
  uploadProductImage,
} from '../../shared/utils/product-images-api';
import { createProduct } from '../../shared/utils/products-api';
import { AuthRequestError } from '../../shared/utils/seller-api';

type ProductForm = {
  title: string;
  shortDescription: string;
  description: string;
  category: string;
  subCategory: string;
  tags: string;
  price: string;
  salePrice: string;
  stock: string;
};

type ProductImage = {
  /** Local preview URL, which also identifies the photo while it uploads. */
  preview: string;
  file: File;
  status: 'uploading' | 'uploaded' | 'failed';
  fileId?: string;
  /** ImageKit URL, once uploaded. */
  url?: string;
};

/** Drops a photo that won't be saved, deleting it from ImageKit if it got there. */
function discardImage(image: ProductImage, discarded: Set<string>) {
  discarded.add(image.preview);
  URL.revokeObjectURL(image.preview);
  if (image.fileId) deleteProductImage(image.fileId).catch(() => undefined);
}

const isWholeNumber = (value: string) =>
  value.trim() !== '' && Number.isInteger(Number(value)) && Number(value) >= 0;

let draftId = 0;
const nextId = () => `draft-${++draftId}`;

function optionsFor(category: string, subCategory: string): OptionDraft[] {
  return (getSubCategoryTemplate(category, subCategory)?.options ?? []).map(
    (option) => ({
      id: nextId(),
      name: option.name,
      kind: option.kind,
      custom: false,
      values: option.values.map((value) => ({ ...value })),
      selected: [],
    }),
  );
}

function specsFor(category: string, subCategory: string): SpecDraft[] {
  return (getSubCategoryTemplate(category, subCategory)?.specs ?? []).map(
    (spec) => ({
      id: nextId(),
      name: spec.name,
      value: '',
      custom: false,
      placeholder: spec.placeholder,
      suggestions: spec.suggestions,
    }),
  );
}

/** The options shoppers will pick from: those with at least one ticked value. */
function activeOptions(
  drafts: OptionDraft[],
  photoCount: number,
): ProductOption[] {
  return drafts
    .filter((draft) => draft.selected.length > 0)
    .map((draft) => ({
      name: draft.name.trim(),
      values: draft.values
        .filter((value) => draft.selected.includes(value.label))
        .map(({ imageIndex, ...value }) =>
          imageIndex !== undefined && imageIndex < photoCount
            ? { ...value, imageIndex }
            : value,
        ),
    }));
}

export default function CreateProductPage() {
  const { shop } = useDashboardSeller();
  const [images, setImages] = useState<ProductImage[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [options, setOptions] = useState<OptionDraft[]>([]);
  const [optionErrors, setOptionErrors] = useState<Record<string, string>>({});
  const [variantRows, setVariantRows] = useState<Record<string, VariantDraft>>(
    {},
  );
  const [variantErrors, setVariantErrors] = useState<Record<string, string>>(
    {},
  );
  const [specs, setSpecs] = useState<SpecDraft[]>([]);
  const [specError, setSpecError] = useState<string | undefined>();
  const [paymentOptions, setPaymentOptions] = useState<PaymentOption[]>(
    DEFAULT_PAYMENT_OPTIONS,
  );
  const [paymentError, setPaymentError] = useState<string | undefined>();
  const [takingRequests, setTakingRequests] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const imagesRef = useRef(images);
  const discarded = useRef(new Set<string>());

  const initialCategory = PRODUCT_CATEGORIES.includes(shop.category)
    ? shop.category
    : '';

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm<ProductForm>({
    defaultValues: {
      category: initialCategory,
      subCategory: '',
      description: '',
    },
  });

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    const discardedImages = discarded.current;
    return () =>
      imagesRef.current.forEach((image) =>
        discardImage(image, discardedImages),
      );
  }, []);

  const title = watch('title');
  const shortDescription = watch('shortDescription') ?? '';
  const priceText = watch('price') ?? '';
  const price = Number(priceText);
  const salePrice = Number(watch('salePrice'));
  const category = watch('category');
  const subCategory = watch('subCategory');
  const hasSale = salePrice > 0 && salePrice < price;

  const shopperOptions = activeOptions(options, images.length);
  const combinations = variantCombinations(shopperOptions);
  const hasOptions = shopperOptions.length > 0;
  const tooManyCombinations = combinations.length > MAX_VARIANTS;
  const subCategories = getSubCategories(category);
  const { pricePeriod, contactSeller, service } = listingTerms({
    category,
    subCategory,
  });
  const stockLabel = contactSeller ? 'Units available' : 'Stock';
  const priceLabel = service
    ? 'Starting price (USD)'
    : pricePeriod
      ? `Price per ${pricePeriod} (USD)`
      : 'Price (USD)';

  const addImages = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((file) =>
      file.type.startsWith('image/'),
    );
    event.target.value = '';
    const room = MAX_PRODUCT_IMAGES - images.length;
    setImageError(
      files.length > room
        ? `You can add up to ${MAX_PRODUCT_IMAGES} images.`
        : null,
    );
    const added = files.slice(0, room).map((file): ProductImage => ({
      file,
      preview: URL.createObjectURL(file),
      status: 'uploading',
    }));
    setImages((current) => [...current, ...added]);
    added.forEach(upload);
  };

  const updateImage = (preview: string, change: Partial<ProductImage>) =>
    setImages((current) =>
      current.map((image) =>
        image.preview === preview ? { ...image, ...change } : image,
      ),
    );

  const upload = (image: ProductImage) => {
    uploadProductImage(image.file).then(
      ({ fileId, url }) => {
        if (discarded.current.has(image.preview)) {
          deleteProductImage(fileId).catch(() => undefined);
        } else {
          updateImage(image.preview, { status: 'uploaded', fileId, url });
        }
      },
      (error: unknown) => {
        if (discarded.current.has(image.preview)) return;
        updateImage(image.preview, { status: 'failed' });
        setImageError(
          error instanceof Error ? error.message : 'Could not upload a photo.',
        );
      },
    );
  };

  const retryImage = (image: ProductImage) => {
    updateImage(image.preview, { status: 'uploading' });
    setImageError(null);
    upload(image);
  };

  const removeImage = (image: ProductImage) => {
    discardImage(image, discarded.current);
    setImages((current) =>
      current.filter((item) => item.preview !== image.preview),
    );
    setImageError(null);
  };

  const loadTemplate = (nextCategory: string, nextSubCategory: string) => {
    setOptions(optionsFor(nextCategory, nextSubCategory));
    setSpecs(specsFor(nextCategory, nextSubCategory));
    setVariantRows({});
    setVariantErrors({});
    setOptionErrors({});
    setSpecError(undefined);
  };

  const updateOption = (next: OptionDraft) => {
    setOptions((current) =>
      current.map((option) => (option.id === next.id ? next : option)),
    );
    setOptionErrors((current) => {
      const rest = { ...current };
      delete rest[next.id];
      return rest;
    });
  };

  const startOver = () => {
    images.forEach((image) => discardImage(image, discarded.current));
    setImages([]);
    setImageError(null);
    setSubmitError(null);
    setSaved(null);
    setPaymentOptions(DEFAULT_PAYMENT_OPTIONS);
    setPaymentError(undefined);
    setTakingRequests(true);
    reset({ category: initialCategory, subCategory: '', description: '' });
    loadTemplate('', '');
  };

  /** Checks everything react-hook-form doesn't know about. Returns false when something needs fixing. */
  const checkDrafts = () => {
    let ok = true;
    if (images.length === 0) {
      setImageError('Add at least one product image.');
      ok = false;
    } else if (images.some((image) => image.status === 'uploading')) {
      setImageError('Wait for your photos to finish uploading.');
      ok = false;
    } else if (images.some((image) => image.status === 'failed')) {
      setImageError('Some photos didn’t upload. Retry or remove them.');
      ok = false;
    }

    const nextOptionErrors: Record<string, string> = {};
    const names = new Set<string>();
    for (const option of options.filter((draft) => draft.selected.length)) {
      const name = option.name.trim().toLowerCase();
      if (!name) nextOptionErrors[option.id] = 'Give this option a name.';
      else if (names.has(name))
        nextOptionErrors[option.id] = 'Another option already has this name.';
      names.add(name);
    }
    setOptionErrors(nextOptionErrors);
    if (Object.keys(nextOptionErrors).length) ok = false;

    const nextVariantErrors: Record<string, string> = {};
    if (!tooManyCombinations) {
      for (const choices of combinations) {
        const label = variantLabel(choices, shopperOptions);
        const row = variantRows[label] ?? EMPTY_VARIANT;
        if (!isWholeNumber(row.stock)) {
          nextVariantErrors[label] = 'Enter stock, 0 or more.';
        } else if (row.price !== '' && !(Number(row.price) > 0)) {
          nextVariantErrors[label] = 'Price must be more than 0.';
        }
      }
    }
    setVariantErrors(nextVariantErrors);
    if (Object.keys(nextVariantErrors).length || tooManyCombinations)
      ok = false;

    const halfFilled = specs.some(
      (spec) =>
        spec.custom && Boolean(spec.name.trim()) !== Boolean(spec.value.trim()),
    );
    setSpecError(
      halfFilled
        ? 'Give each extra detail both a name and a value.'
        : undefined,
    );
    if (halfFilled) ok = false;

    if (!contactSeller && paymentOptions.length === 0) {
      setPaymentError('Choose at least one way shoppers can pay.');
      ok = false;
    }

    return ok;
  };

  const onSubmit = async (form: ProductForm) => {
    setSubmitError(null);
    if (!checkDrafts()) {
      setSubmitError('Some details need fixing. Check the highlighted fields.');
      return;
    }

    setSaving(true);
    try {
      const variants: ProductVariant[] = combinations.map((choices) => {
        const row =
          variantRows[variantLabel(choices, shopperOptions)] ?? EMPTY_VARIANT;
        return {
          choices,
          stock: Number(row.stock),
          ...(row.price !== '' && { price: Number(row.price) }),
          ...(row.sku.trim() && { sku: row.sku.trim() }),
        };
      });

      const payload = {
        title: form.title,
        shortDescription: form.shortDescription,
        description: form.description,
        category: form.category,
        subCategory: form.subCategory,
        tags: form.tags ? form.tags.split(',') : [],
        price: Number(form.price),
        ...(form.salePrice && { salePrice: Number(form.salePrice) }),
        images: images.flatMap((image) => (image.url ? [image.url] : [])),
        imageFileIds: images.flatMap((image) =>
          image.fileId ? [image.fileId] : [],
        ),
        specs: specs
          .filter((spec) => spec.name.trim() && spec.value.trim())
          .map(({ name, value }) => ({ name, value })),
        options: shopperOptions,
        variants,
        // A service has no stock; 1 means it's taking new requests.
        ...(service
          ? { stock: takingRequests ? 1 : 0 }
          : !hasOptions && { stock: Number(form.stock) }),
        // Contact listings are paid however the seller and shopper agree.
        paymentOptions: contactSeller
          ? DEFAULT_PAYMENT_OPTIONS
          : paymentOptions,
      };

      const checked = parseProductInput(payload);
      if ('error' in checked) {
        setSubmitError(checked.error);
        return;
      }

      const response = await createProduct(payload);
      // The photos now belong to the product, so they're kept on ImageKit.
      images.forEach((image) => URL.revokeObjectURL(image.preview));
      setImages([]);
      setSaved(response.message ?? `${form.title} is now listed.`);
    } catch (error) {
      setSubmitError(
        error instanceof AuthRequestError
          ? error.message
          : 'Could not save the product. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const { min: minPrice, max: maxPrice } = priceRange({
    price: price > 0 ? price : 0,
    salePrice: hasSale ? salePrice : undefined,
    variants: combinations.map((choices) => {
      const row = variantRows[variantLabel(choices, shopperOptions)];
      return {
        choices,
        stock: 0,
        ...(row && Number(row.price) > 0 && { price: Number(row.price) }),
      };
    }),
  });

  if (saved) {
    return (
      <>
        <PageHeader title="Create Product" />
        <Panel>
          <div
            role="status"
            className="flex flex-col items-center py-10 text-center"
          >
            <CheckCircle2
              size={44}
              className="mb-4 text-emerald-600 dark:text-emerald-400"
            />
            <p className="font-poppins text-lg font-semibold text-neutral-900">
              {saved}
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              Shoppers can find it in the shop now.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href="/dashboard/all-products"
                className={primaryButtonClassName}
              >
                View all products
              </Link>
              <button
                type="button"
                onClick={startOver}
                className={secondaryButtonClassName}
              >
                Add another product
              </button>
            </div>
          </div>
        </Panel>
      </>
    );
  }

  const optionCount = options.filter((option) => option.selected.length).length;

  return (
    <>
      <PageHeader
        title="Create Product"
        description={`Add a new product to ${shop.name}.`}
      />

      <form
        onSubmit={handleSubmit(onSubmit, () => {
          checkDrafts();
          setSubmitError(
            'Some details need fixing. Check the highlighted fields.',
          );
        })}
        noValidate
        className="grid gap-6 xl:grid-cols-3"
      >
        <div className="space-y-6 xl:col-span-2">
          <Panel
            title="Images"
            description={`Up to ${MAX_PRODUCT_IMAGES} images. The first one is your cover photo.`}
          >
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {images.map((image, index) => (
                <div
                  key={image.preview}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50"
                >
                  <img
                    src={image.preview}
                    alt={`Product image ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                  {image.status === 'uploading' && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                      <Loader2
                        size={20}
                        className="animate-spin"
                        aria-hidden="true"
                      />
                      <span className="sr-only">
                        Uploading image {index + 1}
                      </span>
                    </span>
                  )}
                  {image.status === 'failed' && (
                    <button
                      type="button"
                      onClick={() => retryImage(image)}
                      aria-label={`Retry uploading image ${index + 1}`}
                      className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-rose-700/60 text-[11px] font-medium text-white hover:bg-rose-700/70"
                    >
                      <RotateCcw size={18} aria-hidden="true" />
                      Retry
                    </button>
                  )}
                  <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    {index === 0 ? 'Cover' : `Photo ${index + 1}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeImage(image)}
                    aria-label={`Remove image ${index + 1}`}
                    className="absolute top-1 right-1 rounded-full bg-black/70 p-1 text-white hover:bg-rose-600"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {images.length < MAX_PRODUCT_IMAGES && (
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
                  placeholder="e.g. Leather ankle boots"
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
                hint="Style it with fonts, sizes, colours, lists and more"
                error={errors.description?.message}
              >
                <Controller
                  name="description"
                  control={control}
                  defaultValue=""
                  rules={{
                    validate: (value) => {
                      const length = descriptionText(value ?? '').length;
                      if (length === 0) return 'Description is required';
                      if (length < DESCRIPTION_MIN) {
                        return `Use at least ${DESCRIPTION_MIN} characters`;
                      }
                      return (
                        length <= DESCRIPTION_MAX ||
                        `Keep it under ${DESCRIPTION_MAX} characters`
                      );
                    },
                  }}
                  render={({ field }) => (
                    <RichTextEditor
                      id="description"
                      label="Description"
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      invalid={Boolean(errors.description)}
                      describedById={
                        errors.description ? 'description-error' : undefined
                      }
                      placeholder="Describe the product: what it's made of, how it fits or tastes, and how to use or care for it."
                      footer={`${countWords(field.value ?? '')} words · ${descriptionText(field.value ?? '').length}/${DESCRIPTION_MAX} characters`}
                    />
                  )}
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
                    {...register('category', {
                      required: 'Choose a category',
                      onChange: (event: ChangeEvent<HTMLSelectElement>) => {
                        setValue('subCategory', '');
                        loadTemplate(event.target.value, '');
                      },
                    })}
                  >
                    <option value="">Select a category</option>
                    {PRODUCT_CATEGORIES.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field
                  id="subCategory"
                  label="Sub-category"
                  error={errors.subCategory?.message}
                >
                  <select
                    {...describedBy('subCategory', errors.subCategory?.message)}
                    disabled={!category}
                    className={inputClassName}
                    {...register('subCategory', {
                      required: 'Choose a sub-category',
                      onChange: (event: ChangeEvent<HTMLSelectElement>) =>
                        loadTemplate(category, event.target.value),
                    })}
                  >
                    <option value="">
                      {category
                        ? 'Select a sub-category'
                        : 'Pick a category first'}
                    </option>
                    {subCategories.map((option) => (
                      <option key={option.name} value={option.name}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field id="tags" label="Tags" hint="Comma separated">
                <input
                  id="tags"
                  placeholder="leather, formal, handmade"
                  className={inputClassName}
                  {...register('tags')}
                />
              </Field>
            </div>
          </Panel>

          {!service && (
            <Panel
              title="Options"
              description="What shoppers choose before adding to cart, like colour or size. Tick every value you sell."
            >
              {subCategory ? (
                <div className="space-y-4">
                  {options.length === 0 && (
                    <p className="text-sm text-neutral-500">
                      {subCategory} products don&apos;t usually come in
                      different options. Add one if yours do.
                    </p>
                  )}
                  {options.map((option) => (
                    <OptionEditor
                      key={option.id}
                      option={option}
                      photoCount={images.length}
                      error={optionErrors[option.id]}
                      onChange={updateOption}
                      onRemove={
                        option.custom
                          ? () =>
                              setOptions((current) =>
                                current.filter((item) => item.id !== option.id),
                              )
                          : undefined
                      }
                    />
                  ))}
                  {optionCount < MAX_OPTIONS && (
                    <button
                      type="button"
                      onClick={() =>
                        setOptions((current) => [
                          ...current,
                          {
                            id: nextId(),
                            name: '',
                            kind: 'choice',
                            custom: true,
                            values: [],
                            selected: [],
                          },
                        ])
                      }
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                      <Plus size={15} /> Add another option
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-sm text-neutral-500">
                  Choose a sub-category to see the options shoppers usually pick
                  for it.
                </p>
              )}
            </Panel>
          )}

          {subCategory && (
            <Panel
              title={service ? 'Service details' : 'Product details'}
              description={
                service
                  ? 'What you offer, how you charge and where you work. Shoppers search by these.'
                  : 'Facts shoppers read and search by, like brand or material.'
              }
            >
              <SpecFields
                specs={specs}
                error={specError}
                onChange={(next) => {
                  setSpecs(next);
                  setSpecError(undefined);
                }}
                nextId={nextId}
              />
            </Panel>
          )}

          <Panel
            title={service ? 'Pricing & availability' : 'Pricing & inventory'}
            description={
              service
                ? 'Shoppers send you a request with what they need, their budget and deadline, or call, WhatsApp or email you. Describe your packages in the description.'
                : contactSeller
                  ? 'Shoppers will call, WhatsApp or email you about this listing using the phone number and email on your account. There’s no cart checkout.'
                  : undefined
            }
          >
            <div className="grid gap-5 sm:grid-cols-3">
              <Field
                id="price"
                label={priceLabel}
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

              {!hasOptions && !service && (
                <Field
                  id="stock"
                  label={stockLabel}
                  error={errors.stock?.message}
                >
                  <input
                    {...describedBy('stock', errors.stock?.message)}
                    type="number"
                    inputMode="numeric"
                    step="1"
                    min="0"
                    placeholder="0"
                    className={inputClassName}
                    {...register('stock', {
                      shouldUnregister: true,
                      validate: (value) =>
                        isWholeNumber(value ?? '') ||
                        'Enter a whole number, 0 or more',
                    })}
                  />
                </Field>
              )}
            </div>

            {service && (
              <div className="mt-6 space-y-3">
                <label className="flex cursor-pointer items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={takingRequests}
                    onChange={(event) =>
                      setTakingRequests(event.target.checked)
                    }
                    className="mt-0.5 h-4 w-4 accent-blue-600"
                  />
                  <span>
                    <span className="block font-medium text-neutral-900">
                      Taking new requests
                    </span>
                    <span className="text-neutral-500">
                      Untick when you&apos;re fully booked. The listing stays
                      up, but shoppers can&apos;t send requests.
                    </span>
                  </span>
                </label>
                <p className="text-sm text-neutral-500">
                  Shoppers also see your skills, qualifications and past work
                  from your{' '}
                  <Link
                    href="/dashboard/service-profile"
                    className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    service profile
                  </Link>
                  .
                </p>
              </div>
            )}

            {hasOptions && (
              <div className="mt-6">
                <h3 className="mb-1 font-medium text-neutral-900">
                  {contactSeller
                    ? 'Units available for each option'
                    : 'Stock for each combination'}
                </h3>
                {tooManyCombinations ? (
                  <p
                    role="alert"
                    className="text-sm text-rose-600 dark:text-rose-400"
                  >
                    That makes {combinations.length} combinations; the limit is{' '}
                    {MAX_VARIANTS}. Untick some values.
                  </p>
                ) : (
                  <VariantTable
                    options={shopperOptions}
                    combinations={combinations}
                    rows={variantRows}
                    errors={variantErrors}
                    basePrice={priceText}
                    onChange={(rows) => {
                      setVariantRows(rows);
                      setVariantErrors({});
                    }}
                  />
                )}
              </div>
            )}

            {!contactSeller && (
              <fieldset
                className="mt-6"
                aria-describedby={
                  paymentError ? 'paymentOptions-error' : undefined
                }
              >
                <legend className="mb-1 font-medium text-neutral-900">
                  How shoppers can pay
                </legend>
                <p className="mb-3 text-sm text-neutral-500">
                  Tick every option you accept. Shoppers pick one at checkout.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {PAYMENT_OPTIONS.map((option) => (
                    <label
                      key={option.id}
                      className="flex cursor-pointer gap-3 rounded-lg border border-neutral-200 p-3 text-sm transition has-[:checked]:border-blue-500/60 has-[:checked]:bg-blue-500/5"
                    >
                      <input
                        type="checkbox"
                        checked={paymentOptions.includes(option.id)}
                        onChange={(event) => {
                          setPaymentError(undefined);
                          setPaymentOptions((current) =>
                            event.target.checked
                              ? [...current, option.id]
                              : current.filter((id) => id !== option.id),
                          );
                        }}
                        className="mt-0.5 h-4 w-4 accent-blue-600"
                      />
                      <span>
                        <span className="block font-medium text-neutral-900">
                          {option.label}
                        </span>
                        <span className="text-neutral-500">
                          {option.description}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                {paymentError && (
                  <p
                    id="paymentOptions-error"
                    role="alert"
                    className="mt-2 text-xs text-rose-600 dark:text-rose-400"
                  >
                    {paymentError}
                  </p>
                )}
              </fieldset>
            )}
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
                    src={images[0].preview}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Package size={40} className="text-neutral-400" />
                )}
              </div>
              <div className="space-y-1.5 p-4">
                <p className="text-xs text-neutral-500">
                  {[category, subCategory].filter(Boolean).join(' › ') ||
                    'Category'}
                </p>
                <p className="font-medium text-neutral-900">
                  {title || 'Product title'}
                </p>
                {shortDescription && (
                  <p className="text-sm text-neutral-500">{shortDescription}</p>
                )}
                <p className="flex items-baseline gap-2 pt-1">
                  <span className="text-lg font-semibold text-neutral-900">
                    {minPrice !== maxPrice || service
                      ? `From ${formatMoney(minPrice)}`
                      : formatMoney(minPrice)}
                    {pricePeriod && (
                      <span className="text-sm font-normal text-neutral-500">
                        {' '}
                        / {pricePeriod}
                      </span>
                    )}
                  </span>
                  {hasSale && minPrice === maxPrice && (
                    <span className="text-sm text-neutral-500 line-through">
                      {formatMoney(price)}
                    </span>
                  )}
                </p>
                {shopperOptions.map((option) => (
                  <div key={option.name} className="pt-1">
                    <p className="text-xs text-neutral-500">{option.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {option.values.slice(0, 8).map((value) =>
                        value.swatch ? (
                          <span
                            key={value.label}
                            title={value.label}
                            className="h-5 w-5 rounded-full border border-black/15 dark:border-white/20"
                            style={{ background: value.swatch }}
                          />
                        ) : (
                          <span
                            key={value.label}
                            className="rounded border border-neutral-200 px-1.5 py-0.5 text-xs text-neutral-700"
                          >
                            {value.label}
                          </span>
                        ),
                      )}
                      {option.values.length > 8 && (
                        <span className="text-xs text-neutral-500">
                          +{option.values.length - 8}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                <p className="pt-1 text-xs text-neutral-500">
                  Sold by {shop.name}
                </p>
              </div>
            </div>
          </Panel>

          {submitError && (
            <p
              role="alert"
              className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700"
            >
              {submitError}
            </p>
          )}

          <div className="flex flex-col gap-3">
            <button
              type="submit"
              disabled={saving}
              className={primaryButtonClassName}
            >
              {saving ? 'Saving…' : 'Save product'}
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
