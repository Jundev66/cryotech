import { useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { productSchema, type ProductInput } from '@cryotech/shared-types';
import { PRODUCT_TYPE_LABELS, formatNumber } from '@cryotech/shared-types';
import type { Product } from '@cryotech/shared-types';
import { productsApi, measurementUnitsApi, productCategoriesApi } from '@/api/products.api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Loader2, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { useListSearch } from '@/hooks/use-list-search';
import { apiMessage } from '@/lib/api-error';
import { toast } from 'sonner';

const PAGE_SIZE = 10;

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  const { value: searchValue, setValue: setSearchValue, search } = useListSearch();
  const { data: products, isLoading } = useQuery({
    queryKey: ['products', { search }],
    queryFn: () => productsApi.findAll({ search }),
    placeholderData: keepPreviousData,
  });
  const { data: categories } = useQuery({ queryKey: ['product-categories'], queryFn: productCategoriesApi.findAll });
  const { data: units } = useQuery({ queryKey: ['measurement-units'], queryFn: measurementUnitsApi.findAll });

  const updateMutation = useMutation({
    mutationFn: (data: ProductInput) => productsApi.update(editing!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Producto actualizado');
      setEditOpen(false);
      setEditing(null);
      form.reset();
    },
    onError: (error) => toast.error(apiMessage(error, 'Error al guardar producto')),
  });

  const deleteMutation = useMutation({
    mutationFn: productsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Producto eliminado');
    },
  });

  const form = useForm<ProductInput>({
    resolver: zodResolver(productSchema),
    defaultValues: { name: '', categoryId: '', productType: 'consumable', unitId: '', currentStock: 0, minStock: 0 },
  });

  function openEdit(product: Product) {
    setEditing(product);
    form.reset({
      name: product.name,
      categoryId: product.categoryId,
      productType: product.productType || 'consumable',
      unitId: product.unitId,
      currentStock: product.currentStock,
      minStock: product.minStock,
    });
    setEditOpen(true);
  }

  const filteredProducts = (products || []).filter(
    (p) => typeFilter === 'all' || p.productType === typeFilter,
  );

  const totalPages = Math.ceil(filteredProducts.length / PAGE_SIZE) || 1;
  const paginatedProducts = filteredProducts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PageHeader title="Productos e Insumos" subtitle="Inventario de alimentos, medicinas y equipos">
        <Button asChild data-testid="new-product">
          <Link to="/dashboard/products/new">
            <Plus className="mr-2 h-4 w-4" /> Nuevo Producto
          </Link>
        </Button>
      </PageHeader>

      <SearchInput
        value={searchValue}
        onChange={(val) => {
          setSearchValue(val);
          setPage(1);
        }}
        placeholder="Buscar por código, nombre..."
        label="Buscar productos"
        className="sm:max-w-sm"
        data-testid="products-search"
      />

      <Tabs
        value={typeFilter}
        onValueChange={(val) => {
          setTypeFilter(val);
          setPage(1);
        }}
      >
        <TabsList>
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="consumable">Consumibles</TabsTrigger>
          <TabsTrigger value="equipment">Equipos</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : filteredProducts.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground" data-testid="products-empty">Sin productos registrados</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Stock Actual</TableHead>
                    <TableHead className="text-right">Stock Mínimo</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedProducts.map((product) => {
                    const isLowStock = Number(product.currentStock) <= Number(product.minStock) && Number(product.minStock) > 0;
                    return (
                      <TableRow key={product.id} data-testid="product-row" data-code={product.code ?? ''}>
                        <TableCell className="text-muted-foreground text-xs font-mono">{product.code ?? '-'}</TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {product.name}
                            {isLowStock && (
                              <Badge variant="destructive" className="gap-1 text-xs">
                                <AlertTriangle className="h-3 w-3" /> Stock Bajo
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{product.category?.name || '-'}</TableCell>
                        <TableCell>{PRODUCT_TYPE_LABELS[product.productType || 'consumable']}</TableCell>
                        <TableCell className="text-right font-medium">{formatNumber(product.currentStock, 2)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatNumber(product.minStock, 2)}</TableCell>
                        <TableCell>{product.measurementUnit?.abbreviation || '-'}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon-xs" onClick={() => openEdit(product)} title="Editar"><Pencil className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="icon-xs" onClick={() => deleteMutation.mutate(product.id)} title="Eliminar"><Trash2 className="h-3 w-3" /></Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <PaginationControls
                page={page}
                totalPages={totalPages}
                totalItems={filteredProducts.length}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
                itemName="productos"
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Dialog para edición rápida */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Producto</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => updateMutation.mutate(v))} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Nombre *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="categoryId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoría *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger className="w-full"><SelectValue placeholder="Seleccionar categoría" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {categories?.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="productType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || 'consumable'}>
                    <FormControl><SelectTrigger className="w-full"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="consumable">Consumible</SelectItem>
                      <SelectItem value="equipment">Equipo</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="unitId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Unidad de Medida *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger className="w-full"><SelectValue placeholder="Seleccionar unidad" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {units?.map((u) => (<SelectItem key={u.id} value={u.id}>{u.name} ({u.abbreviation})</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="currentStock" render={({ field }) => (
                  <FormItem><FormLabel>Stock Actual</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="minStock" render={({ field }) => (
                  <FormItem><FormLabel>Stock Mínimo</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar Cambios
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
