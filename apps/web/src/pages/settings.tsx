import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { companySchema, exchangeRateConfigSchema, type CompanyInput, type ExchangeRateConfigInput } from '@cryotech/shared-types';
import type { MeasurementUnit, ProductCategoryConfig } from '@cryotech/shared-types';
import { companiesApi } from '@/api/companies.api';
import { usersApi } from '@/api/users.api';
import { exchangeRatesApi } from '@/api/exchange-rates.api';
import { measurementUnitsApi, productCategoriesApi } from '@/api/products.api';
import { useAuth } from '@/providers/auth-provider';
import { useCompany } from '@/providers/company-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Loader2, Building2, User, AlertTriangle, DollarSign, Ruler, Tags, Plus, Trash2, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { apiMessage } from '@/lib/api-error';
import { toast } from 'sonner';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Configuracion" subtitle="Configuracion de empresa, perfil y catalogo" />
      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="units">Unidades</TabsTrigger>
          <TabsTrigger value="categories">Categorias</TabsTrigger>
          <TabsTrigger value="currency">Moneda</TabsTrigger>
          <TabsTrigger value="advanced">Avanzado</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
          <CompanySection />
          <ProfileSection />
        </TabsContent>

        <TabsContent value="units">
          <MeasurementUnitsSection />
        </TabsContent>

        <TabsContent value="categories">
          <ProductCategoriesSection />
        </TabsContent>

        <TabsContent value="currency">
          <ExchangeRateSection />
        </TabsContent>

        <TabsContent value="advanced">
          <DangerZoneSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CompanySection() {
  const { company } = useCompany();
  const [companyLoading, setCompanyLoading] = useState(false);

  const companyForm = useForm<CompanyInput>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      name: company?.name || '',
      phone: company?.phone || '',
      address: company?.address || '',
    },
  });

  async function onCompanySave(values: CompanyInput) {
    if (!company) return;
    setCompanyLoading(true);
    try {
      await companiesApi.update(company.id, values);
      toast.success('Empresa actualizada');
    } catch {
      toast.error('Error al actualizar empresa');
    } finally {
      setCompanyLoading(false);
    }
  }

  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <CardTitle className="font-display">Informacion de la Empresa</CardTitle>
        </div>
        <CardDescription>Datos basicos de tu empresa avicola</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...companyForm}>
          <form onSubmit={companyForm.handleSubmit(onCompanySave)} className="space-y-4">
            <FormField control={companyForm.control} name="name" render={({ field }) => (
              <FormItem><FormLabel>Nombre</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={companyForm.control} name="phone" render={({ field }) => (
              <FormItem><FormLabel>Telefono</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={companyForm.control} name="address" render={({ field }) => (
              <FormItem><FormLabel>Direccion</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <Button type="submit" disabled={companyLoading}>
              {companyLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar cambios
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function ProfileSection() {
  const { user, setUser } = useAuth();
  const [profileLoading, setProfileLoading] = useState(false);

  const profileForm = useForm({
    defaultValues: {
      fullName: user?.fullName || '',
      phone: user?.phone || '',
    },
  });

  async function onProfileSave(values: { fullName: string; phone: string }) {
    setProfileLoading(true);
    try {
      const updated = await usersApi.updateProfile(values);
      setUser(updated);
      toast.success('Perfil actualizado');
    } catch {
      toast.error('Error al actualizar perfil');
    } finally {
      setProfileLoading(false);
    }
  }

  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader>
        <div className="flex items-center gap-2">
          <User className="h-5 w-5 text-primary" />
          <CardTitle className="font-display">Perfil</CardTitle>
        </div>
        <CardDescription>Tu informacion personal</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={profileForm.handleSubmit(onProfileSave)} className="space-y-4">
          <div>
            <label className="text-sm font-medium">Nombre completo</label>
            <Input {...profileForm.register('fullName')} />
          </div>
          <div>
            <label className="text-sm font-medium">Telefono</label>
            <Input {...profileForm.register('phone')} />
          </div>
          <div>
            <label className="text-sm font-medium">Email</label>
            <Input value={user?.email || ''} disabled />
            <p className="mt-1 text-xs text-muted-foreground">El email no se puede cambiar</p>
          </div>
          <Button type="submit" disabled={profileLoading}>
            {profileLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Actualizar perfil
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function MeasurementUnitsSection() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [editingUnit, setEditingUnit] = useState<MeasurementUnit | null>(null);
  const [editName, setEditName] = useState('');
  const [editAbbr, setEditAbbr] = useState('');
  const [newName, setNewName] = useState('');
  const [newAbbr, setNewAbbr] = useState('');

  const { data: units, isLoading } = useQuery({
    queryKey: ['measurement-units'],
    queryFn: measurementUnitsApi.findAll,
  });

  const createMutation = useMutation({
    mutationFn: () => measurementUnitsApi.create({ name: newName, abbreviation: newAbbr }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['measurement-units'] });
      setNewName('');
      setNewAbbr('');
      toast.success('Unidad creada');
    },
    onError: (error) => toast.error(apiMessage(error, 'Error al crear unidad')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name: string; abbreviation: string } }) =>
      measurementUnitsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['measurement-units'] });
      setEditingUnit(null);
      toast.success('Unidad actualizada');
    },
    onError: (error) => toast.error(apiMessage(error, 'Error al actualizar unidad')),
  });

  const deleteMutation = useMutation({
    mutationFn: measurementUnitsApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['measurement-units'] });
      toast.success('Unidad eliminada');
    },
    onError: (error) => toast.error(apiMessage(error, 'No se puede eliminar una unidad en uso')),
  });

  const filtered = units?.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.abbreviation.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  function startEdit(unit: MeasurementUnit) {
    setEditingUnit(unit);
    setEditName(unit.name);
    setEditAbbr(unit.abbreviation);
  }

  function saveEdit() {
    if (!editingUnit) return;
    updateMutation.mutate({ id: editingUnit.id, data: { name: editName, abbreviation: editAbbr } });
  }

  return (
    <Card className="border-l-4 border-l-blue-500">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ruler className="h-5 w-5 text-blue-500" />
            <CardTitle className="font-display">Unidades de Medida</CardTitle>
          </div>
          <Badge variant="secondary">{units?.length ?? 0}</Badge>
        </div>
        <CardDescription>Configura las unidades de medida disponibles para tus productos</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input placeholder="Buscar unidad..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <div className="flex-1" />
          <Dialog>
            <DialogTrigger asChild>
              <Button><Plus className="mr-1 h-4 w-4" /> Nueva Unidad</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nueva Unidad de Medida</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <label className="text-sm font-medium">Nombre</label>
                  <Input placeholder="Ej: Kilogramos" value={newName} onChange={(e) => setNewName(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Abreviatura</label>
                  <Input placeholder="Ej: kg" value={newAbbr} onChange={(e) => setNewAbbr(e.target.value)} />
                </div>
                <Button onClick={() => createMutation.mutate()} disabled={!newName || !newAbbr || createMutation.isPending} className="w-full">
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Crear Unidad
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            {search ? 'Sin resultados' : 'Sin unidades de medida'}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Abreviatura</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((unit) => (
                <TableRow key={unit.id}>
                  <TableCell>
                    {editingUnit?.id === unit.id ? (
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8" />
                    ) : (
                      <span className="font-medium">{unit.name}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingUnit?.id === unit.id ? (
                      <Input value={editAbbr} onChange={(e) => setEditAbbr(e.target.value)} className="h-8 w-24" />
                    ) : (
                      <Badge variant="secondary">{unit.abbreviation}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    {editingUnit?.id === unit.id ? (
                      <>
                        <Button variant="outline" size="sm" onClick={saveEdit} disabled={updateMutation.isPending}>
                          Guardar
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditingUnit(null)}>
                          Cancelar
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="ghost" size="icon-xs" onClick={() => startEdit(unit)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon-xs">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Eliminar unidad</AlertDialogTitle>
                              <AlertDialogDescription>
                                Estas seguro de eliminar "{unit.name}"? No se puede eliminar si tiene productos asociados.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction variant="destructive" onClick={() => deleteMutation.mutate(unit.id)}>
                                Eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ProductCategoriesSection() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [editingCat, setEditingCat] = useState<ProductCategoryConfig | null>(null);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');

  const { data: categories, isLoading } = useQuery({
    queryKey: ['product-categories'],
    queryFn: productCategoriesApi.findAll,
  });

  const createMutation = useMutation({
    mutationFn: () => productCategoriesApi.create({ name: newName, slug: newSlug }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-categories'] });
      setNewName('');
      setNewSlug('');
      toast.success('Categoria creada');
    },
    onError: (error) => toast.error(apiMessage(error, 'Error al crear categoria')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name: string; slug: string } }) =>
      productCategoriesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-categories'] });
      setEditingCat(null);
      toast.success('Categoria actualizada');
    },
    onError: (error) => toast.error(apiMessage(error, 'Error al actualizar categoria')),
  });

  const deleteMutation = useMutation({
    mutationFn: productCategoriesApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-categories'] });
      toast.success('Categoria eliminada');
    },
    onError: (error) => toast.error(apiMessage(error, 'No se puede eliminar una categoria en uso')),
  });

  const filtered = categories?.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.slug.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  function handleNewNameChange(name: string) {
    setNewName(name);
    setNewSlug(name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''));
  }

  function startEdit(cat: ProductCategoryConfig) {
    setEditingCat(cat);
    setEditName(cat.name);
    setEditSlug(cat.slug);
  }

  function saveEdit() {
    if (!editingCat) return;
    updateMutation.mutate({ id: editingCat.id, data: { name: editName, slug: editSlug } });
  }

  return (
    <Card className="border-l-4 border-l-violet-500">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tags className="h-5 w-5 text-violet-500" />
            <CardTitle className="font-display">Categorias de Producto</CardTitle>
          </div>
          <Badge variant="secondary">{categories?.length ?? 0}</Badge>
        </div>
        <CardDescription>Configura las categorias disponibles para clasificar tus productos</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input placeholder="Buscar categoria..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <div className="flex-1" />
          <Dialog>
            <DialogTrigger asChild>
              <Button><Plus className="mr-1 h-4 w-4" /> Nueva Categoria</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nueva Categoria de Producto</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <label className="text-sm font-medium">Nombre</label>
                  <Input placeholder="Ej: Vacunas" value={newName} onChange={(e) => handleNewNameChange(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Slug</label>
                  <Input placeholder="Ej: vacunas" value={newSlug} onChange={(e) => setNewSlug(e.target.value)} />
                  <p className="mt-1 text-xs text-muted-foreground">Identificador unico, se genera automaticamente</p>
                </div>
                <Button onClick={() => createMutation.mutate()} disabled={!newName || !newSlug || createMutation.isPending} className="w-full">
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Crear Categoria
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            {search ? 'Sin resultados' : 'Sin categorias'}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell>
                    {editingCat?.id === cat.id ? (
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8" />
                    ) : (
                      <span className="font-medium">{cat.name}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingCat?.id === cat.id ? (
                      <Input value={editSlug} onChange={(e) => setEditSlug(e.target.value)} className="h-8 w-32" />
                    ) : (
                      <Badge variant="outline">{cat.slug}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    {editingCat?.id === cat.id ? (
                      <>
                        <Button variant="outline" size="sm" onClick={saveEdit} disabled={updateMutation.isPending}>
                          Guardar
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditingCat(null)}>
                          Cancelar
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="ghost" size="icon-xs" onClick={() => startEdit(cat)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon-xs">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Eliminar categoria</AlertDialogTitle>
                              <AlertDialogDescription>
                                Estas seguro de eliminar "{cat.name}"? No se puede eliminar si tiene productos asociados.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction variant="destructive" onClick={() => deleteMutation.mutate(cat.id)}>
                                Eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ExchangeRateSection() {
  const queryClient = useQueryClient();

  const { data: currentRate, isLoading: rateLoading } = useQuery({
    queryKey: ['exchange-rates', 'current'],
    queryFn: exchangeRatesApi.getCurrent,
    staleTime: 5 * 60 * 1000,
  });

  const { data: config } = useQuery({
    queryKey: ['exchange-rates', 'config'],
    queryFn: exchangeRatesApi.getConfig,
  });

  const form = useForm<ExchangeRateConfigInput>({
    resolver: zodResolver(exchangeRateConfigSchema),
    values: config ? {
      rateSource: config.rateSource,
      customRate: config.customRate ?? undefined,
      autoFetch: config.autoFetch,
    } : {
      rateSource: 'bcv',
      autoFetch: true,
    },
  });

  const updateMutation = useMutation({
    mutationFn: exchangeRatesApi.updateConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exchange-rates'] });
      toast.success('Configuracion de tasa actualizada');
    },
    onError: (error) => toast.error(apiMessage(error, 'Error al actualizar configuracion')),
  });

  const rateSource = form.watch('rateSource');

  return (
    <Card className="border-l-4 border-l-amber-500">
      <CardHeader>
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" />
          <CardTitle className="font-display">Moneda y Tasa de Cambio</CardTitle>
        </div>
        <CardDescription>Configura la tasa Bs/USD para tus registros financieros</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Tasa actual</span>
            {rateLoading ? (
              <Skeleton className="h-6 w-24" />
            ) : currentRate ? (
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold">{currentRate.effectiveRate.toFixed(2)} Bs/$</span>
                <Badge variant="secondary" className="text-xs">{currentRate.source.toUpperCase()}</Badge>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">No disponible</span>
            )}
          </div>
          {currentRate?.bcvRate && (
            <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
              <span>BCV: {currentRate.bcvRate.toFixed(2)}</span>
              {currentRate.parallelRate && <span>Paralelo: {currentRate.parallelRate.toFixed(2)}</span>}
            </div>
          )}
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => updateMutation.mutate(v))} className="space-y-4">
            <FormField control={form.control} name="rateSource" render={({ field }) => (
              <FormItem>
                <FormLabel>Fuente de tasa</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger className="w-full"><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="bcv">BCV (Banco Central de Venezuela)</SelectItem>
                    <SelectItem value="parallel">Paralelo</SelectItem>
                    <SelectItem value="custom">Tasa personalizada</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            {rateSource === 'custom' && (
              <FormField control={form.control} name="customRate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Tasa personalizada (Bs/$)</FormLabel>
                  <FormControl><Input type="number" step="0.01" placeholder="Ej: 90.50" {...field} /></FormControl>
                  <p className="text-xs text-muted-foreground">Esta tasa se usara para todos los calculos de conversion</p>
                  <FormMessage />
                </FormItem>
              )} />
            )}

            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar configuracion
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function DangerZoneSection() {
  const { company } = useCompany();
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function onDeleteCompany() {
    if (!company) return;
    setDeleteLoading(true);
    try {
      await companiesApi.remove(company.id);
      toast.success('Empresa eliminada');
      localStorage.removeItem('cryotech_company_id');
      window.location.href = '/onboarding';
    } catch {
      toast.error('Error al eliminar empresa');
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <Card className="border-l-4 border-l-destructive bg-destructive/5">
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <CardTitle className="font-display text-destructive">Zona de Peligro</CardTitle>
        </div>
        <CardDescription>Acciones irreversibles</CardDescription>
      </CardHeader>
      <CardContent>
        <Separator className="mb-4" />
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Eliminar empresa</p>
            <p className="text-sm text-muted-foreground">Esto eliminara todos los datos de la empresa permanentemente</p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Eliminar empresa</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Estas seguro?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta accion no se puede deshacer. Se eliminaran todos los lotes, registros, ventas y demas datos de la empresa.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={onDeleteCompany} disabled={deleteLoading}>
                  {deleteLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Si, eliminar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
