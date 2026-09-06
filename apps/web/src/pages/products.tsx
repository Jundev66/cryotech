import { useState } from 'react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Loader2, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { useListSearch } from '@/hooks/use-list-search';
import { apiMessage } from '@/lib/api-error';
import { toast } from 'sonner';

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const { value: searchValue, setValue: setSearchValue, search } = useListSearch();
  const { data: products, isLoading } = useQuery({
    queryKey: ['products', { search }],
    queryFn: () => productsApi.findAll({ search }),
    placeholderData: keepPreviousData,
  });
  const { data: categories } = useQuery({ queryKey: ['product-categories'], queryFn: productCategoriesApi.findAll });
  const { data: units } = useQuery({ queryKey: ['measurement-units'], queryFn: measurementUnitsApi.findAll });

  const createMutation = useMutation({
    mutationFn: (data: ProductInput) => editing
      ? productsApi.update(editing.id, data)
      : productsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(editing ? 'Producto actualizado' : 'Producto creado');
      setOpen(false);
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
    setOpen(true);
  }

  function onOpenChange(open: boolean) {
    setOpen(open);
    if (!open) { setEditing(null); form.reset(); }
  }

  const filteredProducts = products?.filter(
    (p) => typeFilter === 'all' || p.productType === typeFilter
  ) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Productos e Insumos" subtitle="Inventario de productos">
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Nuevo Producto</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? 'Editar Producto' : 'Nuevo Producto'}</DialogTitle></DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>Nombre</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="categoryId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoria</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger className="w-full" data-testid="product-category"><SelectValue placeholder="Seleccionar categoria" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {categories?.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="productType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
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
                    <FormLabel>Unidad</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger className="w-full" data-testid="product-unit"><SelectValue placeholder="Seleccionar unidad" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {units?.map((u) => (<SelectItem key={u.id} value={u.id}>{u.name} ({u.abbreviation})</SelectItem>))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="currentStock" render={({ field }) => (
                    <FormItem><FormLabel>Stock actual</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="minStock" render={({ field }) => (
                    <FormItem><FormLabel>Stock minimo</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editing ? 'Actualizar' : 'Crear'}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <SearchInput
        value={searchValue}
        onChange={setSearchValue}
        placeholder="Buscar por codigo, nombre o categoria..."
        label="Buscar productos"
        className="sm:max-w-sm"
        data-testid="products-search"
      />

      <Tabs value={typeFilter} onValueChange={setTypeFilter}>
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
            <p className="py-8 text-center text-muted-foreground">Sin productos registrados</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Codigo</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Min</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-muted-foreground text-xs font-mono">{p.code ?? '-'}</TableCell>
                    <TableCell className="font-medium">
                      {p.name}
                      {p.currentStock <= p.minStock && (
                        <AlertTriangle className="ml-1 inline h-3 w-3 text-amber-500" />
                      )}
                    </TableCell>
                    <TableCell><Badge variant="outline">{p.category?.name ?? '-'}</Badge></TableCell>
                    <TableCell><Badge variant="secondary">{PRODUCT_TYPE_LABELS[p.productType] || p.productType}</Badge></TableCell>
                    <TableCell>{p.measurementUnit?.abbreviation ?? '-'}</TableCell>
                    <TableCell className="text-right">{formatNumber(p.currentStock)}</TableCell>
                    <TableCell className="text-right">{formatNumber(p.minStock)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon-xs" onClick={() => openEdit(p)}><Pencil className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon-xs" onClick={() => deleteMutation.mutate(p.id)}><Trash2 className="h-3 w-3" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
