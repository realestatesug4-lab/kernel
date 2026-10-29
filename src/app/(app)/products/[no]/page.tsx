import { fallbackProducts } from '@/lib/catalog';
import { ProductDetail } from './ProductDetail';

/**
 * The pack number only exists in the URL, so this segment is allowed to block
 * instead of failing the build while Cache Components tries to prerender
 * per-param metadata for a number it has never seen.
 *
 * `generateStaticParams` still lists the seeded catalogue, so the packs we ship
 * with are prerendered; a pack added to the database later is rendered on
 * demand. The view itself is a client component — the live figures come from
 * `km_product_detail` in the browser.
 */
export const instant = false;

export function generateStaticParams() {
  return fallbackProducts.map((p) => ({ no: String(p.no) }));
}

export default async function ProductDetailPage({ params }: { params: Promise<{ no: string }> }) {
  const { no } = await params;
  return <ProductDetail no={no} />;
}
