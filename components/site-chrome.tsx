'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import {
  Heart, Menu, X, ArrowRight, LogOut, ShieldCheck, Bell, User,
  Settings, Info, CreditCard, MessagesSquare, Zap, Compass, MessageCircle, Store,
} from 'lucide-react';
import { useApp } from './provider';
import { Avatar } from './ui';
import { request } from '@/lib/api';

const publicLinks = [
  ['Home', '/'],
  ['Discover', '/discover'],
  ['About', '/about'],
  ['How It Works', '/how-it-works'],
  ['Stories', '/success-stories'],
  ['Safety', '/safety'],
];

const memberLinks = [
  ['Discover', '/discover'],
  ['Matches', '/matches'],
  ['Messages', '/messages'],
  ['Store', '/store'],
];

export function Logo({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link className={`dc-logo ${inverse ? 'inverse' : ''}`} href="/" aria-label="Dating Cloud home">
      <span className="dc-logo-mark">
        <Heart fill="currentColor" size={20} />
      </span>
      <span className="dc-logo-name">
        Dating<span>Cloud</span>
        <small>CONNECTIONS THAT MATTER</small>
      </span>
    </Link>
  );
}

export function SiteHeader() {
  const { session, me, signOut } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const menuButton = useRef<HTMLButtonElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  const onMessages = pathname === '/messages' || pathname.startsWith('/messages/');

  // Close menus on route change
  useEffect(() => {
    setOpen(false);
    setAccount(false);
  }, [pathname]);

  // Messages route viewport layout class
  useEffect(() => {
    document.body.classList.toggle('dc-msg-route', onMessages);
    return () => document.body.classList.remove('dc-msg-route');
  }, [onMessages]);

  // Click outside to close account menu
  useEffect(() => {
    if (!account) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccount(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [account]);

  // Fetch unread notifications count when logged in
  useEffect(() => {
    if (!session) return;
    let active = true;
    request<{ items: { isRead?: boolean; readAt?: string | null }[] }>('GET', '/notifications?limit=25')
      .then((res) => {
        if (!active) return;
        const count = (res.items || []).filter((n) => !n.isRead && !n.readAt).length;
        setUnreadNotifs(count);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [session, pathname]);

  // Mobile menu keyboard and resize listeners (guests only)
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    const media = matchMedia('(min-width: 961px)');
    const resize = () => {
      if (media.matches) setOpen(false);
    };

    document.addEventListener('keydown', close);
    media.addEventListener('change', resize);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', close);
      media.removeEventListener('change', resize);
    };
  }, [open]);

  const navLinks = session ? memberLinks : publicLinks;

  return (
    <header className={`dc-header${onMessages ? ' dc-header-messages' : ''}`}>
      <div className="dc-header-inner">
        {/* Brand Logo */}
        <Logo />

        {/* Desktop Navigation */}
        <nav className={`dc-nav ${open ? 'open' : ''}`} id="main-navigation" aria-label="Main navigation">
          {navLinks.map(([label, url]) => {
            const isActive = pathname === url || (url === '/messages' && pathname.startsWith('/messages/'));
            return (
              <Link
                key={url}
                href={url}
                className={isActive ? 'active' : ''}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => setOpen(false)}
              >
                {label}
              </Link>
            );
          })}

          {/* Mobile-only Extra Links (guest hamburger menu) */}
          {!session && (
            <>
              <Link className="dc-mobile-extra" href="/login" onClick={() => setOpen(false)}>
                Login
              </Link>
              <Link className="dc-mobile-extra dc-mobile-join" href="/signup" onClick={() => setOpen(false)}>
                Join Free
              </Link>
            </>
          )}
        </nav>

        {/* Right Header Actions */}
        <div className="dc-header-actions">
          {session ? (
            <>
              <Link href="/notifications" className="dc-header-icon" title="Notifications" aria-label="Notifications">
                <Bell size={18} strokeWidth={1.8} />
                {unreadNotifs > 0 && <span className="dc-notif-dot" />}
              </Link>

              {/* User Account Dropdown — same on desktop & mobile */}
              <div className="dc-account" ref={accountRef}>
                <button
                  type="button"
                  className="dc-account-trigger"
                  onClick={() => setAccount((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={account}
                  title="Account menu"
                >
                  <span className="dc-account-ring" aria-hidden />
                  <Avatar user={me} size={36} />
                </button>

                {account && (
                  <div className="dc-account-menu" role="menu">
                    <Link className="dc-account-mobile-nav" href="/discover" role="menuitem" onClick={() => setAccount(false)}>
                      <Compass size={18} strokeWidth={1.7} />
                      <span>Discover</span>
                    </Link>
                    <Link className="dc-account-mobile-nav" href="/matches" role="menuitem" onClick={() => setAccount(false)}>
                      <MessagesSquare size={18} strokeWidth={1.7} />
                      <span>Matches</span>
                    </Link>
                    <Link className="dc-account-mobile-nav" href="/messages" role="menuitem" onClick={() => setAccount(false)}>
                      <MessageCircle size={18} strokeWidth={1.7} />
                      <span>Messages</span>
                    </Link>
                    <Link className="dc-account-mobile-nav" href="/store" role="menuitem" onClick={() => setAccount(false)}>
                      <Store size={18} strokeWidth={1.7} />
                      <span>Store</span>
                    </Link>
                    <div className="dc-menu-divider dc-account-mobile-nav" />

                    <Link href="/profile" role="menuitem" onClick={() => setAccount(false)}>
                      <User size={18} strokeWidth={1.7} />
                      <span>Profile</span>
                    </Link>
                    <Link className="dc-account-desktop-only" href="/matches" role="menuitem" onClick={() => setAccount(false)}>
                      <MessagesSquare size={18} strokeWidth={1.7} />
                      <span>Community</span>
                    </Link>
                    <Link href="/premium" role="menuitem" onClick={() => setAccount(false)}>
                      <CreditCard size={18} strokeWidth={1.7} />
                      <span>Subscription</span>
                      <span className="dc-menu-pro">
                        <Zap size={11} fill="currentColor" />
                        PRO
                      </span>
                    </Link>
                    <Link href="/account" role="menuitem" onClick={() => setAccount(false)}>
                      <Settings size={18} strokeWidth={1.7} />
                      <span>Settings</span>
                    </Link>

                    <div className="dc-menu-divider" />

                    <Link href="/help" role="menuitem" onClick={() => setAccount(false)}>
                      <Info size={18} strokeWidth={1.7} />
                      <span>Help center</span>
                    </Link>
                    <button
                      type="button"
                      className="dc-menu-logout"
                      role="menuitem"
                      onClick={() => {
                        setAccount(false);
                        void signOut();
                        router.push('/');
                      }}
                    >
                      <LogOut size={18} strokeWidth={1.7} />
                      <span>Sign out</span>
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link className="dc-login" href="/login">
                Login
              </Link>
              <Link className="dc-join" href="/signup">
                <span>Join Free</span>
                <ArrowRight size={15} />
              </Link>
            </>
          )}
        </div>

        {/* Guest-only mobile nav toggle — logged-in users use avatar like desktop */}
        {!session && (
          <button
            ref={menuButton}
            type="button"
            aria-controls="main-navigation"
            className="dc-menu-toggle"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        )}
      </div>
    </header>
  );
}

export function SiteFooter() {
  const pathname = usePathname();
  if (pathname === '/messages' || pathname.startsWith('/messages/')) return null;

  return (
    <footer className="dc-footer">
      <div className="dc-footer-inner">
        <div className="dc-footer-main">
          <div className="dc-footer-brand">
            <Logo inverse />
            <p>
              Real people, genuine conversations, new possibilities. Meet at your own pace, in a place built for
              meaningful connection.
            </p>
            <span>
              <ShieldCheck size={15} /> For adults 18 and over
            </span>
          </div>
          <div className="dc-footer-links">
            <h3>Explore</h3>
            <Link href="/">Home</Link>
            <Link href="/about">About us</Link>
            <Link href="/how-it-works">How it works</Link>
            <Link href="/success-stories">Success stories</Link>
          </div>
          <div className="dc-footer-links">
            <h3>Members</h3>
            <Link href="/discover">Discover</Link>
            <Link href="/matches">Matches</Link>
            <Link href="/messages">Messages</Link>
            <Link href="/profile">My profile</Link>
          </div>
          <div className="dc-footer-links">
            <h3>Support & legal</h3>
            <Link href="/safety">Safety center</Link>
            <Link href="/faq">FAQs</Link>
            <Link href="/contact">Contact us</Link>
            <Link href="/privacy">Privacy policy</Link>
            <Link href="/terms">Terms & conditions</Link>
          </div>
        </div>
        <div className="dc-footer-end">
          <span>© {new Date().getFullYear()} Dating Cloud. All rights reserved.</span>
          <span>Made for meaningful connections ♡</span>
        </div>
      </div>
    </footer>
  );
}
