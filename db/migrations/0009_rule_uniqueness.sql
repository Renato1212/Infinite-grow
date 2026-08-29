-- A rule you have written twice is one rule, and counting it twice would skew
-- process adherence. Tags already had this guard; rules did not, so a repeated
-- insert (a re-run seed, a double-submitted form) silently duplicated them.

-- Fold any existing duplicates into the earliest copy first, moving its checks
-- across so no day loses its answer.
with ranked as (
  select id, user_id, lower(btrim(text)) as norm,
         first_value(id) over (
           partition by user_id, lower(btrim(text)) order by created_at, id
         ) as keep_id
  from rules
)
update rule_checks c
set rule_id = r.keep_id
from ranked r
where c.rule_id = r.id and r.id <> r.keep_id
  and not exists (
    select 1 from rule_checks existing
    where existing.trading_day_id = c.trading_day_id and existing.rule_id = r.keep_id
  );

delete from rules a
using rules b
where a.user_id = b.user_id
  and lower(btrim(a.text)) = lower(btrim(b.text))
  and (b.created_at, b.id) < (a.created_at, a.id);

create unique index if not exists rules_unique_text on rules (user_id, lower(btrim(text)));
