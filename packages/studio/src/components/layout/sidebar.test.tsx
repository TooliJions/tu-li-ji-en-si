import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from './sidebar';

const currentBook = {
  id: 'book-001',
  title: '测试小说',
  chapterCount: 12,
  targetChapterCount: 100,
  status: 'active',
};

describe('Sidebar', () => {
  it('shows simplified navigation links', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar currentBook={currentBook} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: '我的书籍' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: '新建书籍' })).toHaveAttribute('href', '/book-create');
    expect(screen.getByRole('link', { name: '创作' })).toHaveAttribute(
      'href',
      '/writing?bookId=book-001',
    );
    expect(screen.getByRole('link', { name: '导出' })).toHaveAttribute(
      'href',
      '/export?bookId=book-001',
    );
    expect(screen.getByRole('link', { name: '设置' })).toHaveAttribute('href', '/config');
  });

  it('shows active book progress information', () => {
    render(
      <MemoryRouter>
        <Sidebar currentBook={currentBook} />
      </MemoryRouter>,
    );

    expect(screen.getByText(/12%/)).toBeTruthy();
  });
});
