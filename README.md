# 🍽️ كتاب وصفات أمير — Recipe Box

Personal Arabic recipe manager. Share a reel/video/photo (or a link) → it extracts the
recipe **in Arabic** (Gemini, with audio transcription fallback) → browse a rich gallery.
Everything runs serverless on **Vercel + Supabase** — nothing depends on a local machine.

Live: https://recipe-box-lemon.vercel.app · Bot: **@AmirRecipeBook_bot** ("كتاب وصفات أمير")

---

## Architecture

```
Phone: share reel / video / photo / text  ──►  Telegram bot
                                                   │ webhook (/api/telegram)
                                                   ▼
                          verify secret + owner id → route by type:
                             • link(s)  → enqueue job(s) ──► /api/worker (serial, rate-safe)
                             • video    → download from Telegram → Gemini
                             • photo    → Gemini vision (OCR)
                             • text     → search saved recipes, reply with links
                                                   │
   /api/worker  ─ saveFromUrl():                   ▼
     caption (OG) → if no recipe & video platform:
        YouTube → Gemini native URL
        else    → recipe-resolver (yt-dlp) → video (short) or audio track (long) → Gemini
     → normalize quantities, dedupe by source_url, persist image → Supabase
                                                   ▼
   Next.js gallery (/) + recipe pages  ── read from Supabase (anon), next/image thumbnails
```

Two Vercel projects:
- **`recipe-box`** (this repo) — Next.js 15 App Router: Telegram webhook, job worker, gallery, recipe pages, all APIs.
- **[`recipe-resolver`](https://github.com/nightbarron1412/recipe-resolver)** — Python function using **yt-dlp** to turn a social URL into direct video/audio URLs. Optional Instagram cookies via `RESOLVER_COOKIES`.

## Capture modes
| Send to the bot | Result |
|---|---|
| A **link** (IG/FB/TikTok/YouTube) | Caption first; if the recipe is only in the video, transcribes it (audio for long videos). |
| Several links in one message | All enqueued and processed serially. |
| A **video** file | Transcribed directly (no FB blocking). |
| A **photo/screenshot** | Gemini vision reads the recipe (handwritten/cookbook too). |
| **Plain text** (no link) | Treated as a search query → replies with matching saved recipes. |
| On the website | The **+** button pastes a link; the **📷** button uploads a photo. |

## Features
Live search (Arabic-normalized), tag/collection/platform/status/favorite/cooked filters, sort,
servings **scaler** (scales quantities + whole-recipe macros), **nutrition** estimate,
**cook mode** (tap to check off, resets each visit), **notes + rating + "طبختها"**,
grouped **ingredient sections** for multi-part recipes, favorites & collections, duplicate
flagging + quick delete, edit/replace-image/delete, print/copy, **backup export**, dark mode,
installable **PWA** with share target, self-healing daily retry.

## Data model (`public.recipes`)
`id, created_at, source_url, platform, author, title, caption, image_url, ingredients text[],
ingredient_sections jsonb, steps text[], tags text[], collections text[], servings, time_minutes,
status (ok|needs_review|fetch_failed), nutrition jsonb (whole-recipe), notes (private), rating,
cooked, favorite, raw jsonb, lang`.
Also `jobs` + `worker_lock` (queue).

**RLS:** public `SELECT` (gallery) except the `notes` column (revoked from `anon` — loaded
server-side via edit key). All writes go through the service-role key behind an edit key.

## API routes (all under `app/api`)
| Route | Auth | Purpose |
|---|---|---|
| `POST /telegram` | `x-telegram-bot-api-secret-token` + owner id | Bot webhook |
| `POST /worker` | `x-internal-secret` | Serial queue processor |
| `GET  /sweep` | `Bearer CRON_SECRET` or `x-edit-key` | Daily re-queue of needs_review |
| `GET/PATCH/DELETE /recipes/[id]` | `x-edit-key` | Read private notes / edit / delete |
| `POST /recipes/[id]/image` | `x-edit-key` | Replace cover |
| `POST /web-save` | `x-edit-key` | Save from a link (share target / + button / retry) |
| `POST /photo-save` | `x-edit-key` | Save from an uploaded photo |
| `GET  /export` | `x-edit-key` | JSON backup |
| `POST /normalize` | `x-edit-key` | Backfill ingredient quantities |
| `POST /retag` | `x-edit-key` | Consolidate tags |
| `POST /nutrition` | `x-edit-key` | Backfill nutrition (`{force:true}` re-does all) |

## Environment (`.env.example`)
`TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, ALLOWED_TELEGRAM_USER_ID,
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
GEMINI_API_KEY, GEMINI_MODEL (opt, default gemini-flash-lite-latest), APP_BASE_URL,
RESOLVER_URL, RESOLVER_SECRET, EDIT_KEY, CRON_SECRET`.
Resolver project: `RESOLVER_SECRET`, optional `RESOLVER_COOKIES`.

## Deploy
```bash
vercel --prod --scope <team>            # recipe-box
cd ../recipe-resolver && vercel --prod  # resolver
# Telegram webhook:
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://<app>/api/telegram" -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>" \
  -d "drop_pending_updates=true" -d 'allowed_updates=["message","channel_post"]'
```
Bot avatar: `@BotFather → /setuserpic` → upload `/pwa-icon?size=512`.

## Gotchas (learned the hard way)
- **Gemini model:** use `gemini-flash-lite-latest` — `flash-latest`(=3.5) has a ~20 req/day free cap.
- **Force `responseSchema`** on Gemini calls — it otherwise sometimes returns a bare array → looks like "no recipe".
- **Audio needs an audio prompt**; don't feed the reel caption into media extraction (teasers cause false negatives).
- **FB/IG OG** needs the `facebookexternalhit` crawler UA; a browser UA gets HTTP 400. Long FB videos → use the small **audio** track.
- **Service worker** only intercepts navigations (v1 broke Next chunks after redeploys).
- **Vercel Python** needs `pyproject.toml` `[tool.vercel] entrypoint`.
- **`notes` is private via per-column grants**: table-level SELECT is revoked from `anon` and
  granted per-column (excluding `notes`). **Adding a new public column?** run
  `GRANT SELECT (new_col) ON public.recipes TO anon;` or public reads of it will 403.
- **Auth fails closed**: every secret check rejects when the env var is unset (never default-allow).
