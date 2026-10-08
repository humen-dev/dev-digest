# References

- Alistair Mavin, Philip Wilkinson, Adrian Harwood, Mark Novak — *Easy Approach
  to Requirements Syntax (EARS)*, 17th IEEE International Requirements
  Engineering Conference (RE'09), 2009, pp. 317–322. Origin of the five patterns
  and the keyword order.
- Course lesson L05 (Spec-Driven Development) — EARS as the acceptance-criteria
  format, `shall` as the mandatory marker, the vague → testable rewrite table.
  This repo writes the keywords in English (`WHEN`, `WHILE`, `IF … THEN`, `WHERE`)
  by project decision.
- INCOSE *Guide to Writing Requirements* — the per-requirement quality
  characteristics behind the checklist (singular, unambiguous, verifiable,
  implementation-free, conforming).
- This repo: [`specs/_TEMPLATE.md`](../../../specs/_TEMPLATE.md) (where EARS
  requirements live), [`.claude/agents/spec-creator.md`](../../agents/spec-creator.md)
  (the agent that injects this skill), [`.claude/agents/plan-verifier.md`](../../agents/plan-verifier.md)
  (`S<NN>-*` rows that verify them).
