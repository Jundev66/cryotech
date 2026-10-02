import React from 'react';
import { Button } from './button';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (newPage: number) => void;
  itemName?: string;
  className?: string;
}

export function PaginationControls({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  itemName = 'registros',
  className = '',
}: PaginationControlsProps) {
  if (totalItems <= 0) return null;

  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalItems);

  // Generate page numbers with ellipsis
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('ellipsis');
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      if (page < totalPages - 2) pages.push('ellipsis');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 py-4 px-2 text-sm text-muted-foreground ${className}`}>
      <div className="text-xs sm:text-sm font-medium">
        Mostrando <span className="font-semibold text-foreground">{startItem}</span> a{' '}
        <span className="font-semibold text-foreground">{endItem}</span> de{' '}
        <span className="font-semibold text-foreground">{totalItems}</span> {itemName}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 text-xs"
            onClick={() => onPageChange(1)}
            disabled={page <= 1}
            title="Primera página"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 text-xs"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            title="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-1">
            {getPageNumbers().map((p, idx) =>
              p === 'ellipsis' ? (
                <span key={`ellipsis-${idx}`} className="px-1 text-xs select-none">
                  …
                </span>
              ) : (
                <Button
                  key={`page-${p}`}
                  variant={p === page ? 'default' : 'outline'}
                  size="icon"
                  className={`h-8 w-8 text-xs font-medium transition-colors ${
                    p === page ? 'shadow-sm font-semibold' : ''
                  }`}
                  onClick={() => onPageChange(p)}
                >
                  {p}
                </Button>
              ),
            )}
          </div>

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 text-xs"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            title="Página siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 text-xs"
            onClick={() => onPageChange(totalPages)}
            disabled={page >= totalPages}
            title="Última página"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
