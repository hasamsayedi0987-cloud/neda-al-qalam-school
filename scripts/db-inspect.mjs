/** بررسی ساختار واقعی دیتابیس — کاربران، نقش‌ها، صنف‌ها، روابط و پیام‌ها */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const roles = await db.user.groupBy({ by: ['role'], _count: { id: true } });
console.log('ROLES:', roles.map((r) => `${r.role}:${r._count.id}`).join(' | '));
const users = await db.user.findMany({
  select: { username: true, name: true, role: true, teacherId: true, studentId: true, active: true },
  orderBy: [{ role: 'asc' }, { username: 'asc' }],
});
for (const u of users) {
  console.log(`  ${u.username.padEnd(14)} ${u.role.padEnd(12)} ${u.name} T:${u.teacherId ? 'Y' : '-'} S:${u.studentId ? 'Y' : '-'} ${u.active ? '' : 'INACTIVE'}`);
}
console.log('MESSAGES:', await db.message.count());
const classes = await db.class.findMany({
  select: { id: true, name: true, supervisorId: true, _count: { select: { students: true, classSubjects: true } } },
  orderBy: { grade: 'asc' },
});
for (const c of classes) {
  console.log(`CLASS ${c.id.slice(-6)} ${c.name} sup:${c.supervisorId ? c.supervisorId.slice(-6) : '-'} students:${c._count.students} subjects:${c._count.classSubjects}`);
}
const cs = await db.classSubject.findMany({ select: { classId: true, teacherId: true, subject: { select: { name: true } } } });
console.log('CLASSSUBJECTS:', cs.length);
for (const x of cs) {
  console.log(`  CS cls:${x.classId.slice(-6)} tch:${x.teacherId ? x.teacherId.slice(-6) : '-'} ${x.subject.name}`);
}
const students = await db.student.findMany({
  where: { users: { some: {} } },
  select: { id: true, classId: true, firstName: true, lastName: true, users: { select: { username: true, role: true } } },
});
console.log('STUDENTS-WITH-USER-ACCOUNT:', students.length);
for (const s of students) {
  console.log(`  STU ${s.id.slice(-6)} ${s.firstName} ${s.lastName || ''} cls:${s.classId ? s.classId.slice(-6) : '-'} users:${s.users.map((u) => `${u.username}(${u.role})`).join(',')}`);
}
await db.$disconnect();
