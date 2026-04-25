# Multi-Agent ABM Tool Setup Checklist

Use this checklist in the order agents consume tools. Keep all secrets in `.env` only.

## Intake Agent

- [ ] **Tally.so**  
  **Signup (free):** [https://tally.so](https://tally.so)  
  **API/Auth location:** Tally does not expose a standard public API key for basic form capture; use webhook setup from the form editor (`Form` -> `Integrations` -> `Webhooks`).  
  **Free tier limit:** Unlimited forms and unlimited responses on free plan.  
  **.env variable:** `TALLY_WEBHOOK_SECRET` (if webhook signing is enabled), `TALLY_FORM_ID`

## ICP Scout + Buyer Intel

- [ ] **Apollo.io**  
  **Signup (free):** [https://www.apollo.io/sign-up](https://www.apollo.io/sign-up)  
  **API key location:** `Settings` -> `Integrations` -> `API` -> `Create API Key`  
  **Free tier limit:** Typically ~50 exports/month on free tier (confirm in account billing page).  
  **.env variable:** `APOLLO_API_KEY`

- [ ] **Clay.com**  
  **Signup (free):** [https://www.clay.com](https://www.clay.com)  
  **API key location:** `Settings` -> `API Keys` (or `Settings` -> `Connections` for provider keys)  
  **Free tier limit:** ~100 credits/month on free tier.  
  **.env variable:** `CLAY_API_KEY`

- [ ] **Harmonic.ai**  
  **Signup:** [https://www.harmonic.ai](https://www.harmonic.ai)  
  **API key location:** `Settings` -> `Developers` / `API` (availability depends on granted plan access)  
  **Free tier limit:** Limited/approval-based access; verify quota in Harmonic workspace.  
  **.env variable:** `HARMONIC_API_KEY`

- [ ] **Crunchbase** (manual process)  
  **Signup (free):** [https://www.crunchbase.com/register](https://www.crunchbase.com/register)  
  **API key location:** No API key required for basic manual search workflow on free usage.  
  **Free tier limit:** Basic search/manual usage only; API typically requires paid access.  
  **.env variable:** Not required (`CRUNCHBASE_MANUAL_MODE=true`)

- [ ] **Hunter.io**  
  **Signup (free):** [https://hunter.io/users/sign_up](https://hunter.io/users/sign_up)  
  **API key location:** `Dashboard` -> profile menu -> `API`  
  **Free tier limit:** 25 searches/month (and limited verifications on free).  
  **.env variable:** `HUNTER_API_KEY`

- [ ] **PhantomBuster**  
  **Signup:** [https://phantombuster.com](https://phantombuster.com)  
  **API key location:** `Workspace` -> `Settings` -> `API` / `API Keys`  
  **Free tier limit:** Historically around 2 hours/day execution time on trial/free tier (confirm in plan page).  
  **.env variable:** `PHANTOMBUSTER_API_KEY`, `PHANTOMBUSTER_LINKEDIN_LI_AT`

- [ ] **Evaboot**  
  **Signup:** [https://evaboot.com](https://evaboot.com)  
  **API key location:** `Account` / `Settings` -> API key (if enabled for your plan)  
  **Free tier limit:** Common trial allowance is ~500 exports.  
  **.env variable:** `EVABOOT_API_KEY`

- [ ] **Lusha**  
  **Signup (free):** [https://www.lusha.com](https://www.lusha.com)  
  **API key location:** `Settings` -> `API` / `Developers`  
  **Free tier limit:** ~5 credits/month on free tier.  
  **.env variable:** `LUSHA_API_KEY`

## Signal & Intelligence

- [ ] **Perplexity AI**  
  **Signup:** [https://www.perplexity.ai](https://www.perplexity.ai) (API access via account/workspace)  
  **API key location:** `Settings` -> `API` / `API Keys`  
  **Free tier limit:** Limited free API usage/credits depending on current offer.  
  **.env variable:** `PERPLEXITY_API_KEY`

- [ ] **SparkToro** (manual process)  
  **Signup (free):** [https://sparktoro.com](https://sparktoro.com)  
  **API key location:** No public API key needed for manual research workflow.  
  **Free tier limit:** ~10 searches/month.  
  **.env variable:** Not required (`SPARKTORO_MANUAL_MODE=true`)

- [ ] **Reddit API**  
  **Signup/App registration:** [https://www.reddit.com/prefs/apps](https://www.reddit.com/prefs/apps)  
  **API key location:** Create app -> use `client id` (under app name) and `secret` (shown in app panel).  
  **Free tier limit:** Free with platform rate limits and policy constraints.  
  **.env variable:** `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT`

## Verifier

- [ ] **NeverBounce**  
  **Signup:** [https://neverbounce.com](https://neverbounce.com)  
  **API key location:** `Dashboard` -> `API` -> generate key  
  **Free tier limit:** Often up to 1,000 free verifications for trial/new accounts.  
  **.env variable:** `NEVERBOUNCE_API_KEY`

- [ ] **ZeroBounce**  
  **Signup:** [https://www.zerobounce.net](https://www.zerobounce.net)  
  **API key location:** `Dashboard` -> `API` -> `API Key`  
  **Free tier limit:** ~100 verifications/month on free/trial allocation.  
  **.env variable:** `ZEROBOUNCE_API_KEY`

## Storyteller

- [ ] **Anthropic API (Claude)**  
  **Signup:** [https://console.anthropic.com](https://console.anthropic.com)  
  **API key location:** `Console` -> `API Keys` -> `Create Key`  
  **Free tier limit:** Usually limited starter credits (if offered); otherwise pay-as-you-go.  
  **.env variable:** `ANTHROPIC_API_KEY`

## Campaign

- [ ] **HubSpot CRM**  
  **Signup (free CRM):** [https://www.hubspot.com/products/crm](https://www.hubspot.com/products/crm)  
  **Developer account/sandbox:** [https://developers.hubspot.com](https://developers.hubspot.com)  
  **API key location:** Prefer private app token at `Settings` -> `Integrations` -> `Private Apps` -> `Create private app` -> `Access token`  
  **Free tier limit:** Free CRM available; developer account supports sandbox testing.  
  **.env variable:** `HUBSPOT_ACCESS_TOKEN`

- [ ] **Instantly.ai**  
  **Signup:** [https://instantly.ai](https://instantly.ai)  
  **API key location:** `Settings` -> `Integrations` / `API`  
  **Free tier limit:** 14-day trial.  
  **.env variable:** `INSTANTLY_API_KEY`  
  **Timing note:** Do not start trial until Week 9.

- [ ] **Twilio**  
  **Signup:** [https://www.twilio.com/try-twilio](https://www.twilio.com/try-twilio)  
  **API key location:** `Console` -> `Account` -> `API keys & tokens` (Account SID/Auth Token from console home)  
  **Free tier limit:** Trial credits with restricted sending; pay-as-you-go after upgrade.  
  **.env variable:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM_NUMBER`

- [ ] **Cal.com**  
  **Signup (free):** [https://cal.com/signup](https://cal.com/signup)  
  **API key location:** `Settings` -> `Developer` -> `API Keys`  
  **Free tier limit:** Free individual/basic plan available.  
  **.env variable:** `CALCOM_API_KEY`

---

## PhantomBuster Risk Warning (LinkedIn ToS)

PhantomBuster automation can violate LinkedIn Terms of Service if used aggressively.  
Recommended safe-use controls:

- Use a secondary LinkedIn account dedicated to outbound automation.
- Keep connection requests under **25/day**.
- Add randomized delays and avoid burst actions.
- Do not run parallel aggressive scraping agents on the same account.
- Rotate and monitor activity; stop immediately if LinkedIn flags unusual behavior.
