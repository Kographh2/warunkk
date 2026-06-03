import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

type EmailRequest = {
  id: string;
  user_id: string;
  requested_email: string;
  status: string;
};

function json(message: string, status = 200, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ message, ...extra }, { status });
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json('Server belum siap untuk approve email. Isi SUPABASE_SERVICE_ROLE_KEY di Vercel Environment Variables.', 500);
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return json('Sesi owner tidak ditemukan. Login ulang sebagai owner.', 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false }
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: currentUser, error: userError } = await userClient.auth.getUser(token);
  if (userError || !currentUser.user) return json('Sesi owner tidak valid. Login ulang.', 401);

  const { data: ownerProfile } = await adminClient
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', currentUser.user.id)
    .maybeSingle();

  if (!ownerProfile || ownerProfile.role !== 'owner' || !ownerProfile.is_active) {
    return json('Hanya owner aktif yang bisa approve pergantian email.', 403);
  }

  const body = await request.json().catch(() => ({}));
  const requestId = String(body?.id || '');
  if (!requestId) return json('ID request tidak valid.', 400);

  const { data: emailRequest, error: requestError } = await adminClient
    .from('email_change_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle<EmailRequest>();

  if (requestError || !emailRequest) return json('Request email tidak ditemukan.', 404);
  if (emailRequest.status !== 'pending') return json('Request ini sudah diproses.', 409);

  const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(emailRequest.user_id, {
    email: emailRequest.requested_email,
    email_confirm: true
  });

  if (updateAuthError) {
    return json(`Gagal update email auth: ${updateAuthError.message}`, 500);
  }

  const { error: updateRequestError } = await adminClient
    .from('email_change_requests')
    .update({
      status: 'approved',
      reviewed_by: currentUser.user.id,
      reviewed_at: new Date().toISOString()
    })
    .eq('id', requestId);

  if (updateRequestError) return json(`Email sudah diubah, tapi status request gagal diperbarui: ${updateRequestError.message}`, 500);

  return json('Request email berhasil di-approve. Email login customer sudah diperbarui.');
}
