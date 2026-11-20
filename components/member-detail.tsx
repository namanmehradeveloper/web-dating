'use client';

import { useEffect, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Heart, MapPin, ShieldCheck, Flag, Ban, Briefcase,
  Sparkles, Star, MessageCircle, ChevronLeft, ChevronRight,
  Maximize2, X, Share2, Compass, Check
} from 'lucide-react';
import { request, mediaUrl, messageOf, uid } from '@/lib/api';
import { fetchMatches, fetchProfileById } from '@/lib/query/fetchers';
import { invalidateAfterBlockChange, invalidateAfterSwipeOrMatch } from '@/lib/query/invalidation';
import { queryKeys } from '@/lib/query/keys';
import { cachePolicies } from '@/lib/query/policies';
import type { Member, Match } from '@/lib/types';
import { Button, Loading, Failure, Modal, Avatar } from './ui';
import { useApp } from './provider';

interface MemberDetailProps {
  id: string;
  go: (url: string) => void;
}

export function MemberDetail({ id, go }: MemberDetailProps) {
  const { toast, confirmAction, session } = useApp();
  const queryClient = useQueryClient();
  const userId = session?.userId || '';
  const [busy, setBusy] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState('FAKE_PROFILE');
  const [details, setDetails] = useState('');
  const [matchedData, setMatchedData] = useState<{ conversationId?: string } | null>(null);
  const [liked, setLiked] = useState(false);

  const profileQuery = useQuery({
    queryKey: queryKeys.profile.byId(userId || '__none__', id),
    queryFn: () => fetchProfileById(id),
    enabled: Boolean(userId && id),
    staleTime: cachePolicies.profileById.staleTime,
    gcTime: cachePolicies.profileById.gcTime,
  });

  const matchesQuery = useQuery({
    queryKey: queryKeys.matches.list(userId || '__none__'),
    queryFn: fetchMatches,
    enabled: Boolean(userId),
    staleTime: cachePolicies.matches.staleTime,
    gcTime: cachePolicies.matches.gcTime,
  });

  const person = profileQuery.data || null;
  const error = profileQuery.isError ? messageOf(profileQuery.error) : '';
  const existingMatch = (matchesQuery.data?.items || []).find((m) => m.otherUser?.id === id) || null;

  // Handle keyboard navigation for photos
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!person?.photos?.length) return;
      if (e.key === 'ArrowLeft') {
        setPhotoIndex((prev) => (prev - 1 + person.photos!.length) % person.photos!.length);
      } else if (e.key === 'ArrowRight') {
        setPhotoIndex((prev) => (prev + 1) % person.photos!.length);
      } else if (e.key === 'Escape') {
        setLightboxOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [person?.photos]);

  const handleBack = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
    } else {
      go('/matches');
    }
  }, [go]);

  const handleShare = useCallback(() => {
    if (typeof window !== 'undefined') {
      void navigator.clipboard.writeText(window.location.href);
      toast.info('Profile link copied to clipboard!');
    }
  }, [toast]);

  const like = async (action: 'LIKE' | 'SUPER_LIKE' = 'LIKE') => {
    setBusy(true);
    try {
      const d = await request<{ isMatch?: boolean; match?: { conversationId?: string } }>('POST', '/swipes', {
        body: { targetUserId: id, action },
        idempotencyKey: uid(),
      });
      setLiked(true);
      if (d.isMatch) {
        setMatchedData({ conversationId: d.match?.conversationId });
        toast.success("It's a match! 🎉");
      } else {
        toast.success(action === 'SUPER_LIKE' ? 'Super like sent! ⭐' : 'Like sent! 💗');
      }
      if (userId) invalidateAfterSwipeOrMatch(userId, queryClient);
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const block = async () => {
    if (!person) return;
    const ok = await confirmAction({
      title: `Block ${person.displayName}?`,
      message: 'You will no longer see each other.',
      confirmLabel: 'Block member',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await request('POST', `/users/${encodeURIComponent(id)}/block`);
      toast.success('Member blocked.');
      if (userId) invalidateAfterBlockChange(userId, queryClient);
      go('/matches');
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const sendReport = async () => {
    setBusy(true);
    try {
      await request('POST', '/reports', {
        body: { targetType: 'USER', targetId: id, reason, details, alsoBlock: true },
      });
      toast.success('Report submitted.');
      setReportOpen(false);
      if (userId) invalidateAfterBlockChange(userId, queryClient);
      go('/matches');
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="md-page-wrapper">
        <Failure error={error} retry={() => go('/matches')} />
      </div>
    );
  }

  if (!person) {
    return (
      <div className="md-page-wrapper">
        <Loading label="Loading profile..." />
      </div>
    );
  }

  const photos = person.photos || [];
  const currentPhoto = photos[photoIndex];

  return (
    <div className="md-page-wrapper">
      {/* Top Bar Navigation */}
      <nav className="md-top-nav" aria-label="Profile navigation">
        <button
          type="button"
          className="md-back-button"
          onClick={handleBack}
          aria-label="Go back"
        >
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>

        <div className="md-top-actions">
          <button
            type="button"
            className="md-icon-pill-btn"
            onClick={handleShare}
            title="Share profile link"
          >
            <Share2 size={15} />
            <span>Share</span>
          </button>
        </div>
      </nav>

      {/* Main Profile Grid */}
      <div className="md-profile-grid">
        {/* Left Column: Photo Showcase */}
        <div className="md-photo-showcase">
          <div className="md-photo-card">
            {photos.length > 0 ? (
              <>
                {/* Story-style Progress Bars */}
                {photos.length > 1 && (
                  <div className="md-photo-bars" aria-label="Photo progress">
                    {photos.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        className={`md-photo-bar ${i === photoIndex ? 'active' : ''}`}
                        onClick={() => setPhotoIndex(i)}
                        aria-label={`Show photo ${i + 1}`}
                      />
                    ))}
                  </div>
                )}

                {/* Main Photo */}
                <img
                  className="md-photo-img"
                  src={mediaUrl(currentPhoto?.url)}
                  alt={`${person.displayName} photo ${photoIndex + 1}`}
                  onClick={() => setLightboxOpen(true)}
                  style={{ cursor: 'pointer' }}
                />

                {/* Left / Right Carousel Controls */}
                {photos.length > 1 && (
                  <>
                    <button
                      type="button"
                      className="md-nav-btn prev"
                      aria-label="Previous photo"
                      onClick={() => setPhotoIndex((i) => (i - 1 + photos.length) % photos.length)}
                    >
                      <ChevronLeft size={22} />
                    </button>
                    <button
                      type="button"
                      className="md-nav-btn next"
                      aria-label="Next photo"
                      onClick={() => setPhotoIndex((i) => (i + 1) % photos.length)}
                    >
                      <ChevronRight size={22} />
                    </button>
                  </>
                )}

                {/* Photo Expand Fullscreen Button */}
                <button
                  type="button"
                  className="md-photo-zoom-btn"
                  onClick={() => setLightboxOpen(true)}
                  title="View fullscreen photo"
                  aria-label="View fullscreen photo"
                >
                  <Maximize2 size={15} />
                </button>

                {/* Photo Counter Pill */}
                <div className="md-photo-counter">
                  {photoIndex + 1} / {photos.length}
                </div>
              </>
            ) : (
              <div className="md-photo-placeholder">
                <Avatar user={person} size={88} />
                <span>No photos shared yet</span>
              </div>
            )}
          </div>

          {/* Thumbnails Strip */}
          {photos.length > 1 && (
            <div className="md-thumb-strip" aria-label="Photo thumbnails">
              {photos.map((p, i) => (
                <button
                  key={p.id || i}
                  type="button"
                  className={`md-thumb-btn ${i === photoIndex ? 'active' : ''}`}
                  onClick={() => setPhotoIndex(i)}
                  aria-label={`View photo ${i + 1}`}
                >
                  <img src={mediaUrl(p.url)} alt={`Thumbnail ${i + 1}`} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Member Information & Actions */}
        <div className="md-info-column">
          {/* Identity & Quick Actions Card */}
          <div className="md-hero-info-card">
            {/* Online Status Tag */}
            <div className="md-presence-row">
              {person.isOnline ? (
                <span className="md-online-tag">
                  <span className="md-pulse-dot" />
                  <span>Active Now</span>
                </span>
              ) : person.lastSeenAt ? (
                <span className="md-offline-tag">
                  Active recently
                </span>
              ) : null}
            </div>

            {/* Name, Age & Verification */}
            <div className="md-name-row">
              <h1>
                {person.displayName}
                {person.age ? `, ${person.age}` : ''}
              </h1>
              {person.isVerified && (
                <span className="md-verified-badge" title="Verified Member">
                  <ShieldCheck size={16} /> Verified
                </span>
              )}
            </div>

            {/* Metadata Pills (City, Distance, Occupation, Goal) */}
            <div className="md-quick-tags">
              {person.city && (
                <span className="md-meta-badge">
                  <MapPin size={14} /> {person.city}
                </span>
              )}
              {person.distanceKm != null && (
                <span className="md-meta-badge">
                  <Compass size={14} /> {person.distanceKm} km away
                </span>
              )}
              {person.occupation && (
                <span className="md-meta-badge">
                  <Briefcase size={14} /> {person.occupation}
                </span>
              )}
              {person.relationshipGoal && (
                <span className="md-meta-badge highlight">
                  <Sparkles size={14} /> {person.relationshipGoal}
                </span>
              )}
            </div>

            {/* Primary Action Buttons */}
            <div className="md-actions-bar">
              {existingMatch ? (
                <button
                  type="button"
                  className="md-btn-chat"
                  onClick={() =>
                    go(existingMatch.conversationId ? `/messages/${encodeURIComponent(existingMatch.conversationId)}` : '/messages')
                  }
                >
                  <MessageCircle size={18} />
                  <span>Chat with {person.displayName}</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className={`md-btn-like ${liked ? 'liked' : ''}`}
                    disabled={busy || liked}
                    onClick={() => void like('LIKE')}
                  >
                    {liked ? (
                      <>
                        <Check size={18} />
                        <span>Liked</span>
                      </>
                    ) : (
                      <>
                        <Heart size={18} fill="currentColor" />
                        <span>Like Profile</span>
                      </>
                    )}
                  </button>

                  {!liked && (
                    <button
                      type="button"
                      className="md-btn-superlike"
                      disabled={busy}
                      onClick={() => void like('SUPER_LIKE')}
                      title="Super Like"
                    >
                      <Star size={17} fill="currentColor" />
                      <span>Super Like</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* About Section */}
          <div className="md-card">
            <h2>About {person.displayName}</h2>
            <p className="md-bio-text">
              {person.bio || 'This member has not written a bio yet, but feel free to say hi!'}
            </p>
          </div>

          {/* Interests & Passions */}
          {Boolean(person.interests?.length) && (
            <div className="md-card">
              <h2>Interests & Passions</h2>
              <div className="md-interests-grid">
                {person.interests?.map((tag) => (
                  <span key={tag} className="md-interest-pill">
                    <Sparkles size={13} className="md-pill-sparkle" />
                    <span>{tag}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Basics & Lifestyle (if available) */}
          {person.basics && Object.keys(person.basics).length > 0 && (
            <div className="md-card">
              <h2>Basics & Lifestyle</h2>
              <div className="md-basics-grid">
                {Object.entries(person.basics).map(([key, val]) => (
                  <div key={key} className="md-basic-item">
                    <small>{key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}</small>
                    <strong>{String(val)}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Prompt Q&A Card (if available) */}
          {person.prompt?.answer && (
            <div className="md-prompt-card">
              <span className="md-prompt-label">A little more about me</span>
              <h3>{person.prompt.promptId?.replaceAll('_', ' ') || 'What you should know'}</h3>
              <p>"{person.prompt.answer}"</p>
            </div>
          )}

          {/* Safety & Trust Shield */}
          <div className="md-safety-badge">
            <ShieldCheck size={22} />
            <div>
              <strong>Verified & Community Protected</strong>
              <span>Dating Cloud members are 18+ and verified for respectful, genuine dating.</span>
            </div>
          </div>

          {/* Safety Dropdown / Moderation Actions */}
          <div className="md-danger-actions">
            <button
              type="button"
              className="md-danger-btn"
              onClick={() => setReportOpen(true)}
              disabled={busy}
            >
              <Flag size={14} /> Report member
            </button>
            <button
              type="button"
              className="md-danger-btn"
              onClick={() => void block()}
              disabled={busy}
            >
              <Ban size={14} /> Block member
            </button>
          </div>
        </div>
      </div>

      {/* Lightbox Modal for Fullscreen Photo View */}
      {lightboxOpen && currentPhoto && (
        <div
          className="md-lightbox-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxOpen(false)}
        >
          <div
            className="md-lightbox-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="md-lightbox-close"
              onClick={() => setLightboxOpen(false)}
              aria-label="Close fullscreen view"
            >
              <X size={20} />
            </button>

            <img
              className="md-lightbox-img"
              src={mediaUrl(currentPhoto.url)}
              alt={`${person.displayName} photo ${photoIndex + 1}`}
            />

            {photos.length > 1 && (
              <>
                <button
                  type="button"
                  className="md-lightbox-nav prev"
                  onClick={() => setPhotoIndex((i) => (i - 1 + photos.length) % photos.length)}
                  aria-label="Previous photo"
                >
                  <ChevronLeft size={28} />
                </button>
                <button
                  type="button"
                  className="md-lightbox-nav next"
                  onClick={() => setPhotoIndex((i) => (i + 1) % photos.length)}
                  aria-label="Next photo"
                >
                  <ChevronRight size={28} />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Match Celebration Modal */}
      {matchedData && (
        <Modal title="It's a Match! 💗" onClose={() => setMatchedData(null)}>
          <div className="md-match-modal">
            <div className="md-match-avatars">
              <Avatar user={person} size={88} />
            </div>
            <h2>You and {person.displayName} like each other!</h2>
            <p>Ready to break the ice and start talking?</p>
            <div className="md-match-actions">
              <Button
                onClick={() => {
                  setMatchedData(null);
                  go(matchedData.conversationId ? `/messages/${encodeURIComponent(matchedData.conversationId)}` : '/messages');
                }}
              >
                <MessageCircle size={16} /> Send a Message
              </Button>
              <Button tone="outline" onClick={() => setMatchedData(null)}>
                Keep Exploring
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Report Modal */}
      {reportOpen && (
        <Modal title="Report member" onClose={() => setReportOpen(false)}>
          <div className="stack">
            <label>
              Reason
              <select value={reason} onChange={(e) => setReason(e.target.value)}>
                {[
                  'FAKE_PROFILE',
                  'INAPPROPRIATE_PHOTOS',
                  'HARASSMENT',
                  'SPAM_OR_SCAM',
                  'UNDERAGE',
                  'OFFLINE_BEHAVIOUR',
                  'OTHER',
                ].map((x) => (
                  <option key={x} value={x}>
                    {x.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Details
              <textarea
                maxLength={1000}
                placeholder="Please describe why you are reporting this member..."
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              />
            </label>
            <p className="muted">Submitting this report will also block this member from contacting you.</p>
            <Button disabled={busy} tone="danger" onClick={() => void sendReport()}>
              Submit report
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
