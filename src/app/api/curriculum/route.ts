import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireSection, ApiError } from '@/lib/auth';
import { handleApiError, str } from '@/lib/api-helpers';
import { NATIONAL_SUBJECTS } from '@/lib/moe-curriculum';

/**
 * مضامین درسی ملی وزارت معارف — نسخهٔ ۳.۳.۰
 * درج یک‌جاِ مضامین رسمی نصاب ملی برای هر صنف (قرآن‌کریم، علوم دینی، دری، پشتو، ریاضی، …)
 */

export async function GET(req: NextRequest) {
  try {
    await requireSection('classes');
    const grade = Number(req.nextUrl.searchParams.get('grade')) || 1;
    return NextResponse.json({
      grade,
      subjects: NATIONAL_SUBJECTS[grade] || [],
      levels: {
        1: 'ابتدائیه', 2: 'ابتدائیه', 3: 'ابتدائیه', 4: 'ابتدائیه', 5: 'ابتدائیه', 6: 'ابتدائیه',
        7: 'متوسطه', 8: 'متوسطه', 9: 'متوسطه',
        10: 'لیسه', 11: 'لیسه', 12: 'لیسه',
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireSection('classes');
    const body = await req.json();
    const action = str(body.action);

    if (action === 'apply-national') {
      const classId = str(body.classId);
      if (!classId) throw new ApiError('صنف را انتخاب کنید');
      const cls = await db.class.findUnique({ where: { id: classId } });
      if (!cls) throw new ApiError('صنف یافت نشد');
      const national = NATIONAL_SUBJECTS[cls.grade] || [];
      if (national.length === 0) throw new ApiError('فهرست ملی این صنف تعریف نشده است');

      let createdSubjects = 0;
      let createdLinks = 0;
      let existingLinks = 0;
      for (const name of national) {
        let subject = await db.subject.findFirst({ where: { name } });
        if (!subject) {
          subject = await db.subject.create({ data: { name } });
          createdSubjects += 1;
        }
        const existing = await db.classSubject.findUnique({
          where: { classId_subjectId: { classId, subjectId: subject.id } },
        });
        if (existing) {
          existingLinks += 1;
        } else {
          await db.classSubject.create({ data: { classId, subjectId: subject.id } });
          createdLinks += 1;
        }
      }
      return NextResponse.json({
        ok: true,
        applied: national.length,
        createdSubjects,
        createdLinks,
        existingLinks,
        message: `${createdLinks} مضمون ملی به صنف ${cls.name} افزوده شد${existingLinks ? ` — ${existingLinks} مضمون از قبل موجود بود` : ''}`,
      });
    }

    throw new ApiError('عملیات نامعلوم');
  } catch (e) {
    return handleApiError(e);
  }
}
