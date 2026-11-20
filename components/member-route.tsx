'use client';
import {Suspense, useCallback, useEffect} from 'react';
import dynamic from 'next/dynamic';
import {useRouter, usePathname, useSearchParams} from 'next/navigation';
import {useApp} from './provider';
import {Button, Loading} from './ui';

type Section = 'discover' | 'matches' | 'messages' | 'profile' | 'notifications' | 'premium' | 'store' | 'help' | 'account' | 'security' | 'member';

function sectionFallback(label: string) {
  return function SectionFallback() {
    return <Loading label={label} />;
  };
}

const Discover = dynamic(() => import('./discover').then((m) => ({ default: m.Discover })), {
  loading: sectionFallback('Finding people…'),
  ssr: false,
});
const Matches = dynamic(() => import('./matches').then((m) => ({ default: m.Matches })), {
  loading: sectionFallback('Loading matches…'),
  ssr: false,
});
const Chat = dynamic(() => import('./chat').then((m) => ({ default: m.Chat })), {
  loading: sectionFallback('Loading messages…'),
  ssr: false,
});
const Profile = dynamic(() => import('./profile').then((m) => ({ default: m.Profile })), {
  loading: sectionFallback('Loading your profile…'),
  ssr: false,
});
const Onboarding = dynamic(() => import('./onboarding').then((m) => ({ default: m.Onboarding })), {
  loading: sectionFallback('Preparing onboarding…'),
  ssr: false,
});
const Store = dynamic(() => import('./store').then((m) => ({ default: m.Store })), {
  loading: sectionFallback('Loading store…'),
  ssr: false,
});
const MemberDetail = dynamic(() => import('./member-detail').then((m) => ({ default: m.MemberDetail })), {
  loading: sectionFallback('Loading profile…'),
  ssr: false,
});
const Notifications = dynamic(() => import('./extras').then((m) => ({ default: m.Notifications })), {
  loading: sectionFallback('Loading notifications…'),
  ssr: false,
});
const Premium = dynamic(() => import('./extras').then((m) => ({ default: m.Premium })), {
  loading: sectionFallback('Loading plans…'),
  ssr: false,
});
const Help = dynamic(() => import('./extras').then((m) => ({ default: m.Help })), {
  loading: sectionFallback('Loading help…'),
  ssr: false,
});
const Account = dynamic(() => import('./extras').then((m) => ({ default: m.Account })), {
  loading: sectionFallback('Loading account…'),
  ssr: false,
});
const LoginActivity = dynamic(() => import('./extras').then((m) => ({ default: m.LoginActivity })), {
  loading: sectionFallback('Loading login activity…'),
  ssr: false,
});

function SectionBody({
  section,
  memberId,
  go,
}: {
  section: Section;
  memberId?: string;
  go: (url: string) => void;
}) {
  if (section === 'discover') return <Discover go={go} />;
  if (section === 'matches') return <Matches go={go} />;
  if (section === 'messages') return <Chat go={go} />;
  if (section === 'profile') return <Profile go={go} />;
  if (section === 'notifications') return <Notifications />;
  if (section === 'premium') return <Premium />;
  if (section === 'store') return <Store />;
  if (section === 'help') return <Help />;
  if (section === 'account') return <Account />;
  if (section === 'security') return <LoginActivity />;
  if (section === 'member' && memberId) return <MemberDetail id={memberId} go={go} />;
  return null;
}

function View({section, memberId}: {section: Section; memberId?: string}) {
  const {session, ready, me, meStatus, reloadMe, signOut} = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const query = useSearchParams();

  useEffect(() => {
    if (ready && !session) {
      const next = pathname + (query.toString() ? `?${query.toString()}` : '');
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [ready, session, pathname, query, router]);

  const go = useCallback((url: string) => {
    router.push(url);
  }, [router]);

  // Brief gate only while session is unknown or redirecting to login.
  if (!ready || !session) {
    return (
      <main id="main-content" className={`dc-member dc-${section}${section === 'messages' ? ' dc-member-messages' : ''}`}>
        <Loading label="Opening Dating Cloud…" />
      </main>
    );
  }

  if (!me && meStatus === 'error') {
    return (
      <main id="main-content" className={`dc-member dc-${section}`}>
        <div className="dc-inline-status">
          <h2>Unable to load your profile</h2>
          <p>We couldn’t connect. Please try again in a moment.</p>
          <Button onClick={() => void reloadMe()}>Retry</Button>{' '}
          <Button tone="outline" onClick={() => void signOut()}>Sign out</Button>
        </div>
      </main>
    );
  }

  // Keep member shell visible while /profile/me loads — header stays interactive.
  if (!me) {
    return (
      <main id="main-content" className={`dc-member dc-${section}${section === 'messages' ? ' dc-member-messages' : ''}`}>
        <Loading label="Loading your profile…" />
      </main>
    );
  }

  if (!me.onboardingComplete) return <Onboarding />;

  return (
    <main id="main-content" className={`dc-member dc-${section}${section === 'messages' ? ' dc-member-messages' : ''}`}>
      <SectionBody section={section} memberId={memberId} go={go} />
    </main>
  );
}

export function MemberRoute(props: {section: Section; conversationId?: string; memberId?: string}) {
  return (
    <Suspense
      fallback={
        <main id="main-content" className={`dc-member dc-${props.section}${props.section === 'messages' ? ' dc-member-messages' : ''}`}>
          <Loading />
        </main>
      }
    >
      <View section={props.section} memberId={props.memberId} />
    </Suspense>
  );
}
