import { useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BATCH_STATUSES, BATCH_STATUS_LABELS, BATCH_STATUS_COLORS, formatDate } from '@cryotech/shared-types';
import { batchesApi } from '@/api/batches.api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Eye } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { useListSearch } from '@/hooks/use-list-search';

const PAGE_SIZE = 10;

export default function BatchesPage() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);

  const { value: searchValue, setValue: setSearchValue, search } = useListSearch();
  const { data: batches, isLoading } = useQuery({
    queryKey: ['batches', { search }],
    queryFn: () => batchesApi.findAll({ search }),
    placeholderData: keepPreviousData,
  });

  const filtered = batches?.filter(
    (b) => statusFilter === 'all' || b.status === statusFilter,
  ) ?? [];

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const paginatedBatches = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleFilterChange = (val: string) => {
    setStatusFilter(val);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Lotes" subtitle="Gestión y seguimiento de lotes de aves">
        <Button asChild data-testid="new-batch">
          <Link to="/dashboard/batches/new">
            <Plus className="mr-2 h-4 w-4" /> Nuevo Lote
          </Link>
        </Button>
      </PageHeader>

      <SearchInput
        value={searchValue}
        onChange={(val) => {
          setSearchValue(val);
          setPage(1);
        }}
        placeholder="Buscar por código, raza o galpón..."
        label="Buscar lotes"
        className="sm:max-w-sm"
        data-testid="batches-search"
      />

      <Tabs value={statusFilter} onValueChange={handleFilterChange}>
        <TabsList>
          <TabsTrigger value="all">Todos</TabsTrigger>
          {BATCH_STATUSES.map((s) => (
            <TabsTrigger key={s} value={s}>{BATCH_STATUS_LABELS[s]}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={statusFilter}>
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="space-y-2 p-4">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : filtered.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">No hay lotes registrados</p>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Raza</TableHead>
                        <TableHead>Galpón</TableHead>
                        <TableHead className="text-right">Aves Actuales</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Fecha Inicio</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedBatches.map((batch) => (
                        <TableRow key={batch.id} data-testid="batch-row" data-code={batch.code ?? ''}>
                          <TableCell className="text-muted-foreground text-xs font-mono">{batch.code ?? '-'}</TableCell>
                          <TableCell className="font-medium">{batch.breed}</TableCell>
                          <TableCell>{batch.warehouse?.name || '-'}</TableCell>
                          <TableCell className="text-right" data-testid="batch-row-quantity">
                            {batch.currentQuantity.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={BATCH_STATUS_COLORS[batch.status]}>
                              {BATCH_STATUS_LABELS[batch.status]}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDate(batch.startDate)}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" asChild>
                              <Link to={`/dashboard/batches/${batch.id}`}>
                                <Eye className="mr-1 h-4 w-4" /> Ver Ficha
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <PaginationControls
                    page={page}
                    totalPages={totalPages}
                    totalItems={filtered.length}
                    pageSize={PAGE_SIZE}
                    onPageChange={setPage}
                    itemName="lotes"
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
