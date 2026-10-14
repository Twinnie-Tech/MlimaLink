import type { Product } from '@org/models';
import {
  RecommendationEngine,
  type TrainingData,
} from './recommendation-engine';
import { trainRecommender, type Recommender } from './recommendation.service';

vi.mock('./recommendation.service', () => ({ trainRecommender: vi.fn() }));
vi.mock('./fetch-user-activity', () => ({ getAllUserActivity: vi.fn() }));
vi.mock('./product-catalog', () => ({ getListedProducts: vi.fn() }));

const userId = 'a'.repeat(24);
const phone = { id: 'c'.repeat(24), inStock: true } as Product;
const soldOut = { id: 'd'.repeat(24), inStock: false } as Product;
const data: TrainingData = { interactions: [], products: [phone, soldOut] };

const fakeRecommender = (): Recommender<Product> => ({
  recommend: vi.fn().mockResolvedValue([phone]),
  dispose: vi.fn(),
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RecommendationEngine', () => {
  it('trains once and reuses the model, leaving out sold-out products', async () => {
    const recommender = fakeRecommender();
    vi.mocked(trainRecommender).mockResolvedValue(recommender);
    const load = vi.fn().mockResolvedValue(data);
    const engine = new RecommendationEngine(load);

    await expect(
      engine.recommend(userId, { limit: 4, exclude: ['e'.repeat(24)] }),
    ).resolves.toEqual([phone]);
    await engine.recommend(userId);

    expect(load).toHaveBeenCalledTimes(1);
    expect(recommender.recommend).toHaveBeenCalledWith(userId, {
      limit: 4,
      exclude: ['e'.repeat(24), soldOut.id],
    });
  });

  it('shares one training run between requests that arrive together', async () => {
    vi.mocked(trainRecommender).mockResolvedValue(fakeRecommender());
    const load = vi.fn().mockResolvedValue(data);
    const engine = new RecommendationEngine(load);

    await Promise.all([engine.recommend(userId), engine.recommend(userId)]);

    expect(load).toHaveBeenCalledTimes(1);
  });

  it('retrains in the background once the model is stale, answering with the old one meanwhile', async () => {
    const first = fakeRecommender();
    const second = fakeRecommender();
    vi.mocked(trainRecommender)
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const load = vi.fn().mockResolvedValue(data);
    const engine = new RecommendationEngine(load, 1_000);

    await engine.recommend(userId);
    vi.advanceTimersByTime(1_000);
    await engine.recommend(userId);
    expect(first.recommend).toHaveBeenCalledTimes(2);

    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await vi.waitFor(async () => {
      await engine.recommend(userId);
      expect(second.recommend).toHaveBeenCalled();
    });
    vi.advanceTimersByTime(30_000);
    expect(first.dispose).toHaveBeenCalled();
  });

  it('is empty when there was nothing to train on', async () => {
    vi.mocked(trainRecommender).mockResolvedValue(null);
    const engine = new RecommendationEngine(vi.fn().mockResolvedValue(data));

    await expect(engine.recommend(userId)).resolves.toEqual([]);
  });

  it('fails the first request when training fails, then tries again', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('database down'))
      .mockResolvedValue(data);
    vi.mocked(trainRecommender).mockResolvedValue(fakeRecommender());
    const engine = new RecommendationEngine(load);

    await expect(engine.recommend(userId)).rejects.toThrow('database down');
    await expect(engine.recommend(userId)).resolves.toEqual([phone]);
  });
});
