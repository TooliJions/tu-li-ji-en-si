const SAFE_BOOK_ID_RE = /^[a-zA-Z0-9._-]{1,128}$/;
const PATH_TRAVERSAL_RE = /\.\./;

export function validateBookId(bookId: string): boolean {
  return SAFE_BOOK_ID_RE.test(bookId) && !PATH_TRAVERSAL_RE.test(bookId);
}
