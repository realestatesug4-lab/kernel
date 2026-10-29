import Image from 'next/image';
import { brand } from '@/lib/brand';

/** Brand mark from /public/assets/logo.jpg + wordmark. */
export function Logo({
  size = 40,
  withWordmark = true,
}: {
  size?: number;
  withWordmark?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className="relative shrink-0 overflow-hidden rounded-full ring-1 ring-white/10"
        style={{ width: size, height: size }}
      >
        <Image src={brand.logo} alt={`${brand.name} logo`} fill sizes={`${size}px`} className="object-cover" priority />
      </span>
      {withWordmark && (
        <span className="text-lg font-extrabold tracking-tight">
          <span className="text-white">KERNEL</span>
          <span className="brand-text">MINERS</span>
        </span>
      )}
    </span>
  );
}
