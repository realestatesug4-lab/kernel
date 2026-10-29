import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RegisterForm } from './RegisterForm';

export const metadata: Metadata = { title: 'Create account' };

/**
 * Referral-aware registration: /register?ref=CODE auto-fills the invite code.
 * `searchParams` is read inside a Suspense boundary so the shell can prerender.
 */
export default function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  return (
    <Suspense fallback={<RegisterForm defaultRef="" />}>
      <ReferralRegister searchParams={searchParams} />
    </Suspense>
  );
}

async function ReferralRegister({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const params = await searchParams;
  const ref = (params.ref ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
  return <RegisterForm defaultRef={ref} />;
}
