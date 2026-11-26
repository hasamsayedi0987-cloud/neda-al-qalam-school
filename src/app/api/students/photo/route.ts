import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireSection, ApiError } from '@/lib/auth';
import { handleApiError } from '@/lib/api-helpers';
import { studentInTeacherScope } from '@/lib/teacher-scope';

/* ─── مرحلهٔ ۶ — بارگیری تنبل عکس شاگرد ───
 * عکس شاگرد دیگر در فهرست‌ها ارسال نمی‌شود؛ رابط کاربری فقط وقتی ردیف/کارت
 * به نمایش درمی‌آید، عکس همان یک شاگرد را از این نقطهٔ پایانی می‌گیرد.
 * نتیجه: با ۱۰۰۰+ شاگرد، هیچ‌گاه همهٔ تصاویر یک‌جا دانلود نمی‌شوند.
 * دسترسی: مدیر/سرمعلم همه؛ معلم فقط صنف‌های خود؛ شاگرد/سرپرست فقط خودشان. */
export async function GET(req: NextRequest) {
  try {
    const me = await requireSection('students', ['LIBRARIAN', 'STUDENT', 'GUARDIAN']);
    const id = req.nextUrl.searchParams.get('id') || '';
    if (!id) throw new ApiError('شناسهٔ شاگرد لازم است');
    if (me.role === 'STUDENT' || me.role === 'GUARDIAN') {
      if (me.studentId !== id) throw new ApiError('دسترسی مجاز نیست', 403);
    } else if (me.role === 'TEACHER' && !(await studentInTeacherScope(me.teacherId || '', id))) {
      throw new ApiError('این شاگرد در صنف‌های تحت تدریس شما نیست', 403);
    }
    const row = await db.student.findUnique({ where: { id }, select: { photo: true } });
    const res = NextResponse.json({ photo: row?.photo || null });
    // عکس به‌ندرت تغییر می‌کند — کش خصوصی مرورگر یک روز (فقط همین مرورگر، نه پروکسی)
    res.headers.set('Cache-Control', 'private, max-age=86400');
    return res;
  } catch (e) {
    return handleApiError(e);
  }
}
