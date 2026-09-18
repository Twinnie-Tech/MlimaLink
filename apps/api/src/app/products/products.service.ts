import { Injectable } from '@nestjs/common';
import { ProductsService as LibProductsService } from '@org/api-products';
import { Product, ProductFilter } from '@org/models';

@Injectable()
export class ProductsApiService {
  private readonly productsService = new LibProductsService();

  getProducts(filter?: ProductFilter, page = 1, pageSize = 10) {
    return this.productsService.getProducts(filter, page, pageSize);
  }

  getProductById(id: string): Product | undefined {
    return this.productsService.getProductById(id);
  }

  getCategories(): string[] {
    return this.productsService.getCategories();
  }
}
