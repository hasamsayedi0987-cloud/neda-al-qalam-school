/** دود-تست سریع APIهای جدید ارتباطات */
const BASE = 'http://localhost:3000';

async function apiLogin(u, p) {
  const res = await fetch(`${BASE}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', username: u, password: p }),
  });
  return { cookie: (res.headers.get('set-cookie') || '').split(';')[0], data: await res.json().catch(() => ({})), status: res.status };
}

async function api(method, url, body, cookie) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', cookie: cookie || '' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data };
}

(async () => {
  const admin = await apiLogin('admin', 'admin123');
  console.log('login admin:', admin.status, admin.data?.user?.role);
  if (admin.status !== 200) return;

  // GET messages — مهاجرت پیام‌های قدیمی باید اجرا شود
  const t0 = Date.now();
  const msgs = await api('GET', '/api/messages', undefined, admin.cookie);
  console.log('GET messages:', msgs.status, `inbox=${msgs.data.inbox?.length} sent=${msgs.data.sent?.length} unread=${msgs.data.unread} contacts=${msgs.data.contacts?.length} classes=${msgs.data.classes?.length} perms=${!!msgs.data.myPerms}`, `${Date.now() - t0}ms`);
  console.log('  sample inbox item:', JSON.stringify(msgs.data.inbox?.[0] || null)?.slice(0, 220));

  // GET comm
  const comm = await api('GET', '/api/comm', undefined, admin.cookie);
  console.log('GET comm:', comm.status, 'myPerms.enabled=', comm.data?.myPerms?.enabled, 'policy?', !!comm.data?.policy);

  // POST preview — همه
  const prev = await api('POST', '/api/messages/preview', { targets: [{ kind: 'all' }] }, admin.cookie);
  console.log('preview all:', prev.status, JSON.stringify(prev.data).slice(0, 200));

  // POST message to role TEACHER + dedup with users
  const users = await api('GET', '/api/users', undefined, admin.cookie);
  const teacher = (users.data.users || []).find((u) => u.role === 'TEACHER');
  const prev2 = await api('POST', '/api/messages/preview', { targets: [{ kind: 'roles', roles: ['TEACHER'] }, { kind: 'users', userIds: [teacher.id] }] }, admin.cookie);
  console.log('preview dedup (roles+user):', prev2.status, 'total=', prev2.data?.total, JSON.stringify(prev2.data?.breakdown));

  const send = await api('POST', '/api/messages', {
    targets: [{ kind: 'roles', roles: ['TEACHER'] }, { kind: 'users', userIds: [teacher.id] }],
    subject: 'تست ددیوپ', body: 'این پیام باید فقط یک‌بار برای هر معلم برسد', category: 'ANNOUNCEMENT', urgent: true,
  }, admin.cookie);
  console.log('send dedup:', send.status, JSON.stringify(send.data));

  const teacherLogin = await apiLogin('teacher', '12345678');
  const tinbox = await api('GET', '/api/messages', undefined, teacherLogin.cookie);
  const got = (tinbox.data.inbox || []).filter((m) => m.subject === 'تست ددیوپ');
  console.log('teacher inbox copies:', got.length, '(must be 1)', got[0] ? `kind=${got[0].kind} priority=${got[0].priority}` : '');

  // teacher contact scoping
  console.log('teacher contacts:', (tinbox.data.contacts || []).map((c) => `${c.name}(${c.reason})`).join(' | ').slice(0, 300));
  console.log('teacher perms:', JSON.stringify({ direct: tinbox.data.myPerms?.direct, group: tinbox.data.myPerms?.group, allUsers: tinbox.data.myPerms?.allUsers, attach: tinbox.data.myPerms?.attach }));

  // guardian contacts
  const parent = await apiLogin('parent', '12345678');
  const pinbox = await api('GET', '/api/messages', undefined, parent.cookie);
  console.log('guardian contacts:', (pinbox.data.contacts || []).map((c) => `${c.name}(${c.reason})`).join(' | ').slice(0, 300));

  // reports
  const rep = await api('GET', '/api/comm/reports', undefined, admin.cookie);
  console.log('reports:', rep.status, JSON.stringify(rep.data?.totals));

  // policy PUT + immediate effect
  const put = await api('PUT', '/api/comm', { policy: { roles: { TEACHER: { direct: false } } } }, admin.cookie);
  console.log('policy PUT:', put.status, JSON.stringify(put.data));
  const blocked = await api('POST', '/api/messages', { toUserId: admin.data.user.id, body: 'باید رد شود' }, teacherLogin.cookie);
  console.log('teacher direct after disable:', blocked.status, blocked.data?.error);
  const put2 = await api('PUT', '/api/comm', { policy: { roles: {} } }, admin.cookie);
  console.log('policy restore:', put2.status);
  const allowed = await api('POST', '/api/messages', { toUserId: admin.data.user.id, body: 'باید برسد' }, teacherLogin.cookie);
  console.log('teacher direct after enable:', allowed.status, JSON.stringify(allowed.data).slice(0, 120));

  // links
  const links = await api('GET', '/api/comm/links', undefined, admin.cookie);
  console.log('links:', links.status, `guardians=${links.data?.guardians?.length} students=${links.data?.students?.length}`);
})();
