# Migration history notes

Migrations in this directory are append-only. Do not edit, delete, rename, or
reorder a migration that may already have been applied to a Supabase project.
Add a later corrective migration instead.

## Duplicate early baseline

`20260816152359_1aadbf74-b753-439f-b1eb-4877adbc55dd.sql` and
`20260818222449_d76fe9f7-c81f-40c7-915c-1d3658470a09.sql` both contain an
early schema baseline. The later file adds a small set of seed and uniqueness
differences, but most of its table, role, policy, and seed statements overlap
the first baseline.

They are kept because they are already part of the deployed history. For a
clean environment rebuild, apply the full migration sequence in timestamp
order and rely on the later corrective migrations for the final schema. Do not
try to collapse these files in place: that would make existing environments
diverge from migration history.

New migrations should be narrowly scoped, idempotent where practical, and
include the reason for any policy or data correction.
