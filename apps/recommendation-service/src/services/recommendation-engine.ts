import type { Product } from '@org/models';
import { preprocessData, type Interaction } from '../utils/preprocess-data';
import { getAllUserActivity } from './fetch-user-activity';
import { getListedProducts } from './product-catalog';
import {
  trainRecommender,
  type RecommendOptions,
  type Recommender,
} from './recommendation.service';

/** How long a trained model is used before retraining on newer activity. */
export const MODEL_TTL_MS = 10 * 60_000;
/** Requests that picked up the previous model may still be predicting with it. */
const RETIRE_DELAY_MS = 30_000;

export interface TrainingData {
  interactions: Interaction[];
  products: Product[];
}

export async function loadTrainingData(): Promise<TrainingData> {
  const [userActions, allProducts] = await Promise.all([
    getAllUserActivity(),
    getListedProducts(),
  ]);
  return preprocessData(userActions, allProducts);
}

interface TrainedModel {
  recommender: Recommender<Product> | null;
  soldOut: string[];
  trainedAt: number;
}

/**
 * Keeps one model trained on every shopper's activity. Once it's older than the TTL it
 * retrains in the background and keeps answering with the previous one, so only the very
 * first request waits for training.
 */
export class RecommendationEngine {
  private current?: TrainedModel;
  private training?: Promise<TrainedModel>;

  constructor(
    private readonly load: () => Promise<TrainingData> = loadTrainingData,
    private readonly ttlMs = MODEL_TTL_MS,
  ) {}

  /** In-stock products the shopper is most likely to want, best first. */
  async recommend(
    userId: string,
    { limit, exclude = [] }: RecommendOptions = {},
  ): Promise<Product[]> {
    const { recommender, soldOut } = await this.model();
    if (!recommender) return [];
    return recommender.recommend(userId, {
      limit,
      exclude: [...exclude, ...soldOut],
    });
  }

  /** Starts training so the first shopper doesn't have to wait for it. */
  warmUp(): void {
    this.model().catch(() => undefined);
  }

  private model(): Promise<TrainedModel> {
    const stale =
      !this.current || Date.now() - this.current.trainedAt >= this.ttlMs;
    if (stale && !this.training) {
      const training = this.train().finally(() => {
        this.training = undefined;
      });
      training.catch((error: unknown) =>
        console.error(
          `Couldn't train recommendations: ${error instanceof Error ? error.message : error}`,
        ),
      );
      this.training = training;
    }
    return this.current
      ? Promise.resolve(this.current)
      : (this.training as Promise<TrainedModel>);
  }

  private async train(): Promise<TrainedModel> {
    const { interactions, products } = await this.load();
    const recommender = await trainRecommender(interactions, products);
    const previous = this.current?.recommender;
    this.current = {
      recommender,
      soldOut: products
        .filter((product) => !product.inStock)
        .map((product) => product.id),
      trainedAt: Date.now(),
    };
    if (previous) {
      setTimeout(() => previous.dispose(), RETIRE_DELAY_MS).unref();
    }
    return this.current;
  }
}
