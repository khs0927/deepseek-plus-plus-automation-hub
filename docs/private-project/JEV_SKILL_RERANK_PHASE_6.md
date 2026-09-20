# JEV Skill Rerank — Phase 6

Phase 6 upgrades implicit local Skill auto-activation without changing explicit `/skill` behavior.

## Flow

```text
User prompt
  -> explicit /skill? yes -> exact existing path, no JEV
  -> implicit auto-activation allowed?
  -> content asks background with query only
  -> background reloads authoritative enabled Skills
  -> local scorer ranks local indexed Skills
  -> candidates below activation threshold removed
  -> Top-K (max 16)
  -> JEV skill_rank Choice
  -> active: high-confidence choice inside shortlist
     shadow/disabled/error/low-confidence: lexical result
  -> content validates returned name + local directory against current Skill state
  -> synchronous augmentation injects the selected local Skill
```

## Safety and privacy

- The page never supplies the candidate Skill list.
- Only imported local indexed Skills are eligible for this implicit rerank.
- JEV cannot select a Skill outside the local scorer shortlist.
- Explicit `/skill` invocations never enter probabilistic ranking.
- Common secret patterns are redacted by the shared decision sanitizer.
- Query transport is capped at 4,000 characters.
- Candidate count is capped at 16.
- A returned name and local directory must exactly match the current content Skill state before activation.
- If the background request fails, the released lexical path remains available.
