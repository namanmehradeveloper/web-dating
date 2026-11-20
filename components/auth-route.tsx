'use client';
import {Suspense, useEffect} from 'react';
import {useRouter, useSearchParams} from 'next/navigation';
import {useApp} from './provider';
import {Auth} from './auth';
import {Loading} from './ui';

function View({signup}: {signup: boolean}) {
  const {session, ready, meStatus} = useApp();
  const router = useRouter();
  const query = useSearchParams();
  const next = query.get('next');
  const destination =
    next?.startsWith('/')
    && !next.startsWith('//')
    && !next.includes('\\')
    && !/^\/(login|signup)([/?#]|$)/.test(next)
      ? next
      : '/discover';

  useEffect(() => {
    if (ready && session) router.replace(destination);
  }, [ready, session, destination, router]);

  // Only blank while reading local session — keep the auth form visible during redirect.
  if (!ready) {
    return (
      <main id="main-content">
        <Loading label="Opening Dating Cloud…" />
      </main>
    );
  }

  if (session) {
    return (
      <main id="main-content" className="auth-layout auth-redirecting" aria-busy="true">
        <section className="auth-form-area">
          <div className="auth-card">
            <Loading label={meStatus === 'loading' ? 'Signing you in…' : 'Continuing…'} />
            <p className="muted" style={{textAlign: 'center', marginTop: 12}}>
              Taking you to Dating Cloud…
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main id="main-content">
      <Auth initialMode={signup ? 'register' : 'phone'} />
    </main>
  );
}

export function AuthRoute({signup = false}: {signup?: boolean}) {
  return (
    <Suspense fallback={<main id="main-content"><Loading /></main>}>
      <View signup={signup} />
    </Suspense>
  );
}
