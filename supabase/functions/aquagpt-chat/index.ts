import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.101.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const groqKey = Deno.env.get('GROQ_API_KEY') ?? '';
  const model = Deno.env.get('GROQ_MODEL') ?? DEFAULT_MODEL;

  if (!supabaseUrl || !serviceRoleKey || !groqKey) {
    return new Response(JSON.stringify({ error: 'Missing Supabase or Groq secrets.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) {
    return new Response(JSON.stringify({ error: 'Missing bearer token.' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const userLookup = await admin.auth.getUser(token);
  if (userLookup.error || !userLookup.data.user) {
    return new Response(JSON.stringify({ error: 'Invalid user token.' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const user = userLookup.data.user;
  const body = await request.json();
  const pondId = body.pond_id as string;
  const message = body.message as string;
  const requestedSessionId = body.session_id as string | null;
  const language = (body.language as string | undefined) ?? 'English';

  if (!pondId || !message) {
    return new Response(JSON.stringify({ error: 'pond_id and message are required.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Rate limit: 50 messages/day
  const today = new Date().toISOString().slice(0, 10);
  const usageLookup = await admin
    .from('aquagpt_usage')
    .select('*')
    .eq('user_id', user.id)
    .eq('usage_date', today)
    .maybeSingle();
  const currentUsage = usageLookup.data;
  if ((currentUsage?.message_count ?? 0) >= 50) {
    return new Response(JSON.stringify({ error: 'Daily limit reached. AquaGPT resets at midnight.' }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Assemble pond context
  const [profileRes, pondRes, cycleRes, logRes] = await Promise.all([
    admin.from('users').select('*').eq('auth_user_id', user.id).maybeSingle(),
    admin.from('ponds').select('*').eq('id', pondId).eq('user_id', user.id).single(),
    admin.from('crop_cycles').select('*').eq('pond_id', pondId).eq('user_id', user.id).eq('status', 'active')
      .order('stocking_date', { ascending: false }).limit(1).maybeSingle(),
    admin.from('pond_logs').select('*').eq('pond_id', pondId).eq('user_id', user.id)
      .order('observed_at', { ascending: false }).limit(7),
  ]);

  if (pondRes.error || cycleRes.error || logRes.error) {
    return new Response(JSON.stringify({ error: 'Unable to assemble pond context.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!cycleRes.data || !(logRes.data?.length)) {
    return new Response(
      JSON.stringify({ reply: "I can't advise without pond data. Please set up your pond and log at least one entry first." }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const latestLog = logRes.data[0];
  const cycle = cycleRes.data;
  const profile = profileRes.data;

  const staleWarning =
    latestLog
      ? (() => {
          const hoursOld = (Date.now() - new Date(latestLog.observed_at).getTime()) / 3600000;
          return hoursOld > 48
            ? `Your last log is ${Math.round(hoursOld / 24)} days old. My advice may not reflect current pond conditions. Please log today first.\n\n`
            : '';
        })()
      : '';

  const alerts = [
    latestLog.ammonia_mgl > 0.1 ? `Ammonia ${latestLog.ammonia_mgl} mg/L (critical >0.1)` : null,
    latestLog.ph && (latestLog.ph < 7.5 || latestLog.ph > 8.5) ? `pH ${latestLog.ph} (safe 7.5–8.5)` : null,
    latestLog.calcium_mgl && latestLog.calcium_mgl < 75 ? `Calcium ${latestLog.calcium_mgl} mg/L (low <75)` : null,
    latestLog.magnesium_mgl && latestLog.magnesium_mgl < 100 ? `Magnesium ${latestLog.magnesium_mgl} mg/L (low <100)` : null,
    latestLog.potassium_mgl && latestLog.potassium_mgl < 5 ? `Potassium ${latestLog.potassium_mgl} mg/L (low <5)` : null,
  ].filter(Boolean);

  const cycleDay = Math.max(1, Math.floor((Date.now() - new Date(cycle.stocking_date).getTime()) / 86400000) + 1);

  let sessionId = requestedSessionId;
  if (!sessionId) {
    const sessionInsert = await admin
      .from('aquagpt_sessions')
      .insert({ user_id: user.id, pond_id: pondId, cycle_id: cycle.id, language, model })
      .select('id')
      .single();
    if (sessionInsert.error) {
      return new Response(JSON.stringify({ error: 'Unable to create AquaGPT session.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    sessionId = sessionInsert.data.id;
  }

  const systemPrompt = `${staleWarning}You are AquaGPT, a trusted aquaculture advisor for Indian pond farmers.
Always respond in ${language}. Keep advice practical and concise.
Never recommend a specific branded product or fabricate values.
If data is missing, ask the farmer to log it first.

Farmer: ${profile?.full_name ?? 'Farmer'} | Pond: ${pondRes.data.name} | Species: ${cycle.species}
Cycle day: ${cycleDay} | Stocking density: ${cycle.stocking_density}/m²
Water quality (latest log):
  DO: ${latestLog.do_mgl ?? 'NA'} mg/L | pH: ${latestLog.ph ?? 'NA'} | Ammonia: ${latestLog.ammonia_mgl ?? 'NA'} mg/L
  Temp: ${latestLog.temp_c ?? 'NA'}°C | Salinity: ${latestLog.salinity_ppt ?? 'NA'} ppt
  Calcium: ${latestLog.calcium_mgl ?? 'NA'} mg/L | Magnesium: ${latestLog.magnesium_mgl ?? 'NA'} mg/L | Potassium: ${latestLog.potassium_mgl ?? 'NA'} mg/L
Biomass: ${latestLog.biomass_kg ?? 'NA'} kg | ABW: ${latestLog.abw_g ?? 'NA'} g
Active alerts: ${alerts.length ? alerts.join(', ') : 'None'}`.trim();

  const startTime = Date.now();
  const groqResponse = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${groqKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 1000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
    }),
  });

  if (!groqResponse.ok) {
    const errorText = await groqResponse.text();
    return new Response(JSON.stringify({ error: `AquaGPT is unavailable. Please try again. (${errorText})` }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const latencyMs = Date.now() - startTime;
  const completion = await groqResponse.json();
  const reply = completion.choices?.[0]?.message?.content ?? 'AquaGPT is unavailable. Please try again.';
  const totalTokens = completion.usage?.total_tokens ?? 0;

  // Persist messages
  await admin.from('aquagpt_messages').insert([
    {
      user_id: user.id,
      session_id: sessionId,
      role: 'user',
      content: message,
      token_count: completion.usage?.prompt_tokens ?? null,
      latency_ms: null,
    },
    {
      user_id: user.id,
      session_id: sessionId,
      role: 'assistant',
      content: reply,
      token_count: completion.usage?.completion_tokens ?? null,
      latency_ms: latencyMs,
    },
  ]);

  await admin
    .from('aquagpt_sessions')
    .update({ last_active_at: new Date().toISOString(), token_count_total: totalTokens, message_count: 2 })
    .eq('id', sessionId);

  await admin.from('aquagpt_usage').upsert(
    {
      user_id: user.id,
      usage_date: today,
      message_count: (currentUsage?.message_count ?? 0) + 1,
      total_tokens: (currentUsage?.total_tokens ?? 0) + totalTokens,
    },
    { onConflict: 'user_id,usage_date' },
  );

  return new Response(JSON.stringify({ sessionId, reply }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
