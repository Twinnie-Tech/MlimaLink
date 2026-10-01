import { useState, useEffect } from 'react';
import { Product, PaginatedResponse, ProductFilter } from '@org/models';
import { fetchApiData } from './fetch-api-data';

const API_URL = '/api';

export function useProducts(filter?: ProductFilter, page = 1, pageSize = 12) {
  const [products, setProducts] = useState<Product[]>([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          page: page.toString(),
          pageSize: pageSize.toString(),
        });

        if (filter) {
          if (filter.category) params.append('category', filter.category);
          if (filter.minPrice !== undefined)
            params.append('minPrice', filter.minPrice.toString());
          if (filter.maxPrice !== undefined)
            params.append('maxPrice', filter.maxPrice.toString());
          if (filter.inStock !== undefined)
            params.append('inStock', filter.inStock.toString());
          if (filter.searchTerm) params.append('searchTerm', filter.searchTerm);
        }

        const data = await fetchApiData<PaginatedResponse<Product>>(
          `${API_URL}/products?${params}`,
          'Failed to load products',
        );

        setProducts(data.items);
        setTotalProducts(data.total);
        setTotalPages(data.totalPages);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'An error occurred while loading products';
        setError(message);
        console.warn('Error loading products:', message);
        setProducts([]);
        setTotalProducts(0);
        setTotalPages(0);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [filter, page, pageSize]);

  return {
    products,
    totalProducts,
    totalPages,
    loading,
    error,
  };
}

export function useCategories() {
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCategories = async () => {
      setLoading(true);
      setError(null);

      try {
        setCategories(
          await fetchApiData<string[]>(
            `${API_URL}/products/categories`,
            'Failed to load categories',
          ),
        );
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'An error occurred while loading categories';
        setError(message);
        console.warn('Error loading categories:', message);
        setCategories([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCategories();
  }, []);

  return {
    categories,
    loading,
    error,
  };
}
