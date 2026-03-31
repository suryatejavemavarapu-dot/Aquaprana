# AquaPrana Live Backend Setup

This project now supports two runtime modes:

1. Demo mode when Supabase environment variables are missing.
2. Live mode when the app can reach a deployed Supabase project.

## App environment

Create `.env.local` in the project root with:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_AQUAGPT_FUNCTION=aquagpt-chat
EXPO_PUBLIC_CYCLE_REPORT_FUNCTION=cycle-report
```

## Supabase database

Apply the migration in:

`supabase/migrations/20260331_000001_aquaprana_schema.sql`

The schema includes:

- OTP-ready `users` profile table linked to `auth.users`
- `ponds`, `crop_cycles`, `pond_logs`
- `feeding_schedules`, `price_configs`, `inventory_items`, `inventory_orders`
- `aquagpt_sessions`, `aquagpt_messages`, `aquagpt_usage`
- RLS policies scoped to `auth.uid()`

## Edge functions

Deploy:

- `supabase/functions/aquagpt-chat`
- `supabase/functions/cycle-report`

Set these function secrets before deploy:

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o
```

## Suggested CLI flow

```bash
supabase db push
supabase functions deploy aquagpt-chat
supabase functions deploy cycle-report
```

## Current app behavior

- OTP screen uses real Supabase SMS verification when env keys are present.
- Farmer profile, pond setup, logs, cycle close, price config, and inventory sync to Supabase.
- AquaGPT calls the deployed edge function and streams the returned text locally in the UI.
- A local snapshot cache still persists state on device for demo and offline-friendly fallback.
