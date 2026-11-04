# Dating Cloud V5 — Design & Animation Refresh

This update refreshes all 21 routes with a coordinated plum, rose and warm cream design. The home page has a new editorial layout; public pages, authentication and the complete member area share the same visual language.

## Run locally

1. Install Node.js 20.9 or newer.
2. Run `npm ci`.
3. Copy `.env.example` to `.env.local` and configure your existing backend and Socket.IO origins.
4. Run `npm run dev`, then open `http://localhost:3000`.
5. For production, run `npm run build` and `npm start`.

The development script also accepts `--host` and `--port` flags from preview runners. Real login, discovery, messaging and support require your backend. No demo accounts or mock endpoints are included.

## What changed

- Rebuilt home page, responsive image compositions, animated FAQ and email-to-signup flow.
- Restyled About, How It Works, Stories, Safety, FAQs, Contact, Privacy and Terms.
- Updated login, signup, OTP, onboarding, member details and all member screens.
- Added a member navigation bar for discovery, matches, messages, profile, updates, Plus, help and settings.
- Unified route entrances, scroll reveals, card/button interactions, dialog entrances, skeletons, typing indicators and swipe feedback under one active motion controller.
- Reduced-motion preferences stop both CSS animation and JavaScript reveals. Content remains readable without animation.
- Dialogs lock background scrolling, trap keyboard focus, close with Escape and return focus to the triggering control.
- Fixed the two-column desktop chat layout and missing icon imports.
- Bundled public photography locally; public pages no longer require remote Google Fonts or image requests for their active layouts.

`app/design-v5.css` is the active visual and animation layer. Earlier structural styles are retained for existing components. The V3/V4 motion styles and `MotionV4` controller are no longer imported. Previous upgrade reports are in `reference/history`.

## Checks

Run `npm test` and `npm run build`. See `VALIDATION.md` for the checks completed on this version and their limits. Existing API contracts are documented in `reference/member-api-contract.md`.

---

## Original project documentation

> **Premium V2 upgrade:** Read [PREMIUM-V2-REPORT.md](PREMIUM-V2-REPORT.md) for new designs, exact modified files, test results and remaining verification. Run `npm run test:v2` along with `npm run test:smoke` and `npm run test:routes`.

> **Unified redesign:** Start with [UNIFIED-REDESIGN-REPORT.md](UNIFIED-REDESIGN-REPORT.md) for routes, verification, file changes, environment setup and limitations.

# Dating Cloud — Next.js Member Website

A Next.js 15 + React 19 + TypeScript website built from the supplied **Dating App Member API** contract and original HTML member test application. This project is the **member-facing website**, not the admin console. It uses your **existing Node.js/MongoDB backend**; it does not create a duplicate API/database.

## Requirements
- Node.js 20+ (recommended Node 22)
- Existing Dating Cloud backend reachable on port 5050 or your current backend tunnel
- Network access to install npm packages
- Backend connected to its MongoDB Atlas database

## Run locally

1. Extract the ZIP, then open a terminal in the `dating-cloud-nextjs` folder.
2. Copy `.env.example` to `.env.local`.
3. Update `BACKEND_ORIGIN` and `NEXT_PUBLIC_SOCKET_ORIGIN` to match the **same backend**. For local development use `http://127.0.0.1:5050`; for your ngrok backend use its **current** HTTPS URL (not the stale URL from the API documentation).
4. Check that `NEXT_PUBLIC_TERMS_VERSION` matches your backend setting.
5. Run:

```bash
npm install
npm run dev
```

Visit **http://localhost:3000**.

Test a production compilation before deployment:

```bash
npm run test:smoke
npm run lint
npm run build
npm run start
```

> Offline smoke tests passed for source parsing, API response handling, refresh token rotation, session invalidation, and age/media validation. **Full Next.js compilation and live API/Socket.IO integration still require installing dependencies and connecting your backend**; the npm registry was inaccessible in this environment.

## How the backend connects

The Next.js server proxies:
- `/api/v1/*` => `${BACKEND_ORIGIN}/api/v1/*`
- `/uploads/*` => `${BACKEND_ORIGIN}/uploads/*`

Client-side Socket.IO connects directly to `${NEXT_PUBLIC_SOCKET_ORIGIN}/v1` with `transports:['websocket']` and `auth: {token: accessToken}` per your API contract. Configure WebSocket support and CORS on the existing backend appropriately.

`BACKEND_ORIGIN` is **server-side**; `NEXT_PUBLIC_SOCKET_ORIGIN` is intentionally visible in browser bundles. Never put private API secrets in public environment variables.

## Screens

| Route | UI and backend API support |
| --- | --- |
| `/` and `/discover` | Full-photo swipe deck, LIKE/PASS/SUPER_LIKE, premium undo, filters, full profile, report/block, match popup |
| `/matches` | Matches, likes received/sent, premium locked state, like back, unmatch |
| `/messages` | Conversation list, message thread, text/image sends, typing, read receipts, report/block/unmatch, Socket.IO |
| `/profile` | Profile edit, photos, reorder/delete, interests, discovery preferences, verification selfie |
| `/notifications` | Inbox, mark read, notification preferences |
| `/premium` | Catalog and active entitlement display (no unconfigured purchase flow) |
| `/help` | FAQs, support ticket creation, remembered ticket ID lookup |
| `/account` | Sessions, log out all, block/unblock, export status, health, deletion request |
| Before onboarding | OTP request/verify, email login/registration, photo upload, interests, onboarding |

### API coverage notes

Most member REST calls and live events in `reference/member-api-contract.md` are integrated. These are **intentionally not represented as available in the web UI**:

- `/auth/social/:provider`: the documented backend currently returns `501 FEATURE_NOT_CONFIGURED`.
- `/subscriptions/verify` and `/subscriptions/restore`: the documented backend currently returns 501; browser checkout also needs an appropriate billing strategy. Plans are displayed but purchase is disabled.
- `/devices` create/delete: designed for **IOS/ANDROID push device tokens** in the backend API; browser push would need a dedicated web-push implementation.
- `/media/:mediaId`, `/matches/:matchId`, `/conversations/:conversationId`: individual metadata endpoints not needed by current screens because list responses already supply required fields; add on demand for drill-down views.
- The API currently provides `GET /account/export-status` but no member-facing endpoint for **creating** a new export job.
- Support API has `POST /support/tickets` and `GET /support/tickets/:id` but no ticket listing API; this site remembers created ticket IDs in browser storage, like the supplied test app.

## Security & production readiness

**Important**: This is an integration-ready front-end starter, **not a production-security-certified release**.

- For parity with the supplied client-only member test app, access and refresh tokens are stored in `sessionStorage` and refreshed on HTTP 401. For a hardened production deployment, move refresh tokens to **HttpOnly, Secure, SameSite cookies** via a Next.js server-side session/BFF flow, and implement CSRF protection for cookie-based writes.
- Do not embed OTP test codes, placeholders or test-only phone numbers in a public release. SMS mode, Apple and Google authentication, app payments and production legal terms must be configured in the backend.
- Implement real rate-limit handling using `Retry-After` where appropriate; the current UI reports 429 without automated retries.
- Validate uploaded media size and content server-side, enforce age >=18, enforce moderation and blocked-user rules on the backend, and use HTTPS in production.
- Treat profile location, chats, phone/email and verification content as private data. Respect server-side authorization.
- Consider GDPR/local privacy obligations, accessibility QA, SEO metadata, privacy/terms pages, analytics consent, and monitoring before launch.

## Source material

- `reference/member-api-contract.md` — the supplied API documentation
- `reference/original-member-test-app.html` — the supplied standalone test client, retained as migration reference

## Folder structure

```
app/
  layout.tsx                 Root layout, styles, state provider
  [[...slug]]/page.tsx       Catch-all member routes
  globals.css               Fully responsive custom UI styling
components/
  dating-app.tsx            Sidebar/topbar/bottom navigation
  auth.tsx                  OTP, email login and registration
  onboarding.tsx            Multi-step member onboarding
  discover.tsx              Discovery, swipes and safety actions
  matches.tsx               Matches and likes
  chat.tsx                  Chat and WebSocket client
  profile.tsx               Profile/photo/preferences/verification
  extras.tsx                Notifications, premium, help, account
  provider.tsx              Session and profile state
  ui.tsx                    Shared UI components
lib/
  api.ts                   API wrapper with token refresh and upload
  types.ts                 Shared types
```

## Latest UI refresh (October 2026)
- Added a new “A more thoughtful way to meet” section to the public landing page.
- Added accessible, native expandable FAQ items covering account setup and online safety.
- Refined member dashboard interactions, chat message styling, profile progress colors, and hover/focus treatments.
- Existing API calls, authentication flow, routing, and admin/backend separation were not intentionally changed.

Validation note: `npm run test:smoke` passed with the available TypeScript runtime. Installing Next.js dependencies, a complete `npm run build`, and live REST/Socket.IO testing were not possible here due to blocked npm registry DNS. Run all three checks (`test:smoke`, `lint`, `build`) locally after `npm install` before deploying.

## Public website pages and member navigation

The public marketing website has separate routes:
- `/` — public landing page when signed out
- `/about` — About Dating Cloud
- `/how-it-works` — onboarding overview
- `/safety` — online dating safety guidance
- `/contact` — contact and support guidance
- `/privacy` — privacy guidance
- `/terms` — community guidelines

After sign-in, member features use dedicated routes: `/discover`, `/matches`, `/messages`, `/profile`, `/notifications`, `/premium`, `/help`, and `/account`. Messages/chat remains its own page at `/messages`; the member area uses a horizontal website-style navigation rather than an admin-style sidebar.

## Bug fixes in the updated package (23 October 2026)

- **Authentication & REST:** Better handling of HTML/non-JSON proxy responses, clear errors on unexpected payloads, token refresh deduplication and retry, prevention of old sessions resurfacing after logout, immediate local logout, safer persisted session restore.
- **Register & onboarding:** Accurate date-of-birth checks for 18+, E.164 phone formatting guidance, OTP resend cooldown and six-digit validation; validates photo type and size and releases preview object URLs.
- **Profile:** Prefills saved `preferences` (`minAge`, `maxAge`, `maxDistanceKm`, `showMe`) and `interestIds`; validates ranges; no longer reports a successful deletion if the user cancels the confirmation; clearer photo buttons.
- **Discover:** Server-side saved discovery preferences are honored by default instead of being overridden by hard-coded values; filter edits do not trigger requests until applied; new matches link to their actual conversation; reporting modals no longer overlap.
- **Messages:** Conversation deep links respond to URL query changes, outdated message requests cannot replace a newly opened thread, real-time refreshes avoid repeatedly showing the conversation loader, and typing stops on blur/send. Match portraits use the shared media URL handling.
- **Tooling:** Added `lib/validation.ts` and `scripts/smoke-test.cjs`. Run `npm run test:smoke` offline after dependencies are installed. A stale TypeScript incremental build cache was removed.

These are code-level fixes to the uploaded frontend. This ZIP does **not** include the backend, MongoDB database, or deployed site. The site has not been changed on your live domain. See `VALIDATION.md` for verification and remaining integration requirements.


## Public homepage and About page refresh (23 October 2026)

- Expanded the public homepage with a connection-focused feature band, safety/protection messaging, shared-interest discovery, conversation-first guidance and a responsive editorial image section.
- Added dedicated `/success-stories` and `/faq` informational pages, with clear navigation links.
- Expanded `/about` into a fuller brand story covering purpose, discovery, conversations, safety, adult community expectations and realistic outcomes.
- The root route `/` now consistently opens the public homepage even for signed-in users. Member features remain available at explicit routes such as `/discover`, `/matches`, `/messages` and `/profile`.
- Kept the existing Node.js backend API integration and React admin panel outside this frontend-only change.
- Inspired by modern dating.com-style marketing structure, without copying its brand assets or exact text.

Validation: `npm run test:smoke` passed after these changes (18 TypeScript/TSX sources parsed and API/session smoke tests passed). Full Next.js production build and live backend/browser checks still require installing project dependencies and running the existing backend.
