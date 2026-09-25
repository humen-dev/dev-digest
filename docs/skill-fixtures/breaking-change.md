---
name: breaking-change
description: Flag any route, request, or response change an existing caller cannot absorb without editing its code.
type: rubric
---

## Breaking-change detector

Flag any change to a public route that an existing caller cannot absorb without
editing its own code. Treat these as breaking, at CRITICAL severity:

- A route path or HTTP method is renamed, moved, or removed.
- A request gains a **required** field or query parameter, or an existing field
  becomes required / narrower (a shrunk enum, string → uuid, optional → required).
- A response loses a field, renames one, or changes a field's type.
- A status code changes for an unchanged condition (404 → 422, 200 → 204).

Name the caller-visible consequence in the finding: what the old caller sends or
reads, and what it gets after this diff.

**Bad** — CRITICAL, an old caller's request now 400s and its reader breaks:

```diff
-const Query = z.object({ status: z.string().optional() });
+const Query = z.object({ status: z.enum(['open', 'closed']), since: z.string() });
-  return { refund_id: r.id, amount_cents: r.amountCents };
+  return { id: r.id, amount_cents: r.amountCents };
```

**Good** — additive and therefore compatible; do not flag:

```diff
 const Query = z.object({ status: z.string().optional() });
+const Query = Query.extend({ cursor: z.string().optional() });
   return { refund_id: r.id, amount_cents: r.amountCents, currency: r.currency };
```
