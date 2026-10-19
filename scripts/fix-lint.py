import re, pathlib

base = pathlib.Path('/home/z/my-project/src')

# 1) ساده: useEffect(() => { load(); }, [load]); → queueMicrotask(load)
simple_files = [
    'components/app/activities-view.tsx', 'components/app/classes-view.tsx',
    'components/app/library-view.tsx', 'components/app/students-view.tsx',
    'components/app/subjects-view.tsx', 'components/app/tasks-view.tsx',
    'components/app/teachers-view.tsx', 'components/app/users-view.tsx',
]
for rel in simple_files:
    p = base / rel
    t = p.read_text()
    t = t.replace('useEffect(() => { load(); }, [load]);', 'useEffect(() => { queueMicrotask(load); }, [load]);')
    p.write_text(t)
    print('patched', rel)

# 2) page.tsx
p = base / 'app/page.tsx'
t = p.read_text()
t = t.replace('    loadSession();\n', '    queueMicrotask(loadSession);\n')
p.write_text(t)
print('patched page.tsx')

# 3) app-shell.tsx
p = base / 'components/app/app-shell.tsx'
t = p.read_text()
t = t.replace('    loadNotifications();\n    const t = setInterval(loadNotifications, 45_000);',
              '    queueMicrotask(loadNotifications);\n    const t = setInterval(loadNotifications, 45_000);')
p.write_text(t)
print('patched app-shell.tsx')

# 4) attendance-view.tsx
p = base / 'components/app/attendance-view.tsx'
t = p.read_text()
t = t.replace('useEffect(() => { loadDaily(); }, [loadDaily]);', 'useEffect(() => { queueMicrotask(loadDaily); }, [loadDaily]);')
t = t.replace("""  useEffect(() => {
    if (isSelf || repClass) loadMonthly();
  }, [isSelf, repClass, repYear, repMonth, loadMonthly]);""",
"""  useEffect(() => {
    if (isSelf || repClass) queueMicrotask(loadMonthly);
  }, [isSelf, repClass, repYear, repMonth, loadMonthly]);""")
p.write_text(t)
print('patched attendance-view.tsx')

# 5) grades-view.tsx
p = base / 'components/app/grades-view.tsx'
t = p.read_text()
t = t.replace('useEffect(() => { loadGrades(); }, [loadGrades]);', 'useEffect(() => { queueMicrotask(loadGrades); }, [loadGrades]);')
# stats: remove useMemo, compute directly
t = t.replace("""  const stats = useMemo(() => {
    const totals = students.map((s) => totalOf(s.id)).filter((t): t is number => t != null);
    if (totals.length === 0) return null;
    const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
    const pass = totals.filter((t) => t >= 50).length;
    return { avg: Math.round(avg * 100) / 100, pass, fail: totals.length - pass, count: totals.length };
  }, [students, cells]); // eslint-disable-line react-hooks/exhaustive-deps""",
"""  const stats = (() => {
    const totals = students.map((s) => totalOf(s.id)).filter((t): t is number => t != null);
    if (totals.length === 0) return null;
    const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
    const pass = totals.filter((t) => t >= 50).length;
    return { avg: Math.round(avg * 100) / 100, pass, fail: totals.length - pass, count: totals.length };
  })();""")
p.write_text(t)
print('patched grades-view.tsx')

# 6) results-view.tsx
p = base / 'components/app/results-view.tsx'
t = p.read_text()
t = t.replace('    if (!isStudentSide && classId) load(classId);', '    if (!isStudentSide && classId) queueMicrotask(() => load(classId));')
p.write_text(t)
print('patched results-view.tsx')

print('ALL PATCHED')
