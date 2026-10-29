import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase/config';

const PUBLIC_PATHS = ['/login', '/register', '/findpwd', '/about', '/help', '/notice'];
const PROTECTED_PREFIXES = [
  '/home', '/products', '/portfolio', '/income', '/team', '/tasks', '/wallet', '/me', '/settings',
  '/admin',
];

export async function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const { pathname } = request.nextUrl;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value, options } of list) {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Refresh the session exactly once per request; read the outcome afterwards.
  const { data: { user } } = await supabase.auth.getUser();

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = `next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  const isPublicAuth = PUBLIC_PATHS.includes(pathname);
  if (user && (isPublicAuth || pathname === '/')) {
    const url = request.nextUrl.clone();
    url.pathname = '/home';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
