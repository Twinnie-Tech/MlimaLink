import type * as Tf from '@tensorflow/tfjs';
import { tf } from '../tf';
import {
  preprocessData,
  type Interaction,
  type RecommendableProduct,
} from '../utils/preprocess-data';
import { getAllUserActivity } from './fetch-user-activity';

/** Length of the vector the model learns for each shopper and each product. */
export const EMBEDDING_DIM = 50;
export const RECOMMENDATIONS_LIMIT = 10;

/** How strongly each action says the shopper wants the product; the model's targets. */
export const ACTION_WEIGHTS: Record<string, number> = {
  product_view: 0.3,
  add_to_wishlist: 0.6,
  add_to_cart: 0.8,
  purchase: 1,
};

/** Already in the cart or bought, so suggesting them again isn't useful. */
const SKIPPED_ACTIONS = new Set(['add_to_cart', 'purchase']);

const EPOCHS = 20;
const BATCH_SIZE = 32;
const LEARNING_RATE = 0.01;

interface TrainingSet {
  users: number[];
  products: number[];
  labels: number[];
}

/**
 * One example per shopper–product pair they touched, labelled with their strongest action,
 * plus as many products they never touched, labelled 0. Without those negatives the model
 * would learn that every product is wanted.
 */
function buildTrainingSet(
  interactions: Interaction[],
  userIndex: Map<string, number>,
  productIndex: Map<string, number>,
): TrainingSet {
  const strongest = new Map<number, Map<number, number>>();
  for (const { userId, productId, actionType } of interactions) {
    const weight = ACTION_WEIGHTS[actionType];
    if (!weight) continue;
    const user = userIndex.get(userId) as number;
    const product = productIndex.get(productId) as number;
    const touched = strongest.get(user) ?? new Map<number, number>();
    touched.set(product, Math.max(touched.get(product) ?? 0, weight));
    strongest.set(user, touched);
  }

  const set: TrainingSet = { users: [], products: [], labels: [] };
  const allProducts = [...productIndex.values()];
  for (const [user, touched] of strongest) {
    for (const [product, weight] of touched) {
      set.users.push(user);
      set.products.push(product);
      set.labels.push(weight);
    }
    const untouched = allProducts.filter((product) => !touched.has(product));
    tf.util.shuffle(untouched);
    for (const product of untouched.slice(0, touched.size)) {
      set.users.push(user);
      set.products.push(product);
      set.labels.push(0);
    }
  }
  return set;
}

function buildModel(userCount: number, productCount: number): Tf.LayersModel {
  const userInput = tf.input({ shape: [1], dtype: 'int32' });
  const productInput = tf.input({ shape: [1], dtype: 'int32' });

  const userVector = tf.layers
    .flatten()
    .apply(
      tf.layers
        .embedding({ inputDim: userCount, outputDim: EMBEDDING_DIM })
        .apply(userInput),
    ) as Tf.SymbolicTensor;
  const productVector = tf.layers
    .flatten()
    .apply(
      tf.layers
        .embedding({ inputDim: productCount, outputDim: EMBEDDING_DIM })
        .apply(productInput),
    ) as Tf.SymbolicTensor;

  const affinity = tf.layers
    .dot({ axes: 1 })
    .apply([userVector, productVector]) as Tf.SymbolicTensor;
  const output = tf.layers
    .dense({ units: 1, activation: 'sigmoid' })
    .apply(affinity) as Tf.SymbolicTensor;

  const model = tf.model({
    inputs: [userInput, productInput],
    outputs: output,
  });
  model.compile({
    optimizer: tf.train.adam(LEARNING_RATE),
    loss: 'binaryCrossentropy',
  });
  return model;
}

const column = (values: number[]) =>
  tf.tensor2d(values, [values.length, 1], 'int32');

/**
 * Trains on every shopper's interactions and returns the products this shopper is most
 * likely to want, best first. Empty when they have no interactions with listed products.
 */
export async function rankProducts<P extends RecommendableProduct>(
  userId: string,
  interactions: Interaction[],
  products: P[],
  limit = RECOMMENDATIONS_LIMIT,
): Promise<P[]> {
  const own = interactions.filter((entry) => entry.userId === userId);
  if (own.length === 0 || products.length === 0) return [];

  const userIndex = new Map<string, number>();
  for (const { userId: id } of interactions) {
    if (!userIndex.has(id)) userIndex.set(id, userIndex.size);
  }
  const productIndex = new Map(products.map((product, i) => [product.id, i]));

  const set = buildTrainingSet(interactions, userIndex, productIndex);
  if (set.labels.length === 0) return [];

  const model = buildModel(userIndex.size, products.length);
  const users = column(set.users);
  const trainedProducts = column(set.products);
  const labels = tf.tensor2d(set.labels, [set.labels.length, 1]);
  const candidates = column(products.map((_, i) => i));
  const shopper = column(products.map(() => userIndex.get(userId) as number));
  try {
    await model.fit([users, trainedProducts], labels, {
      epochs: EPOCHS,
      batchSize: BATCH_SIZE,
      shuffle: true,
      verbose: 0,
    });
    const prediction = model.predict([shopper, candidates]) as Tf.Tensor;
    const scores = await prediction.data();
    prediction.dispose();

    const skipped = new Set(
      own
        .filter((entry) => SKIPPED_ACTIONS.has(entry.actionType))
        .map((entry) => entry.productId),
    );
    return products
      .map((product, i) => ({ product, score: scores[i] }))
      .filter(({ product }) => !skipped.has(product.id))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ product }) => product);
  } finally {
    tf.dispose([users, trainedProducts, labels, candidates, shopper]);
    model.dispose();
  }
}

/** Recommends products for a shopper from everyone's stored activity. */
export async function recommendProducts<P extends RecommendableProduct>(
  userId: string,
  allProducts: P[],
  limit = RECOMMENDATIONS_LIMIT,
): Promise<P[]> {
  const userActions = await getAllUserActivity();
  const { interactions, products } = preprocessData(userActions, allProducts);
  return rankProducts(userId, interactions, products, limit);
}
