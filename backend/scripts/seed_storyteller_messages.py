"""
Seed hyper-personalised demo messages for every channel.

Persona: Acme AI is selling an AI-powered RevOps platform.
Target account: Meridian Health Systems (meridianhealth.com)
Target contacts:
  - Sarah Chen     — VP Revenue Operations (DECISION_MAKER, TIER_1)
  - Marcus Webb    — Head of Sales Enablement (CHAMPION, TIER_1)
  - Dr. Priya Nair — Chief Medical Officer (BLOCKER, TIER_1)
  - Tom Okafor     — Sales Operations Manager (INFLUENCER, TIER_2)

Channels covered:
  LinkedIn Connection · LinkedIn DM (pos 0-2) · Email (pos 0-4)
  WhatsApp · Reddit Strategy Note

Run:
  python -m backend.scripts.seed_storyteller_messages
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from backend.db.models import MessageRecord, MessagingRunRecord
from backend.db.session import SessionLocal, create_tables

CLIENT_ID = "12345678-1234-5678-1234-567812345678"

# ── Stable contact IDs ────────────────────────────────────────────────────────
C_SARAH  = "aaaaaaaa-0001-0001-0001-000000000001"
C_MARCUS = "aaaaaaaa-0002-0002-0002-000000000002"
C_PRIYA  = "aaaaaaaa-0003-0003-0003-000000000003"
C_TOM    = "aaaaaaaa-0004-0004-0004-000000000004"

ACCOUNT_DOMAIN  = "meridianhealth.com"
ACCOUNT_COMPANY = "Meridian Health Systems"

RUN_ID = "bbbbbbbb-1111-1111-1111-111111111111"


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _mid(*parts: str) -> str:
    seed = "-".join(parts)
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, seed))


def _layer(text: str, source_type: str, claim_id: str | None = None, untraced: bool = False) -> dict:
    return {"text": text, "source_claim_id": claim_id, "source_type": source_type, "untraced": untraced}


def _msg(
    contact_id: str,
    contact_name: str,
    contact_title: str,
    contact_role: str,
    channel: str,
    pos: int,
    tier: str,
    subject: str | None,
    body: str,
    account_hook: dict,
    buyer_hook: dict,
    pain: dict,
    value: dict,
) -> dict:
    mid = _mid(CLIENT_ID, contact_id, channel, str(pos))
    return {
        "id": mid,
        "client_id": CLIENT_ID,
        "account_domain": ACCOUNT_DOMAIN,
        "contact_id": contact_id,
        "channel": channel,
        "sequence_position": pos,
        "tier": tier,
        "review_state": "PENDING",
        "validation_state": "PASSED",
        "last_updated_at": _now().isoformat(),
        "data": {
            "message_id": mid,
            "client_id": CLIENT_ID,
            "account_domain": ACCOUNT_DOMAIN,
            "account_company": ACCOUNT_COMPANY,
            "contact_id": contact_id,
            "contact_name": contact_name,
            "contact_title": contact_title,
            "contact_committee_role": contact_role,
            "tier": tier,
            "channel": channel,
            "sequence_position": pos,
            "subject": subject,
            "body": body,
            "personalization_layers": {
                "account_hook": account_hook,
                "buyer_hook": buyer_hook,
                "pain": pain,
                "value": value,
            },
            "generation_metadata": {
                "engine": "ANTHROPIC_CLAUDE" if tier == "TIER_1" else "OPENAI_GPT_4O_MINI",
                "model_version": "claude-sonnet-4-20250514" if tier == "TIER_1" else "gpt-5.4-mini",
                "prompt_template_id": f"{channel.lower()}_t1_claude_v2" if tier == "TIER_1" else f"{channel.lower()}_t23_gpt_v2",
                "generated_at": _now().isoformat(),
                "token_usage": {"input_tokens": 820, "output_tokens": 310, "estimated_cost_usd": 0.0042},
                "generation_attempt": 1,
                "diversity_signature": _mid(contact_id, channel, str(pos))[:16],
            },
            "validation_state": {
                "traceability": "PASSED",
                "traceability_failures": [],
                "diversity": "PASSED",
                "diversity_collision_with": [],
                "freshness": "PASSED",
                "freshness_failures": [],
            },
            "review_state": "PENDING",
            "operator_edit_history": [],
            "last_updated_at": _now().isoformat(),
        },
    }


# ── Shared claim IDs (simulate CP2-approved claims) ───────────────────────────
CLAIM_HEADCOUNT  = "cccccccc-0001-0001-0001-000000000001"
CLAIM_PAIN_CRM   = "cccccccc-0002-0002-0002-000000000002"
CLAIM_PAIN_REPORT= "cccccccc-0003-0003-0003-000000000003"
CLAIM_COMPETITOR = "cccccccc-0004-0004-0004-000000000004"
CLAIM_JOB_CHANGE = "cccccccc-0005-0005-0005-000000000005"
CLAIM_SIGNAL     = "cccccccc-0006-0006-0006-000000000006"


def build_messages() -> list[dict]:
    msgs = []

    # ══════════════════════════════════════════════════════════════════════════
    # SARAH CHEN — VP Revenue Operations — DECISION_MAKER — TIER_1
    # ══════════════════════════════════════════════════════════════════════════

    DM   = "Sarah Chen"
    DT   = "VP Revenue Operations"
    DR   = "DECISION_MAKER"

    # LinkedIn Connection
    msgs.append(_msg(C_SARAH, DM, DT, DR, "LINKEDIN_CONNECTION", 0, "TIER_1",
        None,
        "Meridian's 40% headcount expansion across 6 markets in 18 months is a serious RevOps coordination challenge — curious how you're keeping pipeline hygiene intact at that velocity.",
        _layer("Meridian Health expanded headcount by 40% across 6 new markets in 18 months", "INTEL_REPORT_PRIORITY", CLAIM_HEADCOUNT),
        _layer("VP RevOps at a high-growth health system carries specific pipeline visibility risk", "RECENT_ACTIVITY", CLAIM_JOB_CHANGE),
        _layer("Pipeline hygiene at scale", "BUYER_PAIN_POINT", CLAIM_PAIN_CRM),
        _layer("", "MASTER_CONTEXT_VALUE_PROP", None, True),
    ))

    # LinkedIn DM pos 0
    msgs.append(_msg(C_SARAH, DM, DT, DR, "LINKEDIN_DM", 0, "TIER_1",
        None,
        "Sarah — Meridian's expansion into 6 new markets in under two years is genuinely impressive. The hard part usually hits 12–18 months in: forecast accuracy degrades as territory splits multiply, and RevOps ends up reconciling data instead of driving strategy.\n\nGiven your role, I imagine you're already living this tension. We work with RevOps leaders at similar-stage health systems who rebuilt their pipeline visibility layer to handle multi-market complexity — typically recovering 15–20% of pipeline that was effectively invisible before.\n\nWould it be useful to compare notes on how they approached the territory data problem?",
        _layer("40% headcount expansion across 6 markets in 18 months — territory data complexity predictable", "INTEL_REPORT_PRIORITY", CLAIM_HEADCOUNT),
        _layer("VP RevOps promoted during expansion phase — owns the forecast accuracy problem directly", "JOB_CHANGE_SIGNAL", CLAIM_JOB_CHANGE),
        _layer("Forecast accuracy degrades as territory splits multiply; RevOps reconciles data instead of driving strategy", "BUYER_PAIN_POINT", CLAIM_PAIN_CRM),
        _layer("AI-powered pipeline visibility that surfaces invisible revenue across complex territory structures", "MASTER_CONTEXT_VALUE_PROP"),
    ))

    # LinkedIn DM pos 1
    msgs.append(_msg(C_SARAH, DM, DT, DR, "LINKEDIN_DM", 1, "TIER_1",
        None,
        "Sarah — one thing I didn't mention: Meridian's Salesforce instance is reportedly shared across three legacy acquisitions, each with different field mappings. That's usually where the forecast reconciliation pain is loudest — not the reps, but the data architecture.\n\nWe've helped three other regional health systems consolidate that layer without a full CRM migration. One reduced their RevOps reporting cycle from 11 days to same-day.\n\nHappy to share what that transition looked like if useful.",
        _layer("Salesforce instance shared across three legacy acquisitions with conflicting field mappings", "INTEL_REPORT_COMPETITOR", CLAIM_COMPETITOR),
        _layer("RevOps reconciliation bottleneck tied to CRM data architecture, not team capacity", "RECENT_ACTIVITY", CLAIM_JOB_CHANGE),
        _layer("11-day reporting cycle is a known pain for health system RevOps leaders at this scale", "BUYER_PAIN_POINT", CLAIM_PAIN_REPORT),
        _layer("Consolidation layer that works above existing CRM — no migration required", "MASTER_CONTEXT_WIN_THEME"),
    ))

    # LinkedIn DM pos 2
    msgs.append(_msg(C_SARAH, DM, DT, DR, "LINKEDIN_DM", 2, "TIER_1",
        None,
        "Sarah — last note from me. One question worth considering: when Meridian's Q3 board review lands, will your revenue data tell a clean story across all six markets, or will you be footnoting exceptions again?\n\nIf the answer is the latter, happy to spend 20 minutes on how others have solved it. If the timing is off, I'll pick this back up in Q1.",
        _layer("Q3 board review is a recurring forcing function for revenue data quality at health systems", "SIGNAL_TIMELINE", CLAIM_SIGNAL),
        _layer("VP RevOps presenting to board needs clean cross-market data — footnotes signal a gap", "JOB_CHANGE_SIGNAL", CLAIM_JOB_CHANGE),
        _layer("Board-level reporting exceptions are a symptom of the underlying pipeline visibility gap", "BUYER_PAIN_POINT", CLAIM_PAIN_REPORT),
        _layer("Single revenue narrative across all markets — no footnotes, no manual reconciliation", "MASTER_CONTEXT_VALUE_PROP"),
    ))

    # Email pos 0
    msgs.append(_msg(C_SARAH, DM, DT, DR, "EMAIL", 0, "TIER_1",
        "Meridian's 6-market expansion and your Q3 pipeline",
        "Meridian's 40% headcount growth across six markets in under two years is a rare operational feat — the RevOps challenge that follows it is usually less visible but just as significant.\n\nWhen territory structures multiply that fast, pipeline data starts fragmenting: reps log deals in different ways, forecast roll-ups lose consistency, and RevOps spends more time reconciling than analysing. It's a headcount-induced visibility problem, not a people problem.\n\nWe work specifically with RevOps leaders at high-growth health systems who hit this inflection point. The pattern is predictable, and so is the fix — usually a data layer above your existing CRM, not a rip-and-replace.\n\nWould a 20-minute exchange on how others navigated this be worth your time before Q3 close?",
        _layer("40% headcount expansion across 6 markets in 18 months — RevOps fragmentation is predictable at this scale", "INTEL_REPORT_PRIORITY", CLAIM_HEADCOUNT),
        _layer("VP promoted into role during expansion — owns the forecast accuracy gap personally", "JOB_CHANGE_SIGNAL", CLAIM_JOB_CHANGE),
        _layer("Pipeline data fragments as territory structures multiply; RevOps spends time reconciling instead of analysing", "BUYER_PAIN_POINT", CLAIM_PAIN_CRM),
        _layer("Data consolidation layer above existing CRM — no migration, immediate pipeline visibility", "MASTER_CONTEXT_VALUE_PROP"),
    ))

    # Email pos 1
    msgs.append(_msg(C_SARAH, DM, DT, DR, "EMAIL", 1, "TIER_1",
        "Re: Meridian's pipeline — one concrete example",
        "Sarah — following up with something more concrete than my last note.\n\nTower Health (similar size, similar CRM complexity post-acquisition) reduced their RevOps reporting cycle from 11 days to same-day after implementing a unified pipeline layer. Their VP RevOps described the shift as 'going from archaeology to live observation.'\n\nMeridian's Salesforce setup across three legacy acquisitions has the same structural fingerprint — multiple field mappings, inconsistent stage definitions, no single source of truth for multi-market forecasting.\n\nWould it be useful to see the specific architecture they used? Happy to send the one-pager if so.",
        _layer("Salesforce instance spans three legacy acquisitions with conflicting field mappings — identical to Tower Health's pre-fix state", "INTEL_REPORT_COMPETITOR", CLAIM_COMPETITOR),
        _layer("11-day reporting cycle at comparable health system was resolved with pipeline consolidation layer", "RECENT_ACTIVITY", CLAIM_SIGNAL),
        _layer("No single source of truth for multi-market forecasting — manual reconciliation is the workaround", "BUYER_PAIN_POINT", CLAIM_PAIN_REPORT),
        _layer("Peer case study: Tower Health — 11-day → same-day reporting cycle, zero CRM migration", "MASTER_CONTEXT_WIN_THEME"),
    ))

    # Email pos 2
    msgs.append(_msg(C_SARAH, DM, DT, DR, "EMAIL", 2, "TIER_1",
        "The metric most RevOps leaders at your stage track (and one they don't)",
        "Sarah — a practical observation, no ask attached.\n\nMost RevOps leaders at Meridian's growth stage track pipeline coverage ratio religiously. The metric fewer track — but that correlates more strongly with closed revenue — is 'pipeline data confidence': the % of deals where stage, owner, close date, and value are current and consistent across all systems.\n\nAt 40% headcount growth, that confidence score typically drops 20–30 points. The forecast covers it up until Q4 crunch, and then it becomes visible in the attainment miss.\n\nIf you're already tracking it and Meridian is clean, ignore this. If not — and you'd like to see the benchmark data from comparable health systems — happy to share.\n\nNo reply needed unless useful.",
        _layer("40% headcount growth correlates with 20-30pt drop in pipeline data confidence at comparable health systems", "INTEL_REPORT_PRIORITY", CLAIM_HEADCOUNT),
        _layer("VP RevOps is accountable for Q4 forecast accuracy — this metric gap is her direct exposure", "JOB_CHANGE_SIGNAL", CLAIM_JOB_CHANGE),
        _layer("Pipeline data confidence degrades silently during high-growth periods, surfaces as attainment miss in Q4", "BUYER_PAIN_POINT", CLAIM_PAIN_CRM),
        _layer("Benchmark data from comparable health systems — pipeline confidence scores and recovery paths", "MASTER_CONTEXT_WIN_THEME"),
    ))

    # Email pos 3
    msgs.append(_msg(C_SARAH, DM, DT, DR, "EMAIL", 3, "TIER_1",
        "Gartner flagged Meridian's CRM setup as a consolidation risk",
        "Sarah — a different angle.\n\nGartner's latest Health System CRM report (March 2025) specifically flags multi-EHR, multi-Salesforce-instance environments as the primary source of revenue leakage for systems above $500M ARR. Meridian's architecture — three legacy acquisitions, one shared Salesforce org — is the exact pattern they describe.\n\nTheir finding: systems in this configuration underreport pipeline by an average of 18% and overstate forecast accuracy by 23%.\n\nYou may already have mitigations in place. If not, this is worth 20 minutes before your next board cycle.\n\nHappy to share the full excerpt if useful.",
        _layer("Gartner March 2025 flags multi-Salesforce-instance health systems above $500M as highest revenue leakage risk", "INTEL_REPORT_COMPETITOR", CLAIM_COMPETITOR),
        _layer("Meridian's three-acquisition Salesforce architecture matches the at-risk pattern exactly", "RECENT_ACTIVITY", CLAIM_SIGNAL),
        _layer("18% pipeline underreporting and 23% forecast overstatement in comparable architectures — quantified exposure", "BUYER_PAIN_POINT", CLAIM_PAIN_REPORT),
        _layer("Remediation path that works within existing Salesforce environment — no new vendor, no migration", "MASTER_CONTEXT_VALUE_PROP"),
    ))

    # Email pos 4
    msgs.append(_msg(C_SARAH, DM, DT, DR, "EMAIL", 4, "TIER_1",
        "Last note — closing the loop on Meridian",
        "Sarah — this is my last note in this sequence, so I'll keep it brief.\n\nI reached out because Meridian's growth profile and CRM architecture match the exact situations where we've seen the most material impact — typically $2–4M in recovered pipeline visibility for systems at your scale.\n\nIf the timing is wrong or you've solved this a different way, I completely understand. If there's even a 10% chance it's relevant, a 20-minute call in Q4 might be worth the hedge.\n\nEither way, I'm happy to send our Health System RevOps Benchmark report (no form, no follow-up required) — just say the word.\n\nWishing Meridian a strong close to the year.",
        _layer("Meridian's growth and CRM profile matches highest-impact segment — $2-4M pipeline recovery benchmark", "INTEL_REPORT_PRIORITY", CLAIM_HEADCOUNT),
        _layer("VP RevOps is the economic buyer for this decision — Q4 is the natural forcing function", "JOB_CHANGE_SIGNAL", CLAIM_JOB_CHANGE),
        _layer("Revenue leakage from pipeline visibility gap is quantifiable and recoverable", "BUYER_PAIN_POINT", CLAIM_PAIN_CRM),
        _layer("Health System RevOps Benchmark report — peer data, no form fill, no follow-up required", "MASTER_CONTEXT_WIN_THEME"),
    ))

    # ══════════════════════════════════════════════════════════════════════════
    # MARCUS WEBB — Head of Sales Enablement — CHAMPION — TIER_1
    # ══════════════════════════════════════════════════════════════════════════

    CM   = "Marcus Webb"
    CT   = "Head of Sales Enablement"
    CR   = "CHAMPION"

    # LinkedIn Connection
    msgs.append(_msg(C_MARCUS, CM, CT, CR, "LINKEDIN_CONNECTION", 0, "TIER_1",
        None,
        "Marcus — your work rebuilding Meridian's onboarding ramp from 9 months down to 4 is exactly the kind of structural win that usually surfaces a new problem: keeping rep productivity consistent as the team 4x's.",
        _layer("Marcus Webb led Meridian's sales onboarding rebuild, cutting ramp from 9 to 4 months", "RECENT_ACTIVITY", CLAIM_JOB_CHANGE),
        _layer("Onboarding acceleration at scale reveals rep productivity consistency as the next bottleneck", "JOB_CHANGE_SIGNAL", CLAIM_JOB_CHANGE),
        _layer("Rep productivity consistency at scale", "BUYER_PAIN_POINT", CLAIM_PAIN_CRM),
        _layer("", "MASTER_CONTEXT_VALUE_PROP", None, True),
    ))

    # LinkedIn DM pos 0
    msgs.append(_msg(C_MARCUS, CM, CT, CR, "LINKEDIN_DM", 0, "TIER_1",
        None,
        "Marcus — cutting onboarding ramp from 9 to 4 months is a genuinely hard thing to pull off. The follow-on challenge I see at similar-stage teams is keeping that ramp speed consistent as you scale past 50 reps — the playbook that worked for the first cohort often breaks when territory complexity increases.\n\nGiven Meridian's expansion across 6 markets, you're probably already managing that tension. We work with enablement leaders who've built rep effectiveness scoring that adapts to market-specific signals — not a generic scorecard, but territory-aware.\n\nWould it be useful to see how one health system team applied that?",
        _layer("Meridian expanding across 6 markets — territory complexity increases risk of onboarding playbook failure at scale", "INTEL_REPORT_PRIORITY", CLAIM_HEADCOUNT),
        _layer("Marcus rebuilt onboarding ramp — now owns the consistency problem as team scales past 50 reps", "JOB_CHANGE_SIGNAL", CLAIM_JOB_CHANGE),
        _layer("Generic rep scorecards break when territory complexity increases — enablement leaders lose visibility", "BUYER_PAIN_POINT", CLAIM_PAIN_CRM),
        _layer("Territory-aware rep effectiveness scoring — adapts to market-specific signals, not a static playbook", "MASTER_CONTEXT_VALUE_PROP"),
    ))

    # WhatsApp
    msgs.append(_msg(C_MARCUS, CM, CT, CR, "WHATSAPP", 0, "TIER_1",
        None,
        "Marcus — saw the Meridian Q2 update on the onboarding numbers. Impressive work. Quick thought: as you scale past 6 markets, the territory-aware coaching piece becomes the next hard problem. Happy to share what a couple of health system teams did — no agenda, genuinely think it'd be useful.",
        _layer("Meridian Q2 update mentioned onboarding improvements — public signal of Marcus's work", "RECENT_ACTIVITY", CLAIM_SIGNAL),
        _layer("Marcus owns the next-phase problem — coaching consistency at multi-market scale", "JOB_CHANGE_SIGNAL", CLAIM_JOB_CHANGE),
        _layer("Coaching consistency degrades as territory count grows past single-region playbook", "BUYER_PAIN_POINT", CLAIM_PAIN_CRM),
        _layer("Territory-aware coaching framework used by comparable health system teams", "MASTER_CONTEXT_WIN_THEME"),
    ))

    # Email pos 0
    msgs.append(_msg(C_MARCUS, CM, CT, CR, "EMAIL", 0, "TIER_1",
        "Your onboarding win + what comes next at Meridian's scale",
        "Marcus — the onboarding ramp reduction you led at Meridian is the kind of structural work that gets referenced in other teams' roadmaps. It's also, almost always, the precursor to a harder problem: sustaining rep effectiveness as territory complexity compounds.\n\nAt 6 markets and growing, the playbook that produced your 4-month ramp starts to fray — not because the methodology is wrong, but because territory-specific signals stop being captured in a generalised scorecard. Reps plateau. Enablement loses leading indicators.\n\nWe work with sales enablement leaders at health systems who've built territory-aware effectiveness models — not a CRM report, but a live signal feed that tells you which reps are tracking well in which markets before the pipeline data catches up.\n\nWorth 20 minutes to see if this is a problem Meridian is starting to feel?",
        _layer("Meridian expanding to 6 markets — territory complexity compounds, generic playbooks break", "INTEL_REPORT_PRIORITY", CLAIM_HEADCOUNT),
        _layer("Marcus rebuilt onboarding — now accountable for sustaining effectiveness as team scales", "JOB_CHANGE_SIGNAL", CLAIM_JOB_CHANGE),
        _layer("Territory-specific signals not captured in generalised scorecards — reps plateau, enablement loses leading indicators", "BUYER_PAIN_POINT", CLAIM_PAIN_CRM),
        _layer("Territory-aware rep effectiveness model — live signal feed, not a lagging CRM report", "MASTER_CONTEXT_VALUE_PROP"),
    ))

    # ══════════════════════════════════════════════════════════════════════════
    # DR. PRIYA NAIR — Chief Medical Officer — BLOCKER — TIER_1
    # ══════════════════════════════════════════════════════════════════════════

    BM   = "Dr. Priya Nair"
    BT   = "Chief Medical Officer"
    BR   = "BLOCKER"

    # LinkedIn Connection
    msgs.append(_msg(C_PRIYA, BM, BT, BR, "LINKEDIN_CONNECTION", 0, "TIER_1",
        None,
        "Dr. Nair — the clinical workflow governance questions that come with any revenue tech deployment at a health system are legitimate and often underweighted. Curious what Meridian's framework looks like for evaluating those tradeoffs.",
        _layer("CMO governance role at health system creates legitimate data-sharing and workflow concerns for revenue tech", "INTEL_REPORT_PRIORITY", CLAIM_HEADCOUNT),
        _layer("Dr. Nair is accountable for clinical data governance — not a stakeholder to bypass, but to address directly", "RECENT_ACTIVITY", CLAIM_JOB_CHANGE),
        _layer("Clinical workflow governance concerns are underweighted in most revenue tech evaluations", "BUYER_PAIN_POINT", CLAIM_PAIN_CRM),
        _layer("", "MASTER_CONTEXT_VALUE_PROP", None, True),
    ))

    # Email pos 0
    msgs.append(_msg(C_PRIYA, BM, BT, BR, "EMAIL", 0, "TIER_1",
        "Revenue tech at health systems — the governance question no one asks first",
        "Dr. Nair — most revenue technology conversations at health systems start with the sales team and end with IT security review. The clinical workflow and data governance layer — your domain — is typically an afterthought, which is usually where implementations stall.\n\nMeridian's growth trajectory means you'll likely be evaluating several revenue and operations platforms in the next 12 months. The CMO's concerns about data classification, PHI adjacency, and workflow disruption are exactly the questions that surface late and create the longest delays.\n\nI work with clinical leaders at comparable health systems who've built a governance pre-screen framework for evaluating these tools before they reach the IT stage — reducing decision cycle time by 40% and eliminating the last-minute compliance blocks.\n\nWould a brief conversation about how other CMOs have structured that framework be useful to you?",
        _layer("Health system revenue tech evaluations stall at clinical governance layer — CMO concerns surface late", "INTEL_REPORT_PRIORITY", CLAIM_HEADCOUNT),
        _layer("Dr. Nair's CMO role makes her the primary governance gatekeeper for any revenue platform deployment", "JOB_CHANGE_SIGNAL", CLAIM_JOB_CHANGE),
        _layer("PHI adjacency, data classification, and workflow disruption concerns create last-minute compliance blocks", "BUYER_PAIN_POINT", CLAIM_PAIN_CRM),
        _layer("CMO governance pre-screen framework — 40% faster decision cycles, eliminates late-stage compliance blocks", "MASTER_CONTEXT_VALUE_PROP"),
    ))

    # ══════════════════════════════════════════════════════════════════════════
    # TOM OKAFOR — Sales Operations Manager — INFLUENCER — TIER_2
    # ══════════════════════════════════════════════════════════════════════════

    IM   = "Tom Okafor"
    IT   = "Sales Operations Manager"
    IR   = "INFLUENCER"

    # LinkedIn Connection
    msgs.append(_msg(C_TOM, IM, IT, IR, "LINKEDIN_CONNECTION", 0, "TIER_2",
        None,
        "Tom — managing sales ops across Meridian's multi-region setup is a real data juggling act. Would be good to connect with someone in the thick of it.",
        _layer("Meridian's multi-region expansion creates data management complexity for sales ops", "INTEL_REPORT_PRIORITY", CLAIM_HEADCOUNT),
        _layer("Sales Ops Manager at a multi-region health system deals with CRM fragmentation daily", "RECENT_ACTIVITY", CLAIM_JOB_CHANGE),
        _layer("Multi-region CRM data management", "BUYER_PAIN_POINT", CLAIM_PAIN_CRM),
        _layer("", "MASTER_CONTEXT_VALUE_PROP", None, True),
    ))

    # Email pos 0
    msgs.append(_msg(C_TOM, IM, IT, IR, "EMAIL", 0, "TIER_2",
        "Meridian's multi-region sales ops data challenge",
        "Tom — managing sales operations across Meridian's six-market expansion while keeping CRM data clean is exactly the kind of role where the tooling either helps or creates more work.\n\nThe pattern we see most often: as territories multiply, rep data hygiene degrades, pipeline roll-ups become unreliable, and ops ends up babysitting the CRM instead of building process. It's a structural problem, not a rep behaviour problem.\n\nWe've worked with sales ops teams at comparable health systems to build lightweight data consistency layers that run above the existing CRM — no migration, no rep retraining, near-instant pipeline signal improvement.\n\nWould it be useful to see how one team solved this in 6 weeks?",
        _layer("Six-market expansion multiplies territory complexity and degrades CRM data consistency", "INTEL_REPORT_PRIORITY", CLAIM_HEADCOUNT),
        _layer("Sales Ops Manager owns CRM hygiene and pipeline roll-up quality — the structural pain lands here", "RECENT_ACTIVITY", CLAIM_JOB_CHANGE),
        _layer("Pipeline roll-ups become unreliable as territory count grows — ops babysits CRM instead of building process", "BUYER_PAIN_POINT", CLAIM_PAIN_CRM),
        _layer("Lightweight data consistency layer above existing CRM — no migration, no retraining, 6-week deployment", "MASTER_CONTEXT_VALUE_PROP"),
    ))

    # ══════════════════════════════════════════════════════════════════════════
    # REDDIT STRATEGY NOTE — Account-level, no contact
    # ══════════════════════════════════════════════════════════════════════════

    reddit_mid = _mid(CLIENT_ID, ACCOUNT_DOMAIN, "REDDIT_STRATEGY_NOTE", "0")
    msgs.append({
        "id": reddit_mid,
        "client_id": CLIENT_ID,
        "account_domain": ACCOUNT_DOMAIN,
        "contact_id": None,
        "channel": "REDDIT_STRATEGY_NOTE",
        "sequence_position": 0,
        "tier": "TIER_1",
        "review_state": "PENDING",
        "validation_state": "PASSED",
        "last_updated_at": _now().isoformat(),
        "data": {
            "message_id": reddit_mid,
            "client_id": CLIENT_ID,
            "account_domain": ACCOUNT_DOMAIN,
            "account_company": ACCOUNT_COMPANY,
            "contact_id": None,
            "contact_name": None,
            "contact_title": None,
            "contact_committee_role": None,
            "tier": "TIER_1",
            "channel": "REDDIT_STRATEGY_NOTE",
            "sequence_position": 0,
            "subject": None,
            "body": """## Reddit Engagement Strategy — Meridian Health Systems

**Stage:** UNAWARE · **Objective:** Build credibility before direct outreach

---

### Target Subreddits

| Subreddit | Rationale |
|---|---|
| r/healthcareit | Primary watering hole for health system IT and ops leaders. Meridian's RevOps persona is active here discussing CRM and integration challenges. |
| r/sales | Broad sales ops community — VP RevOps and enablement personas engage on pipeline management, forecasting, and territory topics. |
| r/revops | Direct match for Sarah Chen's role. Threads on multi-region forecasting accuracy appear weekly. |
| r/HealthcareAdministration | CMO and clinical admin personas. Dr. Nair's governance concerns are a live topic here. |
| r/salesforce | Meridian's Salesforce-across-acquisitions architecture is a documented pain point discussed frequently. |

---

### Thread Angles (3 to activate in weeks 1–2)

**Angle 1 — Multi-region pipeline data fragmentation**
*Target subreddit:* r/revops
*Thread concept:* "How do you maintain forecast accuracy when your territory structure changes faster than your CRM config? Posting because we just finished a 6-market expansion and the data quality lag is real."
*Why it works:* Directly mirrors Meridian's pain. Sarah Chen will recognise the situation. The thread creates a reason to engage without any product mention.

**Angle 2 — Salesforce across acquisitions**
*Target subreddit:* r/salesforce
*Thread concept:* "Anyone managing a Salesforce org that spans 3+ legacy acquisitions with different field mappings? Looking for how people handled the reporting layer before committing to a full consolidation."
*Why it works:* Describes Meridian's exact architecture. Positions the commenter as a practitioner, not a vendor. Opens inbound from others in the same situation.

**Angle 3 — Clinical governance for revenue tech**
*Target subreddit:* r/HealthcareAdministration
*Thread concept:* "What's the right framework for CMOs to evaluate revenue-side technology from a data governance perspective? PHI adjacency and workflow disruption seem underweighted in most vendor evaluations."
*Why it works:* Addresses Dr. Nair's concerns directly. Establishes credibility with the blocker persona before any direct outreach.

---

### Content Tone

Write as a **practitioner who has solved similar problems**, not as a vendor. No product names. No links to company content. Share observations, ask genuine questions, engage with other responses.\
The goal for weeks 1–3 is to become a recognisable, useful voice in threads where Meridian's buying committee is active.

---

### Hard Rules

- **Never** mention the product, company name, or link to any marketing content in the first 3 weeks.
- **Never** DM users from the same threads you're engaging in. Reddit's spam detection flags this immediately.
- **Never** post the same comment across multiple subreddits.
- **Never** use buzzwords like "AI-powered", "game-changing", or "ROI" in organic Reddit threads.
- **Always** respond to replies within 24 hours to build authentic engagement history.

---

### Conversion Path (weeks 4–6)

Once 2–3 threads have generated genuine engagement and the persona has karma in target subreddits:

1. One commenter in the r/revops thread will likely be from a comparable health system. DM them with a relevant resource (the Health System RevOps Benchmark report) — no pitch, just the resource.
2. Use that interaction as social proof when reaching out to Sarah Chen directly: "I've been in a discussion on r/revops that's almost identical to what I described in my last email — thought it might be relevant context."
3. The Reddit engagement history is also useful in the initial outreach to Dr. Nair — it demonstrates genuine domain expertise, not a sales script.

**Timeline:** 3–4 weeks of organic engagement before any direct reference in outbound.
""",
            "personalization_layers": {
                "account_hook": _layer("Meridian's 40% headcount expansion and multi-region CRM fragmentation are active discussion topics in health system RevOps communities", "INTEL_REPORT_PRIORITY", CLAIM_HEADCOUNT),
                "buyer_hook": _layer("VP RevOps, Head of Enablement, and CMO personas all active in target subreddits — three separate entry points", "JOB_CHANGE_SIGNAL", CLAIM_JOB_CHANGE),
                "pain": _layer("Multi-region pipeline data fragmentation, Salesforce-across-acquisitions complexity, and clinical governance for revenue tech", "BUYER_PAIN_POINT", CLAIM_PAIN_CRM),
                "value": _layer("Positioning as practitioner expert in health system RevOps complexity before any direct outreach", "MASTER_CONTEXT_WIN_THEME"),
            },
            "generation_metadata": {
                "engine": "ANTHROPIC_CLAUDE",
                "model_version": "claude-sonnet-4-20250514",
                "prompt_template_id": "reddit_strategy_t1_claude_v2",
                "generated_at": _now().isoformat(),
                "token_usage": {"input_tokens": 1240, "output_tokens": 780, "estimated_cost_usd": 0.0091},
                "generation_attempt": 1,
                "diversity_signature": reddit_mid[:16],
            },
            "validation_state": {
                "traceability": "PASSED",
                "traceability_failures": [],
                "diversity": "PASSED",
                "diversity_collision_with": [],
                "freshness": "PASSED",
                "freshness_failures": [],
            },
            "review_state": "PENDING",
            "operator_edit_history": [],
            "last_updated_at": _now().isoformat(),
        },
    })

    return msgs


def seed(db_session=None) -> None:
    close = False
    if db_session is None:
        create_tables()
        db_session = SessionLocal()
        close = True

    try:
        messages = build_messages()

        # Create a messaging run record
        existing_run = db_session.query(MessagingRunRecord).filter_by(id=RUN_ID).first()
        if not existing_run:
            run_record = MessagingRunRecord(
                id=RUN_ID,
                client_id=CLIENT_ID,
                started_at=_now(),
                finished_at=_now(),
                total_messages=len(messages),
                hard_failures=0,
                soft_failures=0,
                total_cost_usd=0.087,
                claude_cost_usd=0.073,
                gpt_cost_usd=0.014,
            )
            db_session.add(run_record)

        inserted = 0
        skipped = 0
        for msg in messages:
            existing = db_session.query(MessageRecord).filter_by(id=msg["id"]).first()
            if existing:
                skipped += 1
                continue
            record = MessageRecord(
                id=msg["id"],
                client_id=msg["client_id"],
                account_domain=msg["account_domain"],
                contact_id=msg.get("contact_id"),
                channel=msg["channel"],
                sequence_position=msg["sequence_position"],
                tier=msg["tier"],
                data=msg["data"],
                validation_state=msg["validation_state"],
                review_state=msg["review_state"],
                last_updated_at=_now(),
            )
            db_session.add(record)
            inserted += 1

        db_session.commit()
        print(f"Storyteller seed complete: {inserted} inserted, {skipped} skipped ({len(messages)} total)")
    finally:
        if close:
            db_session.close()


if __name__ == "__main__":
    seed()
