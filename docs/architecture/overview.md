# Architecture Overview

## System boundaries

Hothonglogic is a modular monolith with three delivery surfaces:

1. The Manifest V3 Chrome Extension extracts product information from supported Taobao/Tmall pages and opens the authenticated external-order flow.
2. The React admin panel coordinates operational workflows and communicates with the backend through GraphQL.
3. The Laravel backend owns authentication, authorization, transactions, business rules, and MySQL persistence.

Sanctum bearer tokens authenticate GraphQL requests. Lighthouse maps the public schema in `logistics-backend/graphql/` to Laravel resolvers, which delegate substantial workflows to services.

## Domain areas

- Authentication and employees
- Customers and orders
- China warehouse packages and batches
- Vietnam warehouse receiving and reconciliation
- Payment vouchers and invoices
- Shipping rates, shipping tasks, and export slips
- Revenue reporting

## Compatibility rules

- Keep the current public GraphQL field/type names stable.
- Keep admin routes and extension message/storage keys stable unless a migration path is provided.
- Treat Laravel migrations as the database schema history and source of truth.
- Do not edit applied migrations or introduce a parallel production schema.
- Move business workflows out of resolvers incrementally while preserving transaction boundaries.
- Prefer domain folders and explicit actions only where they reduce real complexity.

## Evolution strategy

The repository is being improved in small stages: cleanup and documentation, internal module boundaries, verification, then optional top-level folder moves in a dedicated change. Moving to `apps/admin-web`, `apps/api`, and `apps/browser-extension` is a long-term option, not part of the initial cleanup.
