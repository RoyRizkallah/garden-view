# Garden View Platform — Data & Asset Request List

Send this to whoever holds the building's records (developer, property manager, or HOA/owners' committee). Everything below is what separates the current prototype from a real platform. Items are grouped by what they unlock, and flagged **must-have** vs **nice-to-have** so you can chase the important ones first.

---

## 1. Floor plans & architectural data — unlocks the Digital Twin

- **Must-have:** Floor plans for each of the 9 levels (PDF or image is enough to start; DWG/DXF/BIM/Revit is better if it exists).
- **Must-have:** A unit schedule — every unit number, its floor, square meters, room count, and which floor plan it corresponds to.
- **Nice-to-have:** Any 3D model, BIM file, or architect's rendering package from construction.
- **Nice-to-have:** Site plan / plot layout showing the building's footprint relative to the street and neighboring towers.

Without at least the unit schedule and basic floor plans, the 3D twin has to stay a stylized schematic (labeled boxes, not real layouts) — worth knowing early if that's not acceptable for launch.

## 2. Unit & resident data — unlocks real listings, resident accounts, voting

- **Must-have:** Full list of all units (not just the 6 sample ones in the demo) with: unit number, floor, size, bedroom/bathroom count, owner vs. tenant, for sale / for rent / occupied status, and asking price or rent if applicable.
- **Must-have:** Resident directory: name, unit, email, and whether they're an owner (for voting eligibility) or tenant. Confirm what consent/privacy process is needed before this data goes into any system.
- **Nice-to-have:** Move-in date, parking space assignment, storage unit assignment.

## 3. Maintenance & equipment history — unlocks the Digital Twin's per-unit detail

- **Must-have (if this feature matters to you):** Maintenance request logs — what's been fixed, when, in which unit or common area, and by whom.
- **Nice-to-have:** Equipment inventory per unit or system (HVAC units, water heaters, elevators, fire suppression) with make, model, install date.
- **Nice-to-have:** Warranty documents and expiration dates for major equipment.
- **Nice-to-have:** Before/after photos of repairs, if any exist.
- **Nice-to-have:** Energy/utility data — building-level bills at minimum; per-unit sub-metering data if it exists.

If none of this exists in digital form yet, say so — it changes the Digital Twin from "surface real records" to "start recording data going forward," which is a different, longer-term project.

## 4. Financial & governance — unlocks HOA transparency features

- **Must-have:** HOA bylaws, current fee schedule, and reserve fund summary (if you want residents seeing this in the portal).
- **Nice-to-have:** Recent meeting minutes, annual budget, past financial statements.
- **Nice-to-have:** Any existing rules for what residents are legally allowed to vote on, and what quorum/majority rules apply — the current voting feature is a mockup and shouldn't be mistaken for something with legal weight until this is defined.

## 5. Photography & media — unlocks a stronger gallery and Digital Twin visuals

- **Must-have:** Higher-resolution or professional photography if available (the current photos are phone shots — fine for a prototype, limiting for a flagship site).
- **Nice-to-have:** Interior shots: lobby, hallways, amenities, sample unit interiors.
- **Nice-to-have:** Drone or elevated exterior shots.
- **Nice-to-have:** A vector version of the logo (the current one was extracted from a Word doc at low resolution).

## 6. Amenities & common areas — unlocks accurate booking

- **Must-have:** Real list of bookable shared spaces (rooftop, gym, lounge, etc.), their actual hours, and any existing booking rules (max hours, resident-only, guest policy).
- **Nice-to-have:** Photos of each amenity space.

## 7. Systems & access — unlocks real login instead of the current demo role-picker

- **Must-have:** Confirm whether the building already uses any software (property management system, HOA platform, access control app) that this should integrate with or replace.
- **Must-have:** Decide who the real admins are and how they should authenticate (email/password, SSO, something else).
- **Nice-to-have:** Any existing resident communication channel (WhatsApp group, mailing list) so the platform doesn't compete with something already working.

## 8. Legal & privacy

- **Must-have:** Confirm data privacy requirements for storing resident names, contact info, and voting records — this determines what a real backend needs to comply with before any of this goes live with real people's data.

---

### How to use this

You don't need everything above to move forward — the **must-haves** in sections 1–3 are what would take the Digital Twin from "impressive demo" to "actually represents this building." Everything else improves realism but isn't blocking.
