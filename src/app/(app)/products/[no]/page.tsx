import { fallbackProducts } from '@/lib/catalog';
import { ProductDetail } from './ProductDetail';

/**
 * Pack numbers come from the shipped catalogue (`src/lib/brand.ts` mirrors the
 * `km_product` seed), so the packs we ship with are prerendered and paint
 * instantly. A number added to the database later renders on demand.
 *
 * The view itself is a client component: live figures come from
 * `km_product_detail` in the browser.
 */
export function generateStaticParams() {
  return fallbackProducts.map((p) => ({ no: String(p.no) }));
}

export default async function ProductDetailPage({ params }: { params: Promise<{ no: string }> }) {
  const { no } = await params;
  return <ProductDetail no={no} />;
}
