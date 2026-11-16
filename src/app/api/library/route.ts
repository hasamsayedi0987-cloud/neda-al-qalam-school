import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, requireRole, requireSection, ApiError } from '@/lib/auth';
import { handleApiError, optNum, str } from '@/lib/api-helpers';

/** سقف حجم کتاب PDF — dataURL پس از base64 (≈ ۸.۵ مگابایت فایل باینری) */
export const MAX_BOOK_DATAURL = 12_000_000;

export async function GET(req: NextRequest) {
  try {
    await requireSection('library');
    const sp = new NextRequest(req.url).nextUrl.searchParams;

    // ── دریافت محتوای PDF یک کتاب برای مطالعهٔ داخل اپ (نسخهٔ ۳.۱.۰) ──
    if (sp.get('file') === '1') {
      const id = sp.get('id') || '';
      if (!id) throw new ApiError('شناسهٔ کتاب لازم است');
      const book = await db.book.findUnique({
        where: { id },
        select: { id: true, title: true, fileName: true, fileType: true, fileSize: true, fileData: true },
      });
      if (!book) throw new ApiError('کتاب یافت نشد');
      if (!book.fileData) throw new ApiError('این کتاب فایل PDF ندارد');
      let file: { name: string; type: string; data: string } | null = null;
      try { file = JSON.parse(book.fileData) as { name: string; type: string; data: string }; } catch { file = null; }
      if (!file?.data?.startsWith('data:')) throw new ApiError('فایل کتاب نامعتبر است');
      return NextResponse.json({
        id: book.id, title: book.title,
        fileName: book.fileName || file.name || 'book.pdf',
        fileType: book.fileType || file.type || 'application/pdf',
        fileSize: book.fileSize || file.data.length,
        data: file.data,
      });
    }

    const books = await db.book.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        loans: {
          where: { status: 'LENT' },
          orderBy: { loanDate: 'desc' },
        },
      },
    });
    const loans = await db.bookLoan.findMany({
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: { book: { select: { title: true } } },
    });
    return NextResponse.json({
      // محتوای PDF هرگز در فهرست منتقل نمی‌شود — فقط متادیتا (سرعت)
      books: books.map(({ fileData: _drop, ...b }) => ({
        ...b,
        lentCount: b.loans.length,
        loans: b.loans,
      })),
      loans: loans.map((l) => ({
        ...l,
        bookTitle: l.book.title,
        overdue: l.status === 'LENT' && l.dueDate < new Date().toISOString().slice(0, 10),
      })),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireSection('library');
    if (!['ADMIN', 'LIBRARIAN'].includes(me.role)) throw new ApiError('فقط مدیر و کتابخانه‌دار می‌توانند ثبت کنند', 403);
    const body = await req.json();
    const action = str(body.action);

    // ─── افزودن/ویرایش کتاب ───
    if (action === 'save-book') {
      const title = str(body.title);
      if (!title) throw new ApiError('عنوان کتاب لازم است');
      const copies = Math.max(1, optNum(body.copies) ?? 1);
      // ایدمپوتنسی صف آفلاین — replay ثبت کتاب پس از قطعی، کتاب تکراری نمی‌سازد
      const clientToken = str(body.clientToken).slice(0, 64);
      if (clientToken && !str(body.id)) {
        const dup = await db.book.findUnique({ where: { clientToken }, select: { id: true } });
        if (dup) return NextResponse.json({ id: dup.id, duplicate: true });
      }
      // ─── فایل PDF کتاب (اختیاری) — بارگذاری/جایگزینی در همان فرم کتاب ───
      let file: { fileData: string; fileName: string; fileType: string; fileSize: number } | null = null;
      const rawFile = body.pdfFile;
      if (rawFile && typeof rawFile === 'object') {
        const name = str((rawFile as Record<string, unknown>).name).slice(0, 160) || 'book.pdf';
        const type = str((rawFile as Record<string, unknown>).type).slice(0, 80) || 'application/pdf';
        const data = str((rawFile as Record<string, unknown>).data);
        if (data) {
          if (!data.startsWith('data:application/pdf')) throw new ApiError('فقط فایل PDF پذیرفته می‌شود');
          if (data.length > MAX_BOOK_DATAURL) throw new ApiError('حجم فایل PDF بیش از حد مجاز است (حداکثر حدود ۸ مگابایت)');
          const b64 = data.split(',')[1] || '';
          file = {
            fileData: JSON.stringify({ name, type, data }),
            fileName: name,
            fileType: type,
            fileSize: Math.round((b64.length * 3) / 4),
          };
        }
      }
      const data = {
        title,
        author: str(body.author) || null,
        category: str(body.category) || null,
        shelfNo: str(body.shelfNo) || null,
        copies,
      };
      if (str(body.id)) {
        const book = await db.book.findUnique({ where: { id: str(body.id) }, include: { loans: { where: { status: 'LENT' } } } });
        if (!book) throw new ApiError('کتاب یافت نشد');
        await db.book.update({
          where: { id: book.id },
          // بدون فایل جدید در درخواست، فایل قبلی حفظ می‌شود؛ removeFile=true حذف می‌کند
          data: {
            ...data,
            available: Math.max(0, copies - book.loans.length),
            ...(body.removeFile === true ? { fileData: null, fileName: null, fileType: null, fileSize: null } : {}),
            ...(file || {}),
          },
        });
        return NextResponse.json({ id: book.id });
      }
      const book = await db.book.create({
        data: {
          ...data,
          available: copies,
          ...(file || {}),
          clientToken: clientToken || null,
        },
      });
      return NextResponse.json({ id: book.id });
    }

    // ─── حذف فایل PDF از کتاب (بدون حذف خود کتاب) ───
    if (action === 'delete-file') {
      const bookId = str(body.bookId);
      if (!bookId) throw new ApiError('شناسهٔ کتاب لازم است');
      const book = await db.book.findUnique({ where: { id: bookId }, select: { id: true } });
      if (!book) throw new ApiError('کتاب یافت نشد');
      await db.book.update({
        where: { id: bookId },
        data: { fileData: null, fileName: null, fileType: null, fileSize: null },
      });
      return NextResponse.json({ ok: true });
    }

    // ─── امانت دادن ───
    if (action === 'lend') {
      const bookId = str(body.bookId);
      const borrowerName = str(body.borrowerName);
      const loanDate = str(body.loanDate);
      const dueDate = str(body.dueDate);
      if (!bookId || !borrowerName || !loanDate || !dueDate) {
        throw new ApiError('کتاب، امانت‌گیرنده و تاریخ‌ها لازم است');
      }
      const book = await db.book.findUnique({ where: { id: bookId } });
      if (!book) throw new ApiError('کتاب یافت نشد');
      if (book.available < 1) throw new ApiError('نسخهٔ موجود این کتاب تمام شده است');
      await db.$transaction([
        db.bookLoan.create({
          data: {
            bookId, borrowerName,
            borrowerType: str(body.borrowerType) || 'STUDENT',
            studentId: str(body.studentId) || null,
            loanDate, dueDate, status: 'LENT',
            notes: str(body.notes) || null,
          },
        }),
        db.book.update({ where: { id: bookId }, data: { available: { decrement: 1 } } }),
      ]);
      return NextResponse.json({ ok: true });
    }

    // ─── پس گرفتن کتاب ───
    if (action === 'return') {
      const loanId = str(body.loanId);
      if (!loanId) throw new ApiError('شناسهٔ امانت لازم است');
      const loan = await db.bookLoan.findUnique({ where: { id: loanId } });
      if (!loan) throw new ApiError('امانت یافت نشد');
      if (loan.status === 'RETURNED') throw new ApiError('این کتاب قبلاً پس داده شده است');
      const today = new Date().toISOString().slice(0, 10);
      // جریمهٔ دیرکرد — روزهای تأخیر × نرخ روزانه از تنظیمات (پیش‌فرض ۵ افغانی)
      let fine: number | null = null;
      if (today > loan.dueDate) {
        const lateDays = Math.ceil((new Date(today).getTime() - new Date(loan.dueDate).getTime()) / 86_400_000);
        const rateSetting = await db.setting.findUnique({ where: { key: 'finePerDay' } });
        const rate = Number(rateSetting?.value ?? 5) || 0;
        fine = Math.max(0, Math.round(lateDays * rate));
      }
      await db.$transaction([
        db.bookLoan.update({
          where: { id: loanId },
          data: { status: 'RETURNED', returnDate: today, fineAmount: fine },
        }),
        db.book.update({ where: { id: loan.bookId }, data: { available: { increment: 1 } } }),
      ]);
      return NextResponse.json({ ok: true, fine });
    }

    throw new ApiError('عملیات نامعلوم');
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const me = await requireSection('library');
    if (!['ADMIN', 'LIBRARIAN'].includes(me.role)) throw new ApiError('فقط مدیر و کتابخانه‌دار می‌توانند حذف کنند', 403);
    const id = new NextRequest(req.url).nextUrl.searchParams.get('id') || '';
    if (!id) throw new ApiError('شناسه لازم است');
    const lent = await db.bookLoan.count({ where: { bookId: id, status: 'LENT' } });
    if (lent > 0) throw new ApiError('این کتاب در امانت است؛ ابتدا پس گرفته شود');
    await db.book.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
