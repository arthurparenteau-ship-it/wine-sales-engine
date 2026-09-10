# Winery OS — Build Specification

This branch contains the handoff specification for building Winery OS as a standalone application. Do not merge Winery OS into Wine Sales Engine; migrate this work to a dedicated `winery-os` repository when available.

## Product
Mobile-first operating system for a wine estate. The physical estate is the primary navigation layer. Buildings contain zones; zones contain inventory, tanks, barrels, tasks and movements.

## Backend already provisioned
Supabase project: `Winery OS`, region `eu-west-3`.
Core schema is already deployed with RLS for authenticated users.

Entities:
- buildings
- zones
- products
- stock_positions
- vessels
- employees
- tasks
- stock_movements

Enums:
- product_family: wine, armagnac, other
- vessel_kind: tank, wine_barrel, armagnac_barrel, other
- task_status: todo, doing, done, blocked
- task_priority: low, normal, high, urgent
- movement_kind: in, out, transfer, adjustment

## Confirmed estate topology
- Château — use/rooms TBD
- Pôle chai & bureaux
  - Chai vin
  - Barriques vin
  - Barriques Armagnac
  - Bureaux
- Petite chambre froide
  - Stock bouteilles
- Grande chambre froide
  - Stock bouteilles

Both cold rooms store wine organized by reference and bottle count. Actual references and quantities are intentionally blank until inventory is supplied.

## UX
Premium understated winery aesthetic. Desktop sidebar + mobile bottom navigation. Dashboard first. Satellite estate map with clickable overlays. Each physical zone opens a detail drawer/page.

Main modules:
1. Dashboard
2. Estate map
3. Bottle inventory
4. Tanks & barrels
5. Tasks
6. Calendar/planning
7. Stock movements/audit trail
8. Team
9. Search

## Required workflows
- Add/edit/archive product reference.
- Add/edit stock position in either cold room.
- Transfer bottles between locations and record immutable movement history.
- Add/edit tank or barrel with capacity, current volume, content, vintage, lot.
- Create task linked to employee + zone + optional vessel/product.
- Mark tasks doing/done/blocked.
- Filter tasks by person, location, status, due date.
- Dashboard totals computed from database.
- Global search for product, tank/barrel, location or task.
- QR-ready routes for vessel and storage location records.

## Architecture
Next.js App Router + TypeScript + Supabase JS + Tailwind/shadcn-compatible components. Server actions or route handlers for mutations. Zod validation. Responsive/mobile-first.

Environment variables:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

Never commit service-role secrets.

## Data integrity
Stock transfers must be transactional. Never allow negative stock. Every adjustment creates a stock_movements row. Completed tasks receive completed_at. Use database-generated UUIDs. All timestamps UTC.

## Seed data
Only seed confirmed topology and three onboarding tasks:
- Inventorier les cuves
- Inventorier les barriques
- Renseigner les stocks bouteilles
Do not invent wine references, quantities, staff, tank numbers or barrel data.

## Definition of done
- `npm run build` succeeds.
- Authentication gate works.
- All modules read/write Supabase.
- Responsive at iPhone width.
- Empty states allow first data entry.
- No invented estate operational data.
- README documents local setup and deployment.
