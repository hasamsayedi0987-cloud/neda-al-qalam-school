'use client';

/**
 * پنل‌های مدیریتی ارتباطات — صلاحیت‌های ارتباطی، پیوند فرزندان، گزارش و مودریشن
 * تنها برای مدیر سیستم (یا دارندگان صلاحیت managePolicy/reports از سیاست)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiSend, isOnline } from '@/lib/client/api';
import { isoToJalaliDisplay, toPersianDigits } from '@/lib/jalali';
import { ROLE_LABELS } from '@/lib/grading';
import {
  COMM_CAPABILITIES, LIST_CAPABILITIES, COMM_ROLES, DEFAULT_ROLE_PERMS,
  effectivePerms, parseCommPolicy, type CommPerms, type CommPolicy,
} from '@/lib/comm';
import {
  ShieldCheck, Users, ScrollText, Save, Trash2, Link2, Plus, RefreshCw, FileWarning, History, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface UserRow { id: string; username: string; name: string; role: string; active: boolean }

const ROLE_TAB_LABELS: Record<string, string> = {
  ADMIN: 'مدیر', HEADTEACHER: 'سرمعلم', TEACHER: 'معلم', GUARDIAN: 'والد', STUDENT: 'شاگرد', STAFF: 'کارمند', LIBRARIAN: 'کتابخانه',
};

/* ═══════════════ پنل صلاحیت‌های ارتباطی ═══════════════ */

export function CommPolicyPanel() {
  const { toast } = useToast();
  const [policy, setPolicy] = useState<CommPolicy>({ roles: {}, users: {} });
  const [users, setUsers] = useState<UserRow[]>([]);
  const [activeRole, setActiveRole] = useState<string>('TEACHER');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [userSearch, setUserSearch] = useState('');
  const [peerSearch, setPeerSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [comm, usersRes] = await Promise.all([
        apiGet<{ policy: CommPolicy | null }>('/api/comm'),
        apiGet<{ users: UserRow[] }>('/api/users'),
      ]);
      if (comm.policy) setPolicy(comm.policy);
      setUsers(usersRes.users || []);
    } catch (e) {
      toast({ title: 'خطا در دریافت صلاحیت‌ها', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const activeUser = users.find((u) => u.id === selectedUserId) || null;

  /** مقدار مؤثر فعلی برای نمایش — نقش: پیش‌فرض+رونویسی؛ کاربر: مؤثر کامل */
  const effForRole = useMemo(
    () => effectivePerms(activeRole, 'preview', { roles: policy.roles, users: {} }),
    [activeRole, policy.roles],
  );
  const effForUser = useMemo(
    () => (activeUser ? effectivePerms(activeUser.role, activeUser.id, policy) : null),
    [activeUser, policy],
  );

  const setRolePerm = (key: keyof CommPerms, value: boolean) => {
    setPolicy((p) => ({
      ...p,
      roles: { ...p.roles, [activeRole]: { ...p.roles[activeRole], [key]: value } },
    }));
  };
  const setRoleToRoles = (role: string) => {
    setPolicy((p) => {
      const cur = p.roles[activeRole]?.toRoles ?? DEFAULT_ROLE_PERMS[activeRole]?.toRoles ?? [];
      const base = cur.includes('*') ? [...COMM_ROLES] : [...cur];
      const next = base.includes(role) ? base.filter((r) => r !== role) : [...base, role];
      return { ...p, roles: { ...p.roles, [activeRole]: { ...p.roles[activeRole], toRoles: next } } };
    });
  };
  const setUserPerm = (key: keyof CommPerms, value: boolean) => {
    if (!activeUser) return;
    setPolicy((p) => ({
      ...p,
      users: { ...p.users, [activeUser.id]: { ...p.users[activeUser.id], [key]: value } },
    }));
  };
  const setRoleArray = (key: 'extraPeers' | 'blockedPeers', list: string[]) => {
    setPolicy((p) => ({
      ...p,
      roles: { ...p.roles, [activeRole]: { ...p.roles[activeRole], [key]: list } },
    }));
  };
  const setUserArray = (key: 'extraPeers' | 'blockedPeers', list: string[]) => {
    if (!activeUser) return;
    setPolicy((p) => ({
      ...p,
      users: { ...p.users, [activeUser.id]: { ...p.users[activeUser.id], [key]: list } },
    }));
  };
  const removeUserOverride = (uid: string) => {
    setPolicy((p) => {
      const users2 = { ...p.users };
      delete users2[uid];
      return { ...p, users: users2 };
    });
    if (selectedUserId === uid) setSelectedUserId('');
  };

  const save = async () => {
    if (!isOnline()) {
      toast({ title: 'تنظیم صلاحیت‌ها نیازمند اتصال اینترنت است', description: 'این عملیات امنیتی برای اطمینان از اثر فوری، فقط آنلاین ذخیره می‌شود', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const res = await apiSend<{ ok: boolean }>('/api/comm', 'PUT', { policy }, { allowQueue: false, queueLabel: 'ذخیره صلاحیت‌های ارتباطی' });
    setSaving(false);
    if (res.error) {
      toast({ title: res.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'صلاحیت‌های ارتباطی ذخیره شد', description: 'تغییرات بلافاصله برای همهٔ کاربران فعال است' });
    void load();
  };

  const filteredUsers = users.filter((u) =>
    !userSearch || u.name.includes(userSearch) || u.username.includes(userSearch));
  const overrideCount = Object.keys(policy.users).length;

  const peerPicker = (key: 'extraPeers' | 'blockedPeers', current: string[], onChange: (list: string[]) => void, disabled: boolean) => {
    const candidates = users.filter((u) => !peerSearch || u.name.includes(peerSearch) || u.username.includes(peerSearch));
    return (
      <div className="rounded-lg border bg-background/60 p-2.5 space-y-2">
        <p className="text-xs font-medium">{LIST_CAPABILITIES.find((l) => l.key === key)?.label}</p>
        <p className="text-[11px] text-muted-foreground">{LIST_CAPABILITIES.find((l) => l.key === key)?.hint}</p>
        <Input value={peerSearch} onChange={(e) => setPeerSearch(e.target.value)} placeholder="جست‌وجوی کاربر…" className="h-8 text-xs" disabled={disabled} />
        <div className="max-h-36 overflow-y-auto nice-scroll space-y-1">
          {candidates.slice(0, 30).map((u) => {
            const picked = current.includes(u.id);
            return (
              <button
                key={u.id} type="button" disabled={disabled}
                onClick={() => onChange(picked ? current.filter((x) => x !== u.id) : [...current, u.id])}
                className={cn(
                  'w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs text-right transition-colors min-h-[36px]',
                  picked ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-accent',
                )}
              >
                <span className="truncate">{u.name} <span className="text-muted-foreground">({ROLE_LABELS[u.role] || u.role})</span></span>
                {picked && <X className="h-3.5 w-3.5 shrink-0" />}
              </button>
            );
          })}
          {candidates.length === 0 && <p className="text-[11px] text-muted-foreground py-2 text-center">کاربری یافت نشد</p>}
        </div>
        {current.length > 0 && (
          <p className="text-[11px] text-muted-foreground">{toPersianDigits(current.length)} شخص انتخاب‌شده</p>
        )}
      </div>
    );
  };

  if (loading) return <p className="text-sm text-muted-foreground animate-pulse">در حال بارگذاری صلاحیت‌ها…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold flex items-center gap-1.5">
            <ShieldCheck className="h-4.5 w-4.5 text-primary" /> صلاحیت‌های ارتباطی
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            برای هر نقش و هر کاربر تعیین کنید چه کسی با چه کسی و چگونه پیام ردوبدل کند — تغییرات بلافاصله و سمت سرور اعمال می‌شود.
          </p>
        </div>
        <Button onClick={save} disabled={saving} className="gap-1.5">
          <Save className="h-4 w-4" /> {saving ? 'در حال ذخیره…' : 'ذخیرهٔ تغییرات'}
        </Button>
      </div>

      {/* نقش‌ها */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <Tabs value={activeRole} onValueChange={setActiveRole}>
            <TabsList className="flex flex-wrap h-auto gap-1 w-full justify-start">
              {COMM_ROLES.map((r) => (
                <TabsTrigger key={r} value={r} className="text-xs px-2.5">
                  {ROLE_TAB_LABELS[r]}
                  {policy.roles[r] && Object.keys(policy.roles[r]).length > 0 && <span className="mr-1 h-1.5 w-1.5 rounded-full bg-primary inline-block" />}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5">
            {COMM_CAPABILITIES.map((cap) => {
              const overridden = policy.roles[activeRole] && cap.key in policy.roles[activeRole];
              const value = Boolean(effForRole[cap.key]);
              return (
                <div key={String(cap.key)} className={cn('flex items-center justify-between gap-3 rounded-lg px-3 py-2 border', overridden ? 'border-primary/30 bg-primary/5' : 'border-transparent bg-muted/40')}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-tight">{cap.label}</p>
                    {cap.hint && <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{cap.hint}</p>}
                  </div>
                  <Switch
                    checked={value}
                    onCheckedChange={(v) => setRolePerm(cap.key, v)}
                    aria-label={cap.label}
                  />
                </div>
              );
            })}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">نقش‌های مجازِ گیرنده برای «{ROLE_TAB_LABELS[activeRole]}»</Label>
            <div className="flex flex-wrap gap-1.5">
              {COMM_ROLES.map((r) => {
                const picked = effForRole.toRoles.includes('*') || effForRole.toRoles.includes(r);
                return (
                  <button
                    key={r} type="button"
                    onClick={() => setRoleToRoles(r)}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-xs border transition-colors min-h-[32px]',
                      picked ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-accent',
                    )}
                  >
                    {ROLE_TAB_LABELS[r]}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              ارتباط والد/شاگرد با معلمان همیشه بر اساس صنف و فرزندان ثبت‌شده محدود می‌شود؛ این فهرست درِ سطح نقش را باز یا بسته می‌کند.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {peerPicker('extraPeers', effForRole.extraPeers || [], (l) => setRoleArray('extraPeers', l), false)}
            {peerPicker('blockedPeers', effForRole.blockedPeers || [], (l) => setRoleArray('blockedPeers', l), false)}
          </div>
        </CardContent>
      </Card>

      {/* رونویسی فردی */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold flex items-center gap-1.5"><Users className="h-4 w-4 text-primary" /> رونویسی فردی کاربران</h3>
            <Badge variant="outline">{toPersianDigits(overrideCount)} کاربر با تنظیمات خاص</Badge>
          </div>
          <Input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="جست‌وجوی کاربر برای تنظیم فردی…" className="h-9" />
          <div className="max-h-40 overflow-y-auto nice-scroll rounded-lg border divide-y">
            {filteredUsers.slice(0, 40).map((u) => {
              const hasOverride = !!policy.users[u.id];
              return (
                <button
                  key={u.id} type="button"
                  onClick={() => setSelectedUserId(u.id === selectedUserId ? '' : u.id)}
                  className={cn(
                    'w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-right hover:bg-accent transition-colors min-h-[40px]',
                    selectedUserId === u.id && 'bg-primary/10',
                  )}
                >
                  <span className="truncate">{u.name} <span className="text-[11px] text-muted-foreground">({u.username})</span></span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    {hasOverride && <Badge className="bg-primary/15 text-primary text-[10px] px-1.5">تنظیم خاص</Badge>}
                    <span className="text-[11px] text-muted-foreground">{ROLE_LABELS[u.role] || u.role}</span>
                  </span>
                </button>
              );
            })}
            {filteredUsers.length === 0 && <p className="text-xs text-muted-foreground p-3 text-center">کاربری یافت نشد</p>}
          </div>

          {activeUser && effForUser && (
            <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold">{activeUser.name} — تنظیم فردی</p>
                <Button variant="outline" size="sm" onClick={() => removeUserOverride(activeUser.id)} className="gap-1 text-rose-600 dark:text-rose-400">
                  <Trash2 className="h-3.5 w-3.5" /> حذف تنظیم فردی
                </Button>
              </div>
              <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5">
                {COMM_CAPABILITIES.map((cap) => {
                  const isDefault = effForUser[cap.key] === Boolean(effectivePerms(activeUser.role, activeUser.id, { roles: {}, users: {} })[cap.key]);
                  const overridden = policy.users[activeUser.id] && cap.key in policy.users[activeUser.id];
                  return (
                    <div key={String(cap.key)} className={cn('flex items-center justify-between gap-3 rounded-lg px-3 py-2 border bg-background', overridden ? 'border-primary/40' : 'border-transparent')}>
                      <p className="text-xs font-medium leading-tight">
                        {cap.label}
                        {!overridden && <span className="text-[10px] text-muted-foreground mr-1">({isDefault ? 'پیش‌فرض نقش' : 'مورث نقش'})</span>}
                      </p>
                      <Switch checked={Boolean(effForUser[cap.key])} onCheckedChange={(v) => setUserPerm(cap.key, v)} aria-label={cap.label} />
                    </div>
                  );
                })}
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {peerPicker('extraPeers', effForUser.extraPeers || [], (l) => setUserArray('extraPeers', l), false)}
                {peerPicker('blockedPeers', effForUser.blockedPeers || [], (l) => setUserArray('blockedPeers', l), false)}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <GuardianLinksPanel />
    </div>
  );
}

/* ═══════════════ پیوند والد ↔ فرزند ═══════════════ */

interface LinkRow { id: string; userId: string; userName: string; studentId: string; studentName: string; className: string | null }
interface GuardianRow { id: string; name: string; username: string; primaryChild: { id: string; name: string; className: string | null } | null }
interface StudentRow { id: string; name: string; fatherName: string; className: string | null }

function GuardianLinksPanel() {
  const { toast } = useToast();
  const [guardians, setGuardians] = useState<GuardianRow[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [guardianId, setGuardianId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiGet<{ guardians: GuardianRow[]; links: LinkRow[]; students: StudentRow[] }>('/api/comm/links');
      setGuardians(d.guardians || []);
      setLinks(d.links || []);
      setStudents(d.students || []);
      setGuardianId((cur) => cur || (d.guardians?.[0]?.id ?? ''));
    } catch {
      /* آفلاین — بخش اختیاری است */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const addLink = async () => {
    if (!guardianId || !studentId) {
      toast({ title: 'والد و شاگرد هر دو را انتخاب کنید', variant: 'destructive' });
      return;
    }
    const res = await apiSend('/api/comm/links', 'POST', { userId: guardianId, studentId }, { allowQueue: false });
    if (res.error) { toast({ title: res.error, variant: 'destructive' }); return; }
    toast({ title: 'پیوند ثبت شد', description: 'دسترسی ارتباطی والد بلافاصله بر اساس همهٔ فرزندان گسترش می‌یابد' });
    setStudentId('');
    void load();
  };

  const removeLink = async (l: LinkRow) => {
    if (!window.confirm(`پیوند «${l.userName} ← ${l.studentName}» حذف شود؟`)) return;
    const res = await apiSend(`/api/comm/links?id=${l.id}`, 'DELETE', undefined, { allowQueue: false });
    if (res.error) { toast({ title: res.error, variant: 'destructive' }); return; }
    toast({ title: 'پیوند حذف شد' });
    void load();
  };

  const guardianLinks = links.filter((l) => l.userId === guardianId);

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <h3 className="text-sm font-bold flex items-center gap-1.5">
          <Link2 className="h-4 w-4 text-primary" /> فرزندان سرپرستان (چند فرزندی)
        </h3>
        <p className="text-xs text-muted-foreground">
          پیوند اصلی هر والد در بخش کاربران تعیین می‌شود. اگر یک سرپرست چند فرزند در صنف‌های مختلف دارد،
          اینجا فرزندان اضافی را پیوند بزنید تا دسترسی ارتباطی او به معلمان و نگرانِ همهٔ صنف‌های فرزندانش باز شود.
        </p>
        {loading ? (
          <p className="text-xs text-muted-foreground animate-pulse">در حال بارگذاری…</p>
        ) : (
          <div className="space-y-2.5">
            <div className="grid sm:grid-cols-[1fr_auto_1fr_auto] gap-2 items-end">
              <div className="space-y-1">
                <Label className="text-xs">والد / سرپرست</Label>
                <Select value={guardianId || undefined} onValueChange={setGuardianId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="انتخاب والد…" /></SelectTrigger>
                  <SelectContent>
                    {guardians.map((g) => (
                      <SelectItem key={g.id} value={g.id}>{g.name} ({g.username})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <span className="hidden sm:block text-muted-foreground pb-2">←</span>
              <div className="space-y-1">
                <Label className="text-xs">افزودن فرزند</Label>
                <Select value={studentId || undefined} onValueChange={setStudentId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="انتخاب شاگرد…" /></SelectTrigger>
                  <SelectContent className="max-h-56">
                    {students.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name} ولد {s.fatherName} — {s.className || 'بدون صنف'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" onClick={addLink} className="gap-1 h-9"><Plus className="h-4 w-4" /> پیوند</Button>
            </div>
            {guardians.find((g) => g.id === guardianId)?.primaryChild && (
              <p className="text-xs text-muted-foreground">
                فرزند اصلی: <b>{guardians.find((g) => g.id === guardianId)?.primaryChild?.name}</b>
                {' — '}{guardians.find((g) => g.id === guardianId)?.primaryChild?.className || 'بدون صنف'}
              </p>
            )}
            <div className="space-y-1">
              {guardianLinks.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                  <span>{l.studentName} <span className="text-muted-foreground text-xs">({l.className || 'بدون صنف'})</span></span>
                  <button type="button" onClick={() => removeLink(l)} className="rounded-lg p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10" aria-label="حذف پیوند">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {guardianId && guardianLinks.length === 0 && (
                <p className="text-[11px] text-muted-foreground text-center py-1.5">فرزند اضافی ثبت نشده — فقط پیوند اصلی فعال است</p>
              )}
              {!guardianId && <p className="text-[11px] text-muted-foreground text-center py-1.5">یک سرپرست را انتخاب کنید</p>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ═══════════════ گزارش فعالیت‌ها و مودریشن ═══════════════ */

interface ReportData {
  totals: { messages: number; deliveries: number; read: number; unread: number; last30: number };
  byKind: Record<string, number>;
  byRole: Record<string, number>;
  topSenders: Array<{ name: string; role: string; count: number }>;
  daily: Record<string, number>;
  recent: Array<{
    id: string; subject: string | null; bodyPreview: string; category: string; kind: string;
    priority: string; createdAt: string; editedAt: string | null; fromName: string; fromRole: string; fromId: string; recipients: number;
  }>;
  audits: Array<{ id: string; actorName: string; action: string; detail: string; createdAt: string }>;
  canModerate: boolean;
}

const AUDIT_LABELS: Record<string, string> = {
  COMM_POLICY_UPDATE: 'تغییر صلاحیت‌های ارتباطی',
  MSG_MODERATE_DELETE: 'حذف پیام نامناسب',
  GUARDIAN_LINK_ADD: 'پیوند فرزند به والد',
  GUARDIAN_LINK_REMOVE: 'حذف پیوند فرزند',
};

export function CommReportsPanel() {
  const { toast } = useToast();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiGet<ReportData>('/api/comm/reports');
      setData(d);
    } catch (e) {
      toast({ title: 'خطا در دریافت گزارش', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const moderateDelete = async (m: ReportData['recent'][number]) => {
    if (!window.confirm(`پیام «${m.subject || m.bodyPreview.slice(0, 30)}» از ${m.fromName} برای همه حذف شود؟\nاین اقدام در گزارش فعالیت‌ها ثبت می‌شود.`)) return;
    const res = await apiSend(`/api/messages?id=${m.id}`, 'DELETE', undefined, { allowQueue: false });
    if (res.error) { toast({ title: res.error, variant: 'destructive' }); return; }
    toast({ title: 'پیام برای همه حذف شد', description: 'اقدام در گزارش فعالیت‌ها ثبت شد' });
    void load();
  };

  if (loading) return <p className="text-sm text-muted-foreground animate-pulse">در حال بارگذاری گزارش…</p>;
  if (!data) return <p className="text-sm text-muted-foreground">گزارشی در دسترس نیست</p>;

  const t = data.totals;
  const stats = [
    { label: 'کل پیام‌ها', value: t.messages },
    { label: 'رسانی به گیرندگان', value: t.deliveries },
    { label: 'خوانده‌شده', value: t.read },
    { label: 'نخوانده', value: t.unread },
    { label: '۳۰ روز اخیر', value: t.last30 },
  ];
  const kindLabels: Record<string, string> = { DIRECT: 'خصوصی', GROUP: 'گروهی', BROADCAST: 'همگانی' };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold flex items-center gap-1.5">
          <ScrollText className="h-4.5 w-4.5 text-primary" /> گزارش فعالیت پیام‌ها
        </h2>
        <Button variant="outline" size="sm" onClick={() => void load()} className="gap-1">
          <RefreshCw className="h-3.5 w-3.5" /> تازه‌سازی
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-3 text-center">
              <p className="text-lg font-bold text-primary">{toPersianDigits(s.value)}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4 space-y-2">
            <h3 className="text-sm font-bold">ارسال بر اساس نقش</h3>
            {Object.entries(data.byRole).length === 0 ? (
              <p className="text-xs text-muted-foreground">داده‌ای نیست</p>
            ) : Object.entries(data.byRole).sort((a, b) => b[1] - a[1]).map(([role, count]) => (
              <div key={role} className="flex items-center justify-between text-sm border-b border-border/60 pb-1.5 last:border-0">
                <span>{ROLE_LABELS[role] || role}</span>
                <Badge variant="outline">{toPersianDigits(count)}</Badge>
              </div>
            ))}
            <h3 className="text-sm font-bold pt-2">انواع پیام</h3>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(data.byKind).map(([k, v]) => (
                <Badge key={k} variant="outline">{kindLabels[k] || k}: {toPersianDigits(v)}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-2">
            <h3 className="text-sm font-bold">فرستندگان فعال</h3>
            {data.topSenders.length === 0 && <p className="text-xs text-muted-foreground">داده‌ای نیست</p>}
            {data.topSenders.map((s, i) => (
              <div key={`${s.name}-${i}`} className="flex items-center justify-between text-sm border-b border-border/60 pb-1.5 last:border-0">
                <span className="truncate">{toPersianDigits(i + 1)}. {s.name} <span className="text-[11px] text-muted-foreground">({ROLE_LABELS[s.role] || s.role})</span></span>
                <Badge variant="outline">{toPersianDigits(s.count)}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {data.canModerate && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <h3 className="text-sm font-bold flex items-center gap-1.5"><FileWarning className="h-4 w-4 text-amber-600 dark:text-amber-400" /> پیام‌های اخیر — بررسی و مودریشن</h3>
            <p className="text-[11px] text-muted-foreground">پیام نامناسب را می‌توانید برای همهٔ گیرندگان حذف کنید؛ اقدام در گزارش فعالیت ثبت می‌شود.</p>
            <div className="space-y-1.5 max-h-80 overflow-y-auto nice-scroll">
              {data.recent.map((m) => (
                <div key={m.id} className="rounded-lg border p-2.5 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <b>{m.fromName}</b>
                    <span className="text-muted-foreground">({ROLE_LABELS[m.fromRole] || m.fromRole})</span>
                    <Badge variant="outline" className="text-[10px] px-1">{kindLabels[m.kind] || m.kind}</Badge>
                    {m.priority === 'URGENT' && <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-300 text-[10px] px-1">فوری</Badge>}
                    <span className="text-[11px] text-muted-foreground mr-auto">{isoToJalaliDisplay(m.createdAt.slice(0, 10))}</span>
                    <button
                      type="button" onClick={() => moderateDelete(m)}
                      className="rounded-lg p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 shrink-0"
                      aria-label="حذف کامل پیام" title="حذف کامل برای همه"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {m.subject && <p className="text-xs font-medium">{m.subject}</p>}
                  <p className="text-[11px] text-muted-foreground leading-4">{m.bodyPreview}</p>
                  <p className="text-[10px] text-muted-foreground">{toPersianDigits(m.recipients)} گیرنده</p>
                </div>
              ))}
              {data.recent.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">پیامی ثبت نشده است</p>}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4 space-y-2">
          <h3 className="text-sm font-bold flex items-center gap-1.5"><History className="h-4 w-4 text-primary" /> فعالیت‌های مدیریتی</h3>
          <div className="space-y-1 max-h-64 overflow-y-auto nice-scroll">
            {data.audits.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-1.5 text-xs border-b border-border/60 pb-1.5 last:border-0">
                <Badge variant="outline" className="text-[10px]">{AUDIT_LABELS[a.action] || a.action}</Badge>
                <span className="font-medium">{a.actorName}</span>
                <span className="text-muted-foreground truncate max-w-48">{a.detail !== '{}' ? a.detail : ''}</span>
                <span className="text-[11px] text-muted-foreground mr-auto">{isoToJalaliDisplay(a.createdAt.slice(0, 10))}</span>
              </div>
            ))}
            {data.audits.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">فعالیتی ثبت نشده است</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
