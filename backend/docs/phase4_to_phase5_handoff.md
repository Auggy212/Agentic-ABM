# Phase 4 to Phase 5 Handoff

Phase 5 consumes APPROVED messages from CP3 where the message review decision is one of `APPROVED`, `EDITED`, or `REGENERATED`.

Sequence ordering is per channel: `sequence_position=0` sends first, then `1`, and so on.

Channel transport map:

| Channel | Phase 5 transport |
|---|---|
| `EMAIL` | Instantly |
| `LINKEDIN_CONNECTION` / `LINKEDIN_DM` | PhantomBuster |
| `WHATSAPP` | Twilio |
| `REDDIT_STRATEGY_NOTE` | No automated send; show as an Operator brief |

Engagement scoring:

| Event | Score |
|---|---:|
| Email reply | +25 |
| LinkedIn DM reply | +25 |
| WhatsApp reply | +30 |
| Meeting booked | +50 |

SQL trigger: `engagement_score >= 60`.

Negative-reply auto-pause is mandatory. If any negative reply is detected, pause all automation for that account and alert the Operator.

Known limitations Phase 5 must work around:

- `RECENT_ACTIVITY` remains empty until PhantomBuster wiring lands.
- Hunter quota was exhausted in Phase 3; no further email finding should be assumed.
- Some Tier 2/3 messages may have `SOFT_FAIL` traceability flags that the Operator approved despite.
- Storyteller can be re-invoked post-CP3 only through the manual regenerate flow, which must remain audit-logged.
