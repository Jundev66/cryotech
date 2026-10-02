export interface ChatBotMessage {
  id: string;
  sender: 'assistant' | 'user';
  text: string;
  buttons?: Array<{ id: string; label: string; action: string; variant?: 'primary' | 'secondary' | 'danger' }>;
  draftCard?: {
    title: string;
    badge: string;
    items: { label: string; value: string; highlight?: boolean }[];
    totalUsd: string;
    totalBs: string;
  };
}

export const MOBILE_APP_MODULES = [
  {
    id: 'assistant',
    title: 'Chatbot Propio Integrado',
    subtitle: 'Asistente nativo en la app',
    badge: 'Cero WhatsApp / Telegram',
    iconName: 'Bot',
    description:
      'CryoTech tiene su propio chatbot conversacional dentro de la app móvil. No dependes de apps externas, números bloqueables ni plantillas de Meta.',
    highlights: [
      'Doble modo: Modo Rápido por botones táctiles o Modo IA conversacional',
      'Atajos directos: Venta rápida, Registro de hoy, Stock de aves y Tasa BCV',
      'Pre-asientos contables con confirmación en un toque',
      'Funciona offline guardando borradores en cola local',
    ],
  },
  {
    id: 'bcv-rates',
    title: 'Tasa BCV Oficial en Cabecera',
    subtitle: 'Protección anti-arbitraje',
    badge: 'En Tiempo Real',
    iconName: 'DollarSign',
    description:
      'La cabecera de la app móvil muestra la tasa oficial del Banco Central de Venezuela actualizada. Cada venta en bolívares y compra en dólares se liquida a la tasa exacta.',
    highlights: [
      'Scraping directo sin APIs de terceros con retraso de 5 Bs/USD',
      'Cálculo bi-monetario instantáneo ($ y Bs) en cada transacción',
      'Elimina pérdidas invisibles por usar tasas aproximadas',
    ],
  },
  {
    id: 'register-hub',
    title: 'Hub de Registro Rápido',
    subtitle: 'Operaciones en el corral',
    badge: 'Mobile-First',
    iconName: 'ClipboardList',
    description:
      'Pantalla táctil pensada para operarios en galpón: botones grandes para ingresar kilos de alimento, pesaje de muestras, bajas del día y despacho de aves.',
    highlights: [
      'Registro por etapas de alimento: Pre-iniciador, Iniciador, Engorde',
      'Cálculo automático de mortalidad acumulada y alertas de pico',
      'Descuento directo del inventario del lote activo',
    ],
  },
  {
    id: 'reports-curves',
    title: 'Curvas Genéticas & FCR',
    subtitle: 'Analítica de engorde',
    badge: 'Cobb 500 & Ross 308',
    iconName: 'TrendingUp',
    description:
      'Gráficas de peso acumulado vs estándar mundial de la raza. Conoce si tu lote está convirtiendo el alimento en carne eficientemente día por día.',
    highlights: [
      'Índice de Conversión Alimenticia (FCR) proyectado y real',
      'Comparativa de ganancia de gramos diarios vs tabla genética',
      'Proyección de fecha óptima de cosecha y peso objetivo',
    ],
  },
];

export const REAL_SCREENSHOTS = [
  {
    id: 'dashboard',
    title: 'Dashboard General',
    category: 'Visión General',
    description:
      'Métricas en tiempo real: población total, conversión promedio (FCR), mortalidad acumulada y saldo de tesorería en ambas monedas.',
    lightSrc: '/screenshots/dashboard.png',
    darkSrc: '/screenshots/dashboard-dark.png',
  },
  {
    id: 'batch-detail',
    title: 'Ficha del Lote',
    category: 'Producción & Crianza',
    description:
      'Seguimiento día a día por etapas (Iniciador, Crecimiento, Engorde), pesajes de control y evolución de costos reales imputados.',
    lightSrc: '/screenshots/batch-detail.png',
    darkSrc: '/screenshots/batch-detail-dark.png',
  },
  {
    id: 'reports',
    title: 'Reportes y Curvas de Raza',
    category: 'Analítica',
    description:
      'Curvas de ganancia de peso diaria comparadas en tiempo real contra los estándares genéticos mundiales Cobb 500 y Ross 308.',
    lightSrc: '/screenshots/reports.png',
    darkSrc: '/screenshots/reports-dark.png',
  },
  {
    id: 'sales',
    title: 'Ventas y Cobranzas',
    category: 'Comercial',
    description:
      'Control de despachos vivos o beneficiados, cuentas corrientes de clientes, ventas a crédito y abonos parciales.',
    lightSrc: '/screenshots/sales.png',
    darkSrc: '/screenshots/sales-dark.png',
  },
  {
    id: 'treasury',
    title: 'Tesorería Bi-monetaria',
    category: 'Finanzas',
    description:
      'Arqueo de cuentas en bolívares (Pago Móvil, Banesco, Mercantil) y dólares (Efectivo, Zelle), con tasa BCV aplicada por movimiento.',
    lightSrc: '/screenshots/treasury.png',
    darkSrc: '/screenshots/treasury-dark.png',
  },
];
