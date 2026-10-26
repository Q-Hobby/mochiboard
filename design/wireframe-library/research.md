# Wireframe library research — common flow skeletons

**Source:** Mobbin MCP (`search_flows`, `search_screens`) worked. 21 searches, iOS + web, October 2026. Everything below is pattern-level: screens in order, sections top to bottom, where the button sits. No layouts, copy or art were copied; app names appear only as inspiration credits. Templates get drawn fresh in Mochiboard's gray pieces (nav bar, tab bar, button, input, search, card, list row, toggle, checkbox, avatar, image spot, heading, text).

**Reading key:** `[Primary]` = the one big button. `(secondary)` = text link or ghost button. Screens are listed in order.

---

## 1. Onboarding (first run)

### Common skeleton (mobile)
1. **Splash** — logo centred on brand colour. Nothing else.
2. **Welcome / value carousel** — image spot top 60%, heading, one line of text, dot indicator, `[Get started]` + (Log in) + (Continue as guest) stacked at bottom. 3–5 cards swipe horizontally; only the last needs a button.
3. **Personalisation questions** (1–4 screens) — back arrow + thin progress bar at top (or "1/8" counter + line), question as heading, one-line subhead, optional "How do I find this?" help link, then 3–5 tall radio cards (icon + bold label + muted description). `[Continue]` pinned at the bottom, disabled until a pick is made.
4. **Permission pre-prompt** — full-bleed image spot, heading ("stay in the loop" tone), 2–3 benefit rows (icon + title + one line), reassurance line ("turn off anytime"), `[Turn on]` + (Not now). *Then* the OS dialog.
5. **Account gate** — heading, social buttons (icon pills or full width), "or" divider, `[Continue with email]`, (Existing user? Log in).
6. **Home with a first-task nudge** — the normal home screen with a banner, checklist card, or empty state pointing at the first action.

Progress: a thin bar at top with a back arrow is the near-universal mobile pattern; web uses dots, "Step 1 of 2" labels, or a sidebar checklist. Copy tone is warm and short: question headings, one-sentence subheads, no paragraphs.

### Common skeleton (web)
Landing → sign-up → **Create workspace** (logo upload + name) → **Create profile** (avatar + first/last name) → optional **"Tell us about you" survey modal** (role chips, company size, how you heard) → home with a quick-start checklist in the sidebar or a "create your first X" empty state. Each step is a single centred card (~420px) on a plain background, or a modal over the blurred app.

### Variants worth separate templates
- **Onboarding · Welcome carousel (mobile)** — Splash, 3 carousel cards, account gate. 5 screens. The simplest consumer first-run.
- **Onboarding · Personalisation quiz (mobile)** — Splash, 3 question screens with progress bar, "building your plan" loader, result/paywall, account gate. 7 screens. What makes it different: the account ask comes *after* the user has invested answers.
- **Onboarding · Permissions in context (mobile)** — Pre-prompt screen, OS dialog, success/home. 3 screens. Reusable for notifications, location, camera.
- **Onboarding · Workspace setup (web)** — Sign-up card, create workspace, create profile, survey modal, home with checklist. 5 screens.

### Mobile vs desktop
Mobile is one question per screen with the button pinned to the bottom edge. Desktop stacks several fields per card, puts Back/Next side by side under the form, and often fills the right half with an illustration. Desktop onboarding also happens *inside* the product (quick-start sidebar, checklist card, tooltips) rather than before it.

### Why notes
- **Ask permissions in context**, with your own pre-prompt first: the OS only lets you ask once, and a screen that explains the benefit gets a far higher "Allow" rate.
- **Progress bars reduce drop-off** because people finish things they can see the end of. Keep the bar thin and the step count honest.
- **Delay the account gate** when you can. Every quiz answer is a small investment that makes creating an account feel worth it.
- **One question per screen** on mobile. The keyboard eats half the screen; two inputs plus a button rarely fit.
- **Always offer "Skip" / "Maybe later"** on anything optional. Forced steps are where people quit.

Inspiration credits: Brilliant, Scoot, KOHO, Roku, IKEA, lululemon, Superpower, Twenty, Air, Mixpanel, Charma, Sana AI.

---

## 2. Registration / Sign up

### Common skeleton
1. **Chooser** — logo or short headline, social buttons first (Apple + Google on iOS; Google + Microsoft/GitHub on B2B web), "or" divider, `[Continue with email]`, terms line in small text, (Already have an account? Log in).
2. **Email form** — email, password (eye toggle, rule hint below: "8+ characters, 1 number"), optional first/last name, terms checkbox, `[Create account]`.
3. **Verify** — "We sent a code to …", 6-digit code input (single field or 6 boxes), `[Continue]`, (Resend in 29s), (Use a different email).
4. **Profile basics** — avatar upload spot, name, `[Continue]`.
5. **Landed** — home, often with an "verify your email" banner still showing at the top.

Primary button sits at the bottom on mobile, under the fields on desktop. Secondary actions: log-in link at the very bottom, "Change" next to the email you typed, terms as inline links. Tone: "Let's get started", "What's your name?" — friendly, one idea per screen.

### Variants worth separate templates
- **Sign up · Social-first (mobile)** — Chooser, email form, verify code, home. 4 screens.
- **Sign up · Email + password (web)** — Centred card with email, name, password + inline validation error state, terms checkbox; then verify banner on home. 3 screens (include the error state as its own screen).
- **Sign up · Phone + code (mobile)** — "What's your number?" with country picker and numeric keyboard, code entry, name screen, house-rules/consent screen, home. 5 screens. Different because there is no password at all.
- **Sign up · Invite-based B2B (web)** — Landing-free: "You've been invited to join [workspace]" card with `[Accept invite]`, set name + password, home. 3 screens.
- **Sign up · Long form (mobile)** — Single scrolling form (email, first, last, phone, birthday, password, confirm), `[Let's do this]` pinned. 2 screens. Worth having as the "what not to do unless you must" reference.

### Mobile vs desktop
Mobile splits every field onto its own screen; the keyboard is always up, so the button is either pinned above it or the keyboard's return key is the action. Desktop fits 3–5 fields in one card, shows validation inline under the field, and often shows the sign-up as a **modal over the landing page** so the marketing stays visible behind.

### Why notes
- **Social sign-in goes first** because one tap beats typing, and it gives you a verified email for free. Put Apple first on iOS (App Store rule when any social login is offered).
- **Email-first "Log in or sign up" combined forms** (one email field, then branch) remove the "do I already have an account?" question.
- **Show password rules before the error**, not after. A hint line under the field is cheaper than a red message.
- **Verify with a code, not a link**, on mobile: switching to the mail app and back loses people; a code can even autofill from SMS.
- **B2B invites skip the chooser entirely**: the workspace already exists, so the job is "accept" then "set your name".

Inspiration credits: Brilliant, CHOPT, Superpower, talabat, Tinder, Blue Apron, Air, Sentry, Vimeo, GetYourGuide, Twenty, Sana AI.

---

## 3. Login

### Common skeleton (mobile)
1. **Entry** — either a hero splash with `[Log in]` + (Create a free account), or a bottom sheet that slides up over the guest home with `[Create an account]` + (I already have one).
2. **Login sheet/screen** — heading "Sign in", email, password with Show toggle, `[Log in]`, (Forgot password?), "or" divider, social buttons full width, bottom link "New here? Create account".
3. **Second factor (when on)** — "Let's confirm it's you", 6-digit code, `[Continue]`, (Resend in 29s), (Enter password instead) — this last link is how passwordless-first apps keep a fallback.
4. **Home**, logged in: avatar in the nav, greeting with name.

### Common skeleton (desktop)
A **split screen**: form column on one side (narrow, ~400px: logo, heading, email, password + eye, Remember me checkbox + Forgot password? on one row, `[Log in]`, "or", Google, SSO link, terms line) and a brand image or marketing panel on the other. Error states show as a red inline line under the fields or a banner across the top. Some products use a **centred modal over the app** instead of a page.

### Variants worth separate templates
- **Login · Email + password (mobile)** — Entry, login screen, error state, home. 4 screens.
- **Login · Split screen (web)** — Login page, error state, home. 3 screens.
- **Login · Passwordless / magic code** — Email only, "check your inbox" screen with code field + "enter password instead", home. 3 screens.
- **Login · Forgot password (mobile)** — Login, "Enter the email you used", "We sent a reset email" confirmation modal with (Back to sign in) + (Resend), code entry, "Choose a new password" with rules, success. 6 screens.
- **Login · 2FA setup (web)** — Security settings page with a 2FA row (Off), QR code screen with "can't scan? copy key" + 6 code boxes + `[Save]`, settings page showing Active + success toast. 3 screens.

### Mobile vs desktop
Mobile login is almost always a **sheet** over something (the guest home or a hero), with full-width stacked social buttons. Desktop puts social *first or last* depending on audience (Google-first for prosumer, SSO link at the bottom for B2B), adds Remember me, and uses a split or modal layout. Recovery is email-link on desktop, code on mobile.

### Why notes
- **"Forgot password?" sits next to the password field**, where the person is when they realise they forgot it.
- **Never say which part was wrong** ("email or password does not match") — it is a security leak and the pattern is universal.
- **Passwordless with a password fallback** is becoming the default: code first, "use password instead" as a quiet link.
- **Remember me is a desktop thing**; mobile stays logged in by default.
- **2FA lives in Settings → Security**, never in onboarding, and always ends with a visible "Active" state and a toast.

Inspiration credits: Insight Timer, Fiverr, Mindvalley, Expedia, BlaBlaCar, Tripadvisor, Oyster, Buffer, Optimal Workshop, Amie, Twenty, Square, Docusign.

---

## 4. Checkout

### Common skeleton
1. **Cart / Bag** — item count, item rows (image spot, title, variant line, price, qty stepper or dropdown, Remove/Save for later), promo banner optional, bottom bar with Total + `[Checkout]`. Express buttons (PayPal / Apple Pay / Shop Pay) directly under or above the main button. Empty state: icon, "Your cart is empty", one line, `[Start shopping]`.
2. **Contact / Delivery** — email (or logged-in identity row with "Change"), address form with autocomplete suggestions, shipping-method radio list with price and ETA, `[Continue to payment]`.
3. **Payment** — payment-method tabs or radios (Card / Apple Pay / PayPal / Klarna), card number + expiry + CVC + name, "billing same as shipping" checkbox, promo code field with Apply, `[Pay $18.47]` — the amount lives in the button.
4. **Review** (multi-step only) — read-only stack: items, shipping, payment, billing, promo, totals, terms line, `[Place order]`.
5. **Processing** — spinner + "Your order is being processed".
6. **Confirmation** — big checkmark, order number, delivery ETA + progress tracker (4 dots), receipt accordion, "need help?" row, cross-sell or referral card, `[Continue shopping]`.

Progress indicator: a 3-step stepper under the title ("1 Cart · 2 Delivery · 3 Payment") on multi-step mobile; web uses a breadcrumb or nothing. Copy tone is trust-heavy and literal: "Checkout securely", "All transactions are encrypted", "Free returns".

### Variants worth separate templates
- **Checkout · One page (web)** — Cart, single checkout page (form left, summary right), confirmation. 3 screens. Shopify-style.
- **Checkout · 3 steps (mobile)** — Cart, delivery, payment, review, confirmation. 5 screens, stepper on each.
- **Checkout · Express / one tap (mobile)** — Cart with Apple Pay as the primary, sheet with pay confirmation, done. 3 screens.
- **Checkout · Guest checkout (web)** — Email-first page with "Log in" link and "continue as guest" default, then the one-page flow, then "save your info / create an account" on the confirmation. 4 screens.
- **Checkout · Subscription / paywall checkout (mobile)** — Plan card, payment tabs, card fields, terms, `[Purchase]`, done. 3 screens.

### Mobile vs desktop
**Where the summary goes** is the big difference: desktop puts the order summary in a sticky right column (items, discount code, subtotal, shipping, tax, total) next to the form; mobile collapses it into a "Order summary ▾" accordion at the top or a bottom bar showing only the total, with the full list on the review screen. Desktop checkout is usually one long page; mobile is one step per screen with the stepper. Address entry on mobile is one field per keyboard; on desktop it's one card with autocomplete. Express pay buttons sit *above* the form on both.

### Why notes
- **Guest checkout matters** because forced registration is the number one reason carts get abandoned. Ask to save details *after* the order.
- **Put the total in the pay button** ("Pay $49.16") so there is no surprise on the last tap.
- **Keep the summary visible** (right column or accordion). People need to re-check what they are paying for before they commit.
- **Fewest fields wins**: autocomplete the address, default "billing same as shipping", remember payment.
- **The confirmation is a screen, not a toast**: order number, when it arrives, and what to do if something is wrong.

Inspiration credits: Depop, adidas, Everyday Rewards, Gymshark, lululemon, Shop, Instacart, Stripe, Superpower.

---

## 5. Briefly: the single-screen patterns

**Empty state.** Centred vertically: small icon or line illustration, bold one-line title ("No orders yet"), one muted line explaining what will appear ("Your orders will show up here"), and — only when there is something to do — one `[Primary]` button ("Start shopping", "Connect a channel", "Create your first project"). Inside web dashboards the same pattern shrinks to fit inside a card. Template: 1 mobile + 1 web-card version. *Credits: Neo Financial, Cash App, SHEIN, Shell, Fuse, Everyday Rewards, Buffer, Snowflake.*

**Settings / profile.** Mobile: nav bar with title and back/close, optional profile header (avatar, name, email, edit pencil), optional plan card ("Current plan · Manage"), then grouped list rows with section labels ("General", "Social", "About"). Row types: chevron (navigates), toggle (sounds, haptics), value (Language · English ▸). Bottom: Log out (red or muted), Legal, version number in grey. Desktop: left sub-nav column (Profile, Security, Billing, Members…) and a wide content pane with labelled sections, Save in the top right, and a red "Danger zone" at the end. Template: 1 mobile list + 1 web two-column. *Credits: Jomo, Brilliant, Jira Cloud, Amazon Alexa, timespent, Nike Run Club, Twenty, Square, Docusign.*

**Paywall / upgrade.** Close × top left, (Restore) top right. Hero image or app icon, headline, 4–5 feature rows with icons (or a plain list), plan selector as two side-by-side cards (Yearly with a "Save 37%" badge pre-selected, Monthly), `[Start free trial]` / `[Subscribe]`, then tiny "Cancel anytime · Terms · Privacy". Variants: trial timeline (Today / Day 5 reminder / Day 7 charged), "plan expired" soft wall, inline "out of credits" wall in a feed. Web version is a 3–4 column plan grid with the recommended column highlighted and "Contact sales" on the last. Template: 1 mobile paywall + 1 web pricing modal. *Credits: Bevel, BitePal, Joi, Savee, Perplexity, Insight Timer, Brilliant, Vimeo.*

**Search results.** Search bar at top with the query shown and a clear ×, back arrow, then a row of filter chips or tabs (All · Food · Groceries…), optional "About 1,000 results" count, then results either grouped by section with "See more" links (venues, people, events) or as a flat list of rows (thumbnail, title, subtitle, meta) with the matched term highlighted. Recent searches and suggestions appear in the same layout before you press return. Template: 1 mobile results + 1 "suggestions while typing" state. *Credits: talabat, Fresha, LinkedIn, Posh, PayPal, Substack.*

**Dashboard home (web).** Left sidebar: workspace switcher at the top, search, nav groups (Home, Projects, Reports…), a trial/upgrade box or setup-progress bar near the bottom, user avatar last. Main pane: greeting with name and date ("Good morning, Alex"), optional setup checklist or AI prompt bar, a row of 3–4 KPI tiles (big number, label, delta), then a two-column grid of cards (recent items, activity feed, "up next", resources), each with its own empty state. Template: 1 web dashboard + 1 mobile home (greeting, stat strip, cards, tab bar). *Credits: Mixpanel, Buffer, HoneyBook, Klaviyo, Shopify, Oyster, Sprig, Snowflake, Fiverr, Mindvalley.*

---

## Proposed library catalog

Format: **Category · Variant (platform)** — description — screens. Ordered by usefulness to someone starting out. ★ = build first (12).

1. ★ **Sign up · Social-first (mobile)** — chooser, email form, code, home — 4
2. ★ **Login · Email + password (mobile)** — entry, login sheet, error, home — 4
3. ★ **Onboarding · Welcome carousel (mobile)** — splash, 3 cards, account gate — 5
4. ★ **Checkout · 3 steps (mobile)** — cart, delivery, payment, review, confirmation — 5
5. ★ **Checkout · One page (web)** — cart, form + sticky summary, confirmation — 3
6. ★ **Login · Split screen (web)** — page, error, home — 3
7. ★ **Sign up · Email + password (web)** — card, inline error, verify banner — 3
8. ★ **Onboarding · Personalisation quiz (mobile)** — splash, 3 questions, loader, result, gate — 7
9. ★ **Dashboard · Home (web)** — sidebar + greeting + KPIs + cards — 1
10. ★ **Settings · List (mobile)** — profile header, grouped rows, log out — 1
11. ★ **Empty state · Mobile + card (both)** — icon, title, line, CTA — 2
12. ★ **Login · Forgot password (mobile)** — login, email, sent modal, code, new password, done — 6
13. **Paywall · Plan cards (mobile)** — features, yearly/monthly, trial button — 1
14. **Onboarding · Permissions in context (mobile)** — pre-prompt, OS dialog, home — 3
15. **Sign up · Phone + code (mobile)** — number, code, name, rules, home — 5
16. **Onboarding · Workspace setup (web)** — sign-up, workspace, profile, survey, checklist home — 5
17. **Search · Results (mobile)** — suggestions state, results with chips — 2
18. **Checkout · Guest (web)** — email-first, one page, confirmation, save-details — 4
19. **Checkout · Express / Apple Pay (mobile)** — cart, pay sheet, done — 3
20. **Login · Passwordless code (both)** — email, code with password fallback, home — 3
21. **Settings · Two-column (web)** — sub-nav, sections, danger zone — 1
22. **Sign up · Invite-based B2B (web)** — accept invite, set profile, home — 3
23. **Paywall · Pricing grid (web)** — 3–4 plan columns, recommended highlight — 1
24. **Login · 2FA setup (web)** — security page, QR + code, active + toast — 3
25. **Dashboard · Home (mobile)** — greeting, stat strip, cards, tab bar — 1
26. **Checkout · Cart states (mobile)** — filled cart, empty cart, saved-for-later — 3
27. **Onboarding · Quick-start checklist (web)** — sidebar checklist + 3 step panels — 4
28. **Checkout · Subscription purchase (mobile)** — plan, payment tabs, done — 3
29. **Paywall · Trial timeline (mobile)** — today / reminder / charge timeline — 1
30. **Checkout · Order confirmation + tracking (both)** — tracker, receipt, help — 2
31. **Login · Modal over app (web)** — login modal on blurred app, home — 2
32. **Search · Grouped results (mobile)** — sections with "See more" — 1
33. **Sign up · Long single form (mobile)** — the "only if you must" reference — 2
34. **Settings · Profile edit (mobile)** — avatar, fields, save — 2
35. **Onboarding · Consent / data choices (mobile)** — toggle list, accept — 1
36. **Empty state · Error / offline (both)** — same shape, retry button — 2

First-build order rationale: the 12 starred cover the four flows the brief asked for on both platforms, plus the three one-screen patterns (dashboard, settings, empty state) that every project needs on day one. Everything after 12 is a variant of something already in the set, so it can be duplicated and edited from a starred template rather than drawn from zero.
