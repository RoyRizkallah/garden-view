# Garden View Platform — Full Project Specification

Status: Phase 1 underway — payment received, build starting from scratch (no code reused from the prototype). Floor plans and video assets are not yet in hand but are expected soon (see Section 5); Phase 1 scope below assumes they arrive before the rest of the phase wraps. This is the blueprint to build the real system from — not the prototype itself. The clickable HTML prototype (`Garden View Platform.html`) demonstrates every feature below with mock/seeded data and no real backend; this document describes what turns it into a real, secure, production system.

---

## 1. Vision

A single platform for one residential building (Garden View — 41 registered units across 3 blocks, Beirut Central District) serving three audiences:

- **Visitors** — the public, browsing the building and available units, with no account.
- **Residents (owners)** — each with their own account, tied to their real unit — tracking what they owe, what's being built/fixed, and voting on building decisions.
- **Staff** — an Accountant (financial bookkeeping) and an Admin (everything else: listings, projects, votes, requests), both internal roles, not residents.

The platform replaces scattered WhatsApp groups, spreadsheets, and word-of-mouth with one system, and adds an AI assistant that can answer questions about any of it in plain language.

## 2. Users & Roles

| Role | Who | Access |
|---|---|---|
| Visitor | General public | Public site only: gallery, available units, building facts, contact form. No personal data. |
| Resident | One of the 41 real unit owners | Their own dashboard: balance, project progress, voting, amenity booking, maintenance/renovation requests, shared documents. Sees other units only by number, never other owners' contact info. |
| Accountant | Building bookkeeper | Monthly dues ledger, building expenses, collection reporting, full owner directory (for billing contact only). No access to listings, votes, or maintenance decisions. |
| Admin | Building management | Everything: listings, project progress, votes, all maintenance/renovation requests, inquiries, full owner directory. |

Real per-resident login (not today's "pick your unit, no password" demo shortcut) is required before this touches real residents. See Section 6.

## 3. Feature Specification

### 3.1 Public Site
- Hero, photo gallery, and building facts (41 units, 3 blocks, floors) — sourced from real data, not fabricated.
- Available residences for sale/rent (a curated subset, not the full 41-unit owner roster — most buildings don't publish who owns what).
- Contact/inquiry form, routed to Admin.
- No resident names, phone numbers, or emails appear anywhere on the public site.

### 3.2 Resident Portal
- **Overview** — personalized welcome, balance snapshot, open votes, active requests.
- **My Charges** — monthly HOA dues: amount due, amount paid, running balance, payment history. "Pay Now" needs a real payment gateway decision (Section 8) — until then it stays informational.
- **Project Progress** — building-wide projects (renovations, infrastructure) with a milestone timeline, visible to all residents.
- **Voting** — proposals with Yes/No/Abstain, live results, one vote per unit, close dates.
- **Amenities** — book shared spaces (rooftop, gym, lounge) on a real calendar.
- **Requests** — two kinds, both going to Admin for now:
  - *Report a problem* (plumbing, electrical, HVAC, general).
  - *Renovation / new construction request* (kitchen redo, room addition, structural change) — Admin reviews and connects the resident to an approved contractor. (A real approved-vendor list is a future addition once one exists — see Section 5.)
- **Documents** — shared building documents (bylaws, safety guidelines, financial summaries).

### 3.3 Accountant Portal
- **Overview** — collected vs. billed this month, outstanding balance, collection rate, recent expenses.
- **Dues Ledger** — add/edit monthly charges per unit, mark payments received.
- **Expenses** — log building costs by category (utilities, maintenance, security, landscaping, insurance, payroll) and vendor.
- **Residents** — full contact directory, for billing communication only.

### 3.4 Admin Portal
- **Overview** — cross-building snapshot: listings, projects, votes, inquiries.
- **Listings** — manage for-sale/for-rent inventory shown publicly.
- **Projects** — create/update building projects and their progress.
- **Votes** — create proposals, open/close voting, view results.
- **Inquiries** — visitor contact-form submissions.
- **Requests** — both maintenance issues and renovation requests from residents, with status tracking (open → in progress → resolved).
- **Residents** — full owner directory with contact info.

### 3.5 AI Assistant
Today: a rules-based assistant reading the same in-memory data everyone else sees — genuinely useful, fully offline, but not a real language model and not able to reason about anything not already in the data (it cannot know why oil prices moved, for instance, unless a person records that as the reason for a cost change).

Real version:
- Backed by an actual LLM (e.g., Claude), called from a secure backend — never a client-side API key.
- Grounded only in this building's real data (dues, projects, votes, amenities, requests) — not open-ended external knowledge, to avoid it inventing answers about residents' money or the building.
- Cost-variance explanations ("why is this month different") only work if the Accountant records a reason when logging a month with a change — the AI surfaces that note, it doesn't invent one.
- Same three audiences, different question sets: residents ask about their own charges/votes/progress; Accountant asks about collections/expenses; Admin asks about anything.

### 3.6 Building Digital Twin (targeted for Phase 1, contingent on data)
An interactive model of the building: click a unit, block, or common area to see its maintenance history, installed equipment, warranties, before/after repair photos, and energy usage.

Needs: real floor plans/unit schedule (see Section 5 — still the single biggest gap; expected soon but not in hand yet). Sequencing: built last within Phase 1, after the database/auth/portal foundation, so the floor plans have the most time to arrive before this work starts. If they haven't landed by the time everything else in Phase 1 is done, this slips to Phase 4 instead of blocking launch of the rest. Without real floor plans, this stays a labeled schematic instead of the real layout — not acceptable as a final deliverable, only as a placeholder if the slip happens.

## 4. Data Model (high level)

- **Units** — block, apartment number, registration number, size/type (once known), owner.
- **Residents/Accounts** — linked 1:1 to a unit, login credentials, contact info (private).
- **Ledger** — monthly dues (due/paid/status) and building expenses (category/vendor/amount/note), per unit and building-wide.
- **Projects** — title, category, progress %, milestones, ETA.
- **Proposals/Votes** — title, description, options, tally, status, close date, one vote per unit.
- **Amenity bookings** — space, day, time slot, resident.
- **Requests** — type (issue/renovation), category, description, status, unit, timestamps.
- **Documents** — title, category, file, date.
- **Listings** — public-facing available units (separate from the private owner roster).

## 5. Outstanding Data & Assets Needed

Carried over from the earlier request list — still open:

- Floor plans for all 9 levels + unit schedule (blocks the Digital Twin).
- Maintenance/equipment history and warranties per unit or system.
- HOA bylaws, fee schedule, reserve fund summary (some of this may already partially exist from the owner spreadsheet).
- Professional photography, interior shots, vector logo.
- Real amenity hours/rules.
- A list of approved contractors/vendors, once the renovation-request feature needs to route to someone real instead of just Admin.
- Confirmation of what property/access software (if any) already exists that this should integrate with or replace.

## 6. Non-Functional Requirements

- **Real authentication** — each resident logs in with their own credentials (not "pick your unit"), likely email + password or a magic link. Accountant and Admin get their own accounts too.
- **A real database** — everything currently held in the browser's memory (resets on refresh) needs to persist: Postgres or similar.
- **Privacy** — resident names/phone/email are sensitive; access must be enforced server-side (a real backend, not just hiding a tab in the UI, which is all today's prototype can do). Needs a data-privacy policy before real residents' data goes live.
- **Secure AI integration** — any LLM API key lives on a server, never in a file a browser can read.
- **Notifications** — maintenance/renovation requests, vote results, and payment reminders likely need real email (or WhatsApp, common locally) delivery — a decision point, not yet built.
- **Payments** — "Pay Now" becoming real money movement requires a licensed payment gateway and is a financial/legal decision for you and the building, not something to build by default.

## 7. Proposed Technical Architecture

A pragmatic stack for a project this size (single building, moderate traffic, small internal team):

- **Frontend**: React (Next.js) — reuses the design language already built, adds real routing and server-rendering.
- **Backend + Database**: A managed Postgres + auth + storage platform (e.g., Supabase) to move fast without standing up custom infrastructure, or a small Node.js/Express API + Postgres if you want full control.
- **Auth**: Email/password or magic-link login, role-based (resident/accountant/admin), tied to the units table.
- **AI**: Claude API called server-side, with a fixed set of read-only queries it's allowed to run against the database (dues, projects, votes, requests) — same guardrails as today's rules engine, but with real language understanding.
- **Notifications**: Email via a transactional provider (Postmark/SendGrid), or WhatsApp Business API if that fits resident habits better locally.
- **Hosting**: Frontend on Vercel/Netlify; backend/database on the same managed platform or a small cloud VM.
- **File storage**: Documents, photos, and (later) floor plans in cloud object storage (S3-compatible), not baked into the app like today's prototype.

## 8. Phased Roadmap (rough effort, not a quote)

| Phase | Scope | Rough effort |
|---|---|---|
| 0. Prototype (done) | Everything above, mocked, client-side only, no login security | Complete |
| 1. Real foundation | Database, real auth, migrate all current features off in-memory state (resident/accountant/admin portals, voting, amenities, requests, documents); email (or WhatsApp) delivery for votes/requests/reminders; Digital Twin built last in the phase, contingent on floor plans arriving in time | 6–9 weeks — add ~2–4 weeks if floor plans land in time and the Digital Twin build fits inside Phase 1 |
| 2. Real AI | LLM backend integration for the AI assistant | 1–2 weeks |
| 3. Payments (optional) | Licensed payment gateway integration for real due collection | Depends entirely on gateway chosen — separate scoping needed |
| 4. Digital Twin (fallback) | Only needed if floor plans don't arrive in time for Phase 1 — 3D schematic, per-unit detail panels, built here instead so the rest of the launch isn't held up | 2–4 weeks, contingent on data in Section 5 |
| 5. Polish & handoff | Admin training, documentation, ongoing hosting/maintenance plan | 1–2 weeks |

These are engineering-effort ranges for a small team, not a fixed-price quote — actual timeline depends on who builds it and how much of Section 5's data is ready when work starts. Phase 1's range is wide because it's betting on floor plans arriving mid-build; if they're late, Phase 1 finishes at the low end and the Digital Twin becomes Phase 4 instead.

## 9. Open Decisions (yours to make, not mine to assume)

- Who is the real Admin and Accountant, day to day — building management, a board member, a hired property manager?
- Is a real payment gateway happening at all, and if so, which one (this affects legal/compliance work)?
- Email or WhatsApp (or both) for notifications? — needed now, not later: this moved into Phase 1.
- Who owns and maintains this system long-term — you, a developer you hire, or an agency?
- Budget and timeline appetite for Phase 1 onward — this determines whether it's built all at once or incrementally.

---

*This spec reflects everything built and discussed through the prototype phase. It should be treated as a living document — update it as data arrives (Section 5) and decisions get made (Section 9).*
