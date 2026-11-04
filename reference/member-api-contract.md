\# Dating App — Member API Documentation



Hand this file to the \*\*mobile / client developer\*\*. It is the contract for the member app only.



It covers every member-facing API under \`/api/v1\`, auth, uploads, chat, Socket.IO, and the usual app flows.



\*\*Do not call from the member app\*\*



\| Path | Why |

\|------|-----|

\| \`/api/v1/admin/\*\` | Admin panel only (separate docs) |

\| \`POST /auth/login/2fa\` | Staff 2FA completion only — not used by members |



\---



\## 1. How to use this API



\### Base URL



\`\`\`

{HOST}/api/v1

\`\`\`



\| Environment | Base URL |

\|-------------|----------|

\| \*\*ngrok (current)\*\* | \`https\://figure-cancel-snowiness.ngrok-free.dev/api/v1\` |

\| Local (same machine) | \`http\://127.0.0.1:5050/api/v1\` |



\*\*Use the ngrok URL on a real device / emulator\*\* so the phone can reach your local backend.



\| Service | URL |

\|---------|-----|

\| REST API | \`https\://figure-cancel-snowiness.ngrok-free.dev/api/v1\` |

\| Uploaded images | \`https\://figure-cancel-snowiness.ngrok-free.dev/uploads/...\` |

\| Socket.IO | \`wss\://figure-cancel-snowiness.ngrok-free.dev/v1\` (namespace \`/v1\`, WebSocket only) |



Example health check (no auth):



\`\`\`

GET https\://figure-cancel-snowiness.ngrok-free.dev/api/v1/health

\`\`\`



\> The free ngrok hostname changes when the tunnel restarts. If DNS / connection fails, ask for the latest \`APP_URL\` from \`backend/.env\` and update the app base URL (REST + image host + Socket.IO).



\### Headers



\| Header | When | Example |

\|--------|------|---------|

\| \`Content-Type\` | JSON bodies | \`application/json\` |

\| \`Authorization\` | All protected routes | \`Bearer \<accessToken>\` |

\| \`Idempotency-Key\` | Swipes + send message | UUID string |

\| \`ngrok-skip-browser-warning\` | Browser / Postman via free ngrok | \`true\` or any value |



CORS allows: \`Authorization\`, \`Content-Type\`, \`Idempotency-Key\`.  

Response may include: \`X-Request-Id\`, \`Retry-After\`.



\*\*ngrok free tip:\*\* Opening the URL in a browser may show an ngrok interstitial page. Native mobile apps usually skip it. For Postman or web testing, send header \`ngrok-skip-browser-warning: true\`.



\### Auth model



1\. Sign in (OTP, email/password, or social when enabled).

2\. Store \`accessToken\` and \`refreshToken\`.

3\. Send \`Authorization: Bearer \<accessToken>\` on protected calls.

4\. On \`401\`, call \`POST /auth/token/refresh\` with \`refreshToken\`, then retry.

5\. On logout, call \`/auth/logout\` or \`/auth/logout-all\`.



\### Response envelope



Every response looks like this:



\*\*Success\*\*

\`\`\`json

{

  "success": true,

  "data": {},

  "meta": { "requestId": "req_xxx" }

}

\`\`\`



\*\*Error\*\*

\`\`\`json

{

  "success": false,

  "error": {

    "code": "VALIDATION_ERROR",

    "message": "Human-readable message",

    "details": [{ "field": "email", "reason": "REQUIRED" }]

  },

  "meta": { "requestId": "req_xxx" }

}

\`\`\`



Always check \`success\`, then read \`data\` or \`error\`.



\### Common error codes



\| Code | HTTP | When |

\|------|------|------|

\| \`VALIDATION_ERROR\` | 400 | Bad / missing fields (\`error.details\`) |

\| \`OTP_INVALID\` | 400 | Wrong OTP code |

\| \`OTP_EXPIRED\` | 400 | OTP expired — request a new one |

\| \`UNAUTHENTICATED\` | 401 | Missing / invalid / expired access token → refresh |

\| \`FORBIDDEN\` | 403 | Not allowed |

\| \`ACCOUNT_INELIGIBLE\` | 403 | Suspended / banned / deleted account |

\| \`USER_BLOCKED\` | 403 | Block relationship blocks the action |

\| \`MATCH_REQUIRED\` | 403 | Match / conversation no longer valid |

\| \`SUBSCRIPTION_REQUIRED\` | 403 | Plus / premium feature |

\| \`NOT_FOUND\` | 404 | Missing resource (or hidden) |

\| \`CONFLICT\` | 409 | Duplicate action / idempotency mismatch |

\| \`MEDIA_REJECTED\` | 422 | Photo rejected |

\| \`RATE_LIMITED\` | 429 | Too many requests — respect \`Retry-After\` |

\| \`SERVER_ERROR\` | 500 | Unexpected server failure |

\| \`FEATURE_NOT_CONFIGURED\` | 501 | Social login, real SMS, IAP verify/restore (not wired yet) |



\### Pagination



List endpoints accept:



\| Query | Default | Notes |

\|-------|---------|-------|

\| \`cursor\` | — | Opaque string from previous page (\`nextCursor\`) |

\| \`limit\` | \`20\` | Max \`50\` (messages default \`50\`) |



Example: \`GET /conversations?limit=20&cursor=eyJ...\`



\### Uploaded files



Images uploaded via \`/media/upload\` are served under:



\`\`\`

https\://figure-cancel-snowiness.ngrok-free.dev/uploads/...

\`\`\`



(or \`{HOST}/uploads/...\` for local). Use the URL returned in the upload response when showing images — with ngrok that host should already match \`APP_URL\`.



\### Idempotency



For \`POST /swipes\` and \`POST /conversations/:id/messages\`:



1\. Generate a UUID on the client.

2\. Send it as header \`Idempotency-Key\`.

3\. For messages, body \`clientMessageId\` \*\*must equal\*\* that same UUID.

4\. Retries with the same key return the same successful response (safe for flaky networks).



\---



\## 2. Typical app flows



\### A. First-time OTP user



1\. \`POST /auth/otp/request\` with E.164 phone number  

2\. User enters 6-digit code → \`POST /auth/otp/verify\` (dev: use \`123456\`)  

3\. Save \`accessToken\` + \`refreshToken\`  

4\. Upload 2–6 photos → \`POST /media/upload\` (\`purpose=PROFILE_PHOTO\`)  

5\. \`POST /profile/onboarding\` with profile + \`photoMediaIds\`  

6\. \`GET /discovery\` → swipe deck  

7\. On match → \`GET /conversations\` → chat (+ Socket.IO for live updates)



\### B. Email register / login



1\. \`POST /auth/register\` (new) or \`POST /auth/login\` (existing)  

2\. Same onboarding / discovery flow as above if profile incomplete



\### C. Returning user



1\. Use stored \`accessToken\`  

2\. If expired → \`POST /auth/token/refresh\`  

3\. \`GET /profile/me\`, \`GET /discovery\`, \`GET /matches\`, \`GET /conversations\`



\### D. Send a chat message



1\. Ensure conversation exists (after a match)  

2\. Optional: upload attachment → \`POST /media/upload\` (\`purpose=CHAT_ATTACHMENT\`)  

3\. \`POST /conversations/:conversationId/messages\` with \`Idempotency-Key\` = \`clientMessageId\`



\### E. Purchase Plus (when stores are wired)



1\. \`GET /subscriptions/products\` for paywall UI  

2\. Complete App Store / Play purchase in the app  

3\. \`POST /subscriptions/verify\` with store proof  

4\. \`GET /subscriptions/entitlement\` to refresh features  



\> Note: verify/restore currently return \*\*501\*\* until store verification is configured on the server.



\---



\## 3. Health



\### \`GET /health\`



Public. No auth.



\- \`200\` — API and MongoDB are up  

\- \`503\` — database problem  



Use for uptime checks / splash “is backend reachable?”.



\---



\## 4. Auth



\### \`POST /auth/otp/request\`



Public. Starts a phone OTP session.



\*\*Rate limits:\*\* 3 per phone / 10 min · 20 per IP / hour · resend cooldown \~30s



\`\`\`json

{ "phoneNumber": "+919876543210" }

\`\`\`



\`phoneNumber\` must be E.164 (include country code).



\> \*\*Current backend (dev / testing):\*\* \`OTP_MODE=fixed\`. No SMS is sent. After a successful request, verify with code \*\*\`123456\`\*\* (see \`FIXED_OTP\` in \`backend/.env\`). When \`OTP_MODE=sms\` is enabled later, a real provider will send the code; until then SMS mode returns \`FEATURE_NOT_CONFIGURED\`.



The response never returns the OTP code and does not reveal whether the number is already registered.



\---



\### \`POST /auth/otp/verify\`



Public. Verifies the code and returns tokens (\`accessToken\`, \`refreshToken\`, user summary).



\*\*Rate limit:\*\* 10 per phone / 10 min · max 5 wrong attempts per session



\`\`\`json

{

  "phoneNumber": "+919876543210",

  "code": "123456"

}

\`\`\`



\---



\### \`POST /auth/token/refresh\`



Public. Rotates refresh token and issues a new access token.



\*\*Rate limit:\*\* 60 per IP / 10 min



\`\`\`json

{ "refreshToken": "..." }

\`\`\`



Replace both tokens in storage after success.



\---



\### \`POST /auth/logout\`



Auth required. Revokes one refresh-token session.



\`\`\`json

{ "refreshToken": "..." }

\`\`\`



\---



\### \`POST /auth/logout-all\`



Auth required. Signs out every device (tokens, push devices, sockets).



Call when the user chooses “Log out everywhere”.



\---



\### \`POST /auth/register\`



Public. Create email/password account.



\*\*Rate limit:\*\* 10 per IP / hour



\`\`\`json

{

  "email": "user\@example.com",

  "password": "at-least-10-chars",

  "displayName": "Alex",

  "dateOfBirth": "1998-05-12",

  "acceptedTermsVersion": "1.0"

}

\`\`\`



\| Field | Rules |

\|-------|--------|

\| \`password\` | 10–128 characters |

\| \`displayName\` | 1–40 characters |

\| \`dateOfBirth\` | ISO date \`YYYY-MM-DD\` |



\---



\### \`POST /auth/login\`



Public. Email/password sign-in for \*\*members\*\*.



\*\*Rate limits:\*\* 10 per email / 15 min · 100 per IP / hour



\`\`\`json

{

  "email": "user\@example.com",

  "password": "..."

}

\`\`\`



\> Staff accounts may also use this route for the admin panel. If the server ever returns a 2FA challenge (\`pendingToken\`), that flow is \*\*admin-only\*\* (\`POST /auth/login/2fa\`) — the member app should not implement it.



\---



\### \`POST /auth/social/:provider\`



Public. \`:provider\` = \`apple\` | \`google\`.



\*\*Rate limit:\*\* 20 per IP / hour



\`\`\`json

{

  "idToken": "...",

  "nonce": "optional"

}

\`\`\`



\> \*\*Not configured yet.\*\* Valid requests return error code \`FEATURE_NOT_CONFIGURED\`. Do not rely on this in production until the backend is wired to Apple/Google.



\---



\## 5. Profile



All routes in this section require auth unless noted.



\### \`GET /profile/me\`



Returns the signed-in member’s full profile (for edit screens, completeness checks).



\---



\### \`PATCH /profile/me\`



Partial update. Send \*\*at least one\*\* of: \`displayName\`, \`bio\`, \`interests\`, \`city\`, \`occupation\`.



\*\*Rate limit:\*\* 30 per hour



\`\`\`json

{

  "displayName": "Alex",

  "bio": "Hello",

  "interests": ["int_hiking", "int_coffee"],

  "city": "Mumbai",

  "occupation": "Designer"

}

\`\`\`



To clear optional text (\`bio\`, \`city\`, \`occupation\`), send \`""\` or \`null\`.



\---



\### \`POST /profile/onboarding\`



Creates the dating profile \*\*once\*\* after first sign-in. Call only when the user has no profile yet.



\*\*Rate limit:\*\* 10 per hour



\`\`\`json

{

  "displayName": "Alex",

  "dateOfBirth": "1998-05-12",

  "gender": "WOMAN",

  "showGender": false,

  "showMe": "MEN",

  "maxDistanceKm": 50,

  "relationshipGoal": "LONG_TERM",

  "interestIds": ["int_hiking", "int_coffee"],

  "photoMediaIds": ["med_xxx", "med_yyy"],

  "basics": { "drinking": "SOBER" },

  "bio": "Optional bio",

  "prompt": { "promptId": "SOME_PROMPT_ID", "answer": "My answer" },

  "location": { "latitude": 19.07, "longitude": 72.87 },

  "acceptedTermsVersion": "1.0"

}

\`\`\`



\*\*Enums\*\*



\| Field | Values |

\|-------|--------|

\| \`gender\` | \`WOMAN\`, \`MAN\`, \`NON_BINARY\` |

\| \`showMe\` | \`WOMEN\`, \`MEN\`, \`EVERYONE\` |

\| \`relationshipGoal\` | \`LONG_TERM\`, \`LONG_TERM_OPEN_TO_SHORT\`, \`SHORT_TERM_OPEN_TO_LONG\`, \`SHORT_TERM_FUN\`, \`NEW_FRIENDS\`, \`STILL_FIGURING_OUT\` |



\| Field | Rules |

\|-------|--------|

\| \`interestIds\` | 1–10 unique ids (from \`GET /interests\`) |

\| \`photoMediaIds\` | 2–6 unique media ids from prior uploads |

\| \`maxDistanceKm\` | 1–500 |

\| \`bio\` | optional, max 500 |

\| \`prompt.answer\` | 1–150 characters |

\| \`basics\` keys | pattern \`[a-z][a-zA-Z0-9\_]{0,39}\` |

\| \`basics\` values | pattern \`[A-Z][A-Z0-9\_]{0,39}\` |



Upload photos \*\*before\*\* onboarding, then pass their \`mediaId\`s in \`photoMediaIds\`.



\---



\### \`PUT /profile/preferences\`



Replace discovery filters used by the swipe deck.



\*\*Rate limit:\*\* 30 per hour



\`\`\`json

{

  "minAge": 21,

  "maxAge": 35,

  "maxDistanceKm": 50,

  "showMe": "EVERYONE"

}

\`\`\`



\`minAge\` / \`maxAge\`: 18–99, and \`minAge ≤ maxAge\`.



\---



\### \`PUT /profile/interests\`



\`\`\`json

{ "interestIds": ["int_hiking", "int_music"] }

\`\`\`



1–10 unique ids. \*\*Rate limit:\*\* 30 per hour.



\---



\### \`POST /profile/photos\`



Attach an already-uploaded media item as a profile photo.



\*\*Rate limit:\*\* 30 per hour



\`\`\`json

{ "mediaId": "med_xxx" }

\`\`\`



\---



\### \`PATCH /profile/photos/order\`



\`\`\`json

{ "photoIds": ["pho_1", "pho_2", "pho_3"] }

\`\`\`



1–6 unique photo ids in the new display order. \*\*Rate limit:\*\* 30 per hour.



\---



\### \`DELETE /profile/photos/:photoId\`



Removes the photo and its file. \*\*Rate limit:\*\* 30 per hour.



\---



\### \`POST /profile/verification\`



Submit a selfie for verification review. Daily limit comes from server settings.



\`\`\`json

{ "selfieMediaId": "med_xxx" }

\`\`\`



Upload the selfie first with \`purpose=VERIFICATION_SELFIE\`.



\---



\### \`GET /profiles/:userId\`



Another member’s \*\*public\*\* profile (e.g. from discovery or a match).



\---



\### \`GET /interests\`



Interest catalogue. Use these ids in onboarding / interest updates.



\---



\## 6. Media



\### \`POST /media/upload\`



Auth required. Multipart image upload (stored locally by the backend).



\*\*Content-Type:\*\* \`multipart/form-data\`  

\*\*Rate limit:\*\* 30 per hour



\| Form field | Required | Values |

\|------------|----------|--------|

\| \`file\` | Yes | Image file |

\| \`purpose\` | Yes | \`PROFILE_PHOTO\`, \`VERIFICATION_SELFIE\`, \`CHAT_ATTACHMENT\` |



Response includes \`mediaId\` and a URL under \`/uploads/...\`.



\*\*How to use\*\*



1\. Upload with the correct \`purpose\`.  

2\. Keep \`mediaId\`.  

3\. Attach via onboarding, \`/profile/photos\`, verification, or chat message.



\---



\### \`GET /media/:mediaId\`



Auth required. Metadata for a media item (owner or authorised viewer).



\---



\## 7. Discovery, swipes, likes, matches



\### \`GET /discovery\`



Auth required. Candidate cards for the swipe deck.



\| Query | Rules |

\|-------|--------|

\| \`minAge\` | 18–99 (optional override) |

\| \`maxAge\` | 18–99, ≥ \`minAge\` |

\| \`distanceKm\` | 1–500 |



\---



\### \`POST /swipes\`



Auth required. Like, pass, or super-like someone.



\*\*Headers:\*\* \`Idempotency-Key: \<uuid>\`  

\*\*Rate limit:\*\* 120 per minute



\`\`\`json

{

  "targetUserId": "usr_xxx",

  "action": "LIKE"

}

\`\`\`



\`action\`: \`LIKE\` | \`PASS\` | \`SUPER_LIKE\`



On mutual like, the response / subsequent match list will reflect a new match. Free accounts may hit a daily like / super-like cap (server settings).



\---



\### \`POST /swipes/undo\`



Auth required. Undo the last swipe. \*\*Premium (Plus) feature.\*\*  

\*\*Rate limit:\*\* 120 per minute.



\---



\### \`GET /likes/received\`



Auth required. Who liked you. \*\*Full list is premium\*\*; free users typically get only a count.



\---



\### \`GET /likes/sent\`



Auth required. Your pending outgoing likes.



\---



\### \`GET /matches\`



Auth required. Active matches, newest first (paginated).



\---



\### \`GET /matches/:matchId\`



Auth required. One match (participants only).



\---



\### \`POST /matches/:matchId/unmatch\`



Auth required. End a match (and related conversation access rules apply on the server).



\---



\## 8. Chat



\### \`GET /conversations\`



Auth required. Open conversations, most recent activity first (paginated).



\---



\### \`GET /conversations/:conversationId\`



Auth required. Conversation header (participants, match link, etc.).



\---



\### \`GET /conversations/:conversationId/messages\`



Auth required. Message history. Default \`limit=50\`, max \`50\`. Use \`cursor\` for older pages.



\---



\### \`POST /conversations/:conversationId/messages\`



Auth required. Send a text and/or attachment message.



\*\*Headers:\*\* \`Idempotency-Key\` \*\*must equal\*\* \`clientMessageId\` (UUID)  

\*\*Rate limits:\*\* 30/min per conversation · 300/hour per user



\`\`\`json

{

  "text": "Hello!",

  "attachmentMediaId": "med_xxx",

  "clientMessageId": "550e8400-e29b-41d4-a716-446655440000"

}

\`\`\`



Rules:



\- Provide \`text\` (1–1000 after trim), \`attachmentMediaId\`, or both.  

\- Generate \`clientMessageId\` once per logical message; reuse on retry with the same \`Idempotency-Key\`.



\---



\### \`POST /messages/:messageId/read\`



Auth required. Marks this message and all earlier ones in the thread as read.



\---



\### \`POST /messages/:messageId/report\`



Auth required. Report a received message. Shares the \*\*20 reports/day\*\* quota with \`/reports\`.



\`\`\`json

{

  "reason": "HARASSMENT",

  "details": "optional, max 1000",

  "alsoBlock": true

}

\`\`\`



\`alsoBlock\` defaults to \`true\`.



\*\*Report reasons:\*\*  

\`FAKE_PROFILE\`, \`INAPPROPRIATE_PHOTOS\`, \`HARASSMENT\`, \`SPAM_OR_SCAM\`, \`UNDERAGE\`, \`OFFLINE_BEHAVIOUR\`, \`OTHER\`



\---



\## 9. Safety



\### \`POST /users/:userId/block\`



Auth required. Block a member (idempotent — safe to call more than once).



\---



\### \`DELETE /users/:userId/block\`



Auth required. Unblock a member.



\---



\### \`GET /blocks\`



Auth required. List of members you have blocked.



\---



\### \`POST /reports\`



Auth required. Report a user or photo. \*\*20 per day.\*\*



\`\`\`json

{

  "targetType": "USER",

  "targetId": "usr_xxx",

  "reason": "FAKE_PROFILE",

  "details": "optional",

  "alsoBlock": true

}

\`\`\`



\`targetType\`: \`USER\` | \`PHOTO\`  

\`alsoBlock\` defaults to \`true\`.



\---



\## 10. Devices & notifications



\### \`POST /devices\`



Auth required. Register a push token (or move an existing token to this user).



\`\`\`json

{

  "platform": "IOS",

  "pushToken": "...",

  "appVersion": "1.0.0",

  "locale": "en-IN"

}

\`\`\`



\`platform\`: \`IOS\` | \`ANDROID\`  

Call after login and whenever the OS push token refreshes.



\---



\### \`DELETE /devices/:deviceId\`



Auth required. Stop push notifications for that device (e.g. on logout of this device).



\---



\### \`GET /notifications\`



Auth required. In-app notification inbox, newest first.



\---



\### \`POST /notifications/:notificationId/read\`



Auth required. Mark one notification as read.



\---



\### \`GET /notification-preferences\`



Auth required. Current notification toggles.



\---



\### \`PATCH /notification-preferences\`



Auth required. Partial update — send at least one field:



\`\`\`json

{

  "newMatches": true,

  "messages": true,

  "likes": false,

  "promotions": false

}

\`\`\`



\---



\## 11. Subscriptions



All require auth.



\### \`GET /subscriptions/products\`



Paywall catalogue for UI (titles, descriptions, display price labels).  

Known product ids: \`dc_plus_monthly\`, \`dc_plus_yearly\`.  

Real price/currency still come from App Store / Play Billing.



\---



\### \`GET /subscriptions/entitlement\`



Current subscription tier / feature entitlement for the signed-in member.  

Call after login and after a successful purchase/restore.



\---



\### \`POST /subscriptions/verify\`



Submit a store purchase for server verification.



\*\*Rate limit:\*\* 20 per hour  



\`\`\`json

{

  "platform": "IOS",

  "productId": "dc_plus_monthly",

  "transactionProof": "..."

}

\`\`\`



\> Currently returns \*\*501\*\* until Apple/Google verification is configured on the server. Request shape is already validated.



\---



\### \`POST /subscriptions/restore\`



Restore previous purchases.



\*\*Rate limit:\*\* 10 per hour  



\`\`\`json

{

  "platform": "ANDROID",

  "transactionProofs": ["proof1", "proof2"]

}

\`\`\`



\`transactionProofs\`: 1–20 non-empty strings.  

\> Also returns \*\*501\*\* until store verification is configured.



\---



\## 12. Support & account



\### \`GET /support/faqs\`



Public. FAQ list for Help screens.



\---



\### \`POST /support/tickets\`



Auth required. Open a support ticket. \*\*5 per day.\*\*



\`\`\`json

{

  "category": "ACCOUNT",

  "subject": "Cannot sign in",

  "message": "Detailed description of the issue..."

}

\`\`\`



\| Field | Rules |

\|-------|--------|

\| \`category\` | \`ACCOUNT\`, \`BILLING\`, \`SAFETY\`, \`BUG\`, \`OTHER\` |

\| \`subject\` | 3–120 characters |

\| \`message\` | 10–5000 characters |



\---



\### \`GET /support/tickets/:ticketId\`



Auth required. Fetch one of \*\*your\*\* tickets (status + messages).



\---



\### \`POST /account/deletion-request\`



Auth required. Schedule account deletion. Returns \*\*202 Accepted\*\*.



\`\`\`json

{

  "confirm": true,

  "reason": "optional, max 100",

  "feedback": "optional, max 1000"

}

\`\`\`



\`confirm\` \*\*must\*\* be boolean \`true\`.



\---



\### \`GET /account/export-status\`



Auth required. Status of the member’s data-export request / job.



\---



\## 13. Socket.IO (realtime)



Use this for live chat / match updates. REST remains the source of truth; reconnect and refetch lists if needed.



\| | |

\|--|--|

\| URL | Same host as API, namespace \*\*\`/v1\`\*\* |

\| Transport | \*\*WebSocket only\*\* (\`transports: ['websocket']\`) |

\| Auth | Handshake \`auth: { token: "\<accessToken>" }\` |



\*\*Client → server\*\*



\| Event | Payload | Notes |

\|-------|---------|--------|

\| \`typing\` | \`{ conversationId, isTyping }\` | Relayed to the other participant; \~3s throttle |

\| \`message:read\` | \`{ conversationId, upToMessageId }\` | Marks read up to that message |



Acks look like \`{ ok: true }\` or \`{ ok: false, error: { code, message } }\`.



\*\*Server → client\*\* (examples)



\| Event | Meaning |

\|-------|---------|

\| \`message:new\` | New chat message |

\| \`message:read\` | Read receipt update |

\| \`typing\` | Other user typing |

\| \`match:new\` | New match |

\| \`match:removed\` | Unmatch / match ended |

\| \`entitlement:updated\` | Subscription tier changed |

\| \`session:expired\` | Access token expired — refresh REST token, reconnect socket |



\---



\## 14. Quick reference table



\| Method | Path | Auth | Notes |

\|--------|------|------|-------|

\| GET | \`/health\` | No | Health check |

\| POST | \`/auth/otp/request\` | No | Start OTP |

\| POST | \`/auth/otp/verify\` | No | OTP → tokens |

\| POST | \`/auth/token/refresh\` | No | Refresh tokens |

\| POST | \`/auth/logout\` | Yes | One session |

\| POST | \`/auth/logout-all\` | Yes | All devices |

\| POST | \`/auth/register\` | No | Email signup |

\| POST | \`/auth/login\` | No | Email login |

\| POST | \`/auth/social/:provider\` | No | Apple/Google (not configured) |

\| GET | \`/profile/me\` | Yes | Own profile |

\| PATCH | \`/profile/me\` | Yes | Edit profile |

\| POST | \`/profile/onboarding\` | Yes | Create profile |

\| PUT | \`/profile/preferences\` | Yes | Discovery prefs |

\| PUT | \`/profile/interests\` | Yes | Replace interests |

\| POST | \`/profile/photos\` | Yes | Attach photo |

\| PATCH | \`/profile/photos/order\` | Yes | Reorder photos |

\| DELETE | \`/profile/photos/:photoId\` | Yes | Delete photo |

\| POST | \`/profile/verification\` | Yes | Submit selfie |

\| GET | \`/profiles/:userId\` | Yes | Public profile |

\| GET | \`/interests\` | Yes | Interest list |

\| POST | \`/media/upload\` | Yes | Multipart upload |

\| GET | \`/media/:mediaId\` | Yes | Media metadata |

\| GET | \`/discovery\` | Yes | Swipe deck |

\| POST | \`/swipes\` | Yes | Idempotent swipe |

\| POST | \`/swipes/undo\` | Yes | Premium undo |

\| GET | \`/likes/received\` | Yes | Incoming likes |

\| GET | \`/likes/sent\` | Yes | Outgoing likes |

\| GET | \`/matches\` | Yes | Match list |

\| GET | \`/matches/:matchId\` | Yes | One match |

\| POST | \`/matches/:matchId/unmatch\` | Yes | Unmatch |

\| GET | \`/conversations\` | Yes | Chat list |

\| GET | \`/conversations/:id\` | Yes | Conversation |

\| GET | \`/conversations/:id/messages\` | Yes | History |

\| POST | \`/conversations/:id/messages\` | Yes | Send (idempotent) |

\| POST | \`/messages/:id/read\` | Yes | Mark read |

\| POST | \`/messages/:id/report\` | Yes | Report message |

\| POST | \`/users/:userId/block\` | Yes | Block |

\| DELETE | \`/users/:userId/block\` | Yes | Unblock |

\| GET | \`/blocks\` | Yes | Block list |

\| POST | \`/reports\` | Yes | Report user/photo |

\| POST | \`/devices\` | Yes | Register push |

\| DELETE | \`/devices/:deviceId\` | Yes | Remove device |

\| GET | \`/notifications\` | Yes | Inbox |

\| POST | \`/notifications/:id/read\` | Yes | Mark read |

\| GET | \`/notification-preferences\` | Yes | Get prefs |

\| PATCH | \`/notification-preferences\` | Yes | Update prefs |

\| GET | \`/subscriptions/products\` | Yes | Paywall |

\| GET | \`/subscriptions/entitlement\` | Yes | Tier |

\| POST | \`/subscriptions/verify\` | Yes | 501 until configured |

\| POST | \`/subscriptions/restore\` | Yes | 501 until configured |

\| GET | \`/support/faqs\` | No | FAQs |

\| POST | \`/support/tickets\` | Yes | New ticket |

\| GET | \`/support/tickets/:ticketId\` | Yes | Ticket detail |

\| POST | \`/account/deletion-request\` | Yes | Delete account (202) |

\| GET | \`/account/export-status\` | Yes | Export status |



\---



\## 15. Mobile client checklist



\- [ ] Base URL = ngrok (device) or \`http\://127.0.0.1:5050\` (simulator on same machine)  

\- [ ] Persist \`accessToken\` + \`refreshToken\` securely  

\- [ ] Attach \`Authorization: Bearer \<accessToken>\` on every protected call  

\- [ ] On \`401\` / \`UNAUTHENTICATED\` → \`POST /auth/token/refresh\`, store new tokens, retry once  

\- [ ] OTP: E.164 phone; in current fixed mode use code \`123456\` after \`/auth/otp/request\`  

\- [ ] Upload via \`POST /media/upload\` before referencing any \`mediaId\`  

\- [ ] \`Idempotency-Key\` (UUID) on \`POST /swipes\` and send-message; body \`clientMessageId\` = same UUID  

\- [ ] Register \`POST /devices\` after login for push  

\- [ ] Socket.IO namespace \`/v1\` with \`auth.token\` = access token; handle \`session:expired\`  

\- [ ] Handle \`RATE_LIMITED\` (\`Retry-After\`) and \`FEATURE_NOT_CONFIGURED\` (social / IAP / real SMS)  

\- [ ] Do \*\*not\*\* call \`/admin/\*\` or \`/auth/login/2fa\` from the member app  



\---



*\*Member API contract for the mobile app. Generated from backend routes and validators. Admin APIs are intentionally omitted.\**
