import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, requireRole, requireSection, ApiError } from '@/lib/auth';
import { handleApiError, optNum, str } from '@/lib/api-helpers';

export async function GET() {
  try {
    await requireSection('library');
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
      books: books.map((b) => ({
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
          data: { ...data, available: Math.max(0, copies - book.loans.length) },
        });
        return NextResponse.json({ id: book.id });
      }
      const book = await db.book.create({ data: { ...data, available: copies } });
      return NextResponse.json({ id: book.id });
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
      await db.$transaction([
        db.bookLoan.update({
          where: { id: loanId },
          data: { status: 'RETURNED', returnDate: today },
        }),
        db.book.update({ where: { id: loan.bookId }, data: { available: { increment: 1 } } }),
      ]);
      return NextResponse.json({ ok: true });
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
