import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.101.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Missing Supabase service role configuration.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');
  const admin = createClient(supabaseUrl, serviceRoleKey);
  const userLookup = await admin.auth.getUser(token);
  if (userLookup.error || !userLookup.data.user) {
    return new Response(JSON.stringify({ error: 'Invalid user token.' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const body = await request.json();
  const cycleId = body.cycleId as string;
  if (!cycleId) {
    return new Response(JSON.stringify({ error: 'cycleId is required.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const userId = userLookup.data.user.id;
  const [cycleRes, logsRes] = await Promise.all([
    admin.from('crop_cycles').select('*').eq('id', cycleId).eq('user_id', userId).single(),
    admin.from('pond_logs').select('*').eq('cycle_id', cycleId).eq('user_id', userId).order('observed_at', { ascending: false }),
  ]);

  if (cycleRes.error || logsRes.error) {
    return new Response(JSON.stringify({ error: 'Unable to assemble cycle report payload.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const latestLog = logsRes.data?.[0] ?? null;
  const summary = {
    cycleId,
    species: cycleRes.data.species,
    outcome: cycleRes.data.outcome,
    harvestWeightKg: cycleRes.data.harvest_weight_kg,
    latestLog,
    reportUrl: null,
    note: 'This function returns a JSON summary payload. Attach a PDF renderer and Storage upload here for production report files.',
  };

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
