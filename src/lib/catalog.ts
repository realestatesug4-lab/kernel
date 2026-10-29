import { brand, products } from '@/lib/brand';
import type { Product } from '@/lib/types';

/**
 * The seed catalogue, shaped like the RPC rows.
 * Used on first paint and whenever the Supabase project is not connected yet.
 */
export const fallbackProducts: Product[] = products.map((p) => ({
  id: String(p.no),
  no: p.no,
  name: p.name,
  tier: p.tier,
  price: p.price,
  daily: p.daily,
  duration_days: p.duration,
  total: p.total,
  image: brand.productImage,
  active: true,
}));
