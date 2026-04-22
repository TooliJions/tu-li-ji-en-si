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
  it('shows main navigation links', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar currentBook={currentBook} />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: '仪表盘' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '我的书籍' })).toHaveAttribute('href', '/chapters');
    expect(screen.getByRole('link', { name: '创作' })).toHaveAttribute(
      'href',
      '/writing?bookId=book-001'
    );
    expect(screen.getByRole('link', { name: '伏笔面板' })).toHaveAttribute(
      'href',
      '/hooks?bookId=book-001'
    );
    expect(screen.getByRole('link', { name: '数据分析' })).toHaveAttribute(
      'href',
      '/analytics?bookId=book-001'
    );
  });
  it('shows active book progress information', () => {
    render(
      <MemoryRouter>
        <Sidebar currentBook={currentBook} />
      </MemoryRouter>
    );

    expect(screen.getByText(/12%/)).toBeTruthy();
  });

  it('builds workspace links with the current book id', () => {
    render(
      <MemoryRouter>
        <Sidebar currentBook={currentBook} />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: '真相文件' })).toHaveAttribute(
      'href',
      '/truth-files?bookId=book-001'
    );
    expect(screen.getByRole('link', { name: '守护进程' })).toHaveAttribute(
      'href',
      '/daemon?bookId=book-001'
    );
    expect(screen.getByRole('link', { name: '自然Agent' })).toHaveAttribute(
      'href',
      '/natural-agent?bookId=book-001'
    );
    expect(screen.getByRole('link', { name: '提示词版本' })).toHaveAttribute(
      'href',
      '/prompts/book-001'
    );
  });
});
