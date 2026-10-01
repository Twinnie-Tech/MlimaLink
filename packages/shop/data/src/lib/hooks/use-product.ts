import { useState, useEffect } from 'react';
import { Product } from '@org/models';
import { fetchApiData } from './fetch-api-data';

const API_URL = '/api';

export function useProduct(id: string | undefined) {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setProduct(null);
      return;
    }

    const fetchProduct = async () => {
      setLoading(true);
      setError(null);

      try {
        setProduct(
          await fetchApiData<Product>(
            `${API_URL}/products/${id}`,
            'Failed to load product',
          ),
        );
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'An error occurred while loading the product';
        setError(message);
        console.warn('Error loading product:', message);
        setProduct(null);
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [id]);

  return {
    product,
    loading,
    error,
  };
}
