export type ChatIntentType =
  | 'daily_log'
  | 'sale'
  | 'payment'
  | 'processing'
  | 'expense'
  | 'entry'
  | 'help'
  | 'unknown';

export interface ParsedAssistantMessage {
  intent: ChatIntentType;
  confidence: number;
  summary: string;
  data: Record<string, unknown>;
  missingFields: string[];
}

const NUMBER_WORDS: Record<string, number> = {
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  quince: 15,
  veinte: 20,
  cincuenta: 50,
  cien: 100,
};

export function parseUserMessage(text: string): ParsedAssistantMessage {
  // Normalize accents so "vendí" -> "vendi", "murió" -> "murio"
  // Normalize comma decimals "2,7" -> "2.7" but preserve dots between digits
  const clean = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/(\d+),(\d+)/g, '$1.$2')
    .replace(/[^a-z0-9.\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 1. VENTA / COBRO DE POLLOS
  // Matches "vendi 1 pollo", "venta de 2 pollos", "despache...",
  // or "cobrar el pollo de Mercedes de 2.7" / "cobro del pollo de..."
  const hasChickenTerm = clean.includes('pollo') || clean.includes('ave') || clean.includes('animal');
  const isSaleVerb =
    clean.includes('vendi') ||
    clean.includes('venta') ||
    clean.includes('despach') ||
    clean.includes('entreg') ||
    clean.includes('tiene') ||
    clean.includes('llevo') ||
    clean.includes('lleva') ||
    clean.includes('compro') ||
    clean.includes('pidio') ||
    clean.includes('debe');
  const isChickenCollection = (clean.includes('cobr') || clean.includes('pago')) && hasChickenTerm;

  const isSale = isSaleVerb || isChickenCollection;

  if (isSale) {
    const data: Record<string, unknown> = {
      saleType:
        clean.includes('beneficiado') || clean.includes('muerto') || clean.includes('faenado') || clean.includes('cava')
          ? 'dead'
          : 'live',
      paymentStatus:
        clean.includes('fiad') || clean.includes('debe') || clean.includes('credito')
          ? 'pending'
          : isChickenCollection || clean.includes('pago') || clean.includes('contado')
          ? 'paid'
          : 'pending',
    };

    // Quantity of chickens
    const qtyExplicit = clean.match(/(\d+)\s*(?:pollos?|aves?|animales?|unidades?)/i);
    const qtyVerb = clean.match(/(?:vendi|venta de|despache)\s*(\d+)/i);

    if (qtyExplicit) {
      data.quantity = parseInt(qtyExplicit[1], 10);
    } else if (qtyVerb) {
      data.quantity = parseInt(qtyVerb[1], 10);
    } else {
      // Check word numbers: "un pollo", "dos pollos"
      const wordMatch = clean.match(/\b(un|una|uno|dos|tres|cuatro|cinco|diez)\b\s*(?:pollos?|aves?|animales?)?/i);
      if (wordMatch && NUMBER_WORDS[wordMatch[1]]) {
        data.quantity = NUMBER_WORDS[wordMatch[1]];
      } else if (hasChickenTerm && (clean.includes('el pollo') || clean.includes('un pollo'))) {
        data.quantity = 1;
      }
    }

    // Weight in kg (handles "2.7kg", "2.7 kilos", "peso 2.7", "de 2.7", etc.)
    const kgMatch =
      clean.match(/(?:peso\s*)?(\d+(?:\.\d+)?)\s*(?:kg|kilos?|k)\b/i) ||
      clean.match(/(?:de|pesa|peso)\s*(\d+(?:\.\d+)?)(?!\s*\$|\s*usd|\s*bs)/i) ||
      clean.match(/\b(\d+\.\d+)\b(?!\s*\$|\s*usd|\s*bs)/i);

    if (kgMatch) {
      let w = parseFloat(kgMatch[1]);
      if (w >= 1000 && /^\d+\.\d{3}$/.test(kgMatch[1])) {
        w = w / 1000;
      }
      data.weightKg = w;
    }

    // Price per kg ($ or bs)
    const priceMatch =
      clean.match(/(?:a|precio)\s*\$?\s*(\d+(?:\.\d+)?)\s*(?:\$|usd|el kilo|dolares|kilo)?/i) ||
      clean.match(/\$\s*(\d+(?:\.\d+)?)/i);
    if (priceMatch) {
      data.pricePerKg = parseFloat(priceMatch[1]);
    } else {
      data.pricePerKg = 4.5; // Standard fallback
    }

    // Client name:
    // First check before verb: e.g. "Mercedes tiene...", "Abuela Maria se llevo..."
    const beforeVerbMatch = clean.match(/^([a-z]+(?:\s+[a-z]+)?)\s+(?:tiene|se llevo|llevo|compro|pidio|debe)\b/i);
    if (beforeVerbMatch) {
      data.clientName = beforeVerbMatch[1].trim();
    } else {
      // "a Mercedes", "para Carlos", "cliente Maria", "de Mercedes"
      const clientMatch = clean.match(/(?:a|para|cliente|de)\s+([a-z]+(?:\s+[a-z]+)?)/i);
      const ignoreWords = ['el', 'la', 'los', 'un', 'una', 'pie', 'beneficiado', 'fiado', 'contado', 'hoy', 'ayer', 'pollo', 'cava', 'galpon'];
      if (clientMatch && !ignoreWords.includes(clientMatch[1].toLowerCase().trim())) {
        data.clientName = clientMatch[1].trim();
      }
    }

    const missingFields: string[] = [];
    if (!data.quantity) missingFields.push('quantity');
    if (!data.weightKg) missingFields.push('weightKg');

    const kindLabel = data.saleType === 'dead' ? 'beneficiados' : 'en pie';
    const payLabel = data.paymentStatus === 'paid' ? 'pagado de contado' : 'fiado';

    return {
      intent: 'sale',
      confidence: 0.88,
      summary: `Venta de ${data.quantity || '?'} pollos (${kindLabel}, ${payLabel})`,
      data,
      missingFields,
    };
  }

  // 2. MORTALIDAD / CONSUMO / REGISTRO DIARIO
  const isDailyLog =
    clean.includes('muri') ||
    clean.includes('muert') ||
    clean.includes('baja') ||
    clean.includes('consum') ||
    clean.includes('alimento') ||
    clean.includes('peso promedio') ||
    clean.includes('sin novedad') ||
    (clean.includes('kilo') && (clean.includes('comieron') || clean.includes('dia')));

  if (isDailyLog) {
    const data: Record<string, unknown> = {};

    // Extract mortality count
    const mortMatch =
      clean.match(/(?:murieron|muertos?|bajas?|cayeron)\s*(\d+)/i) ||
      clean.match(/(\d+)\s*(?:muertos?|bajas?|pollos? muertos?)/i);
    if (mortMatch) {
      data.mortality = parseInt(mortMatch[1], 10);
    } else if (
      clean.includes('sin bajas') ||
      clean.includes('sin baja') ||
      clean.includes('cero bajas') ||
      clean.includes('cero baja') ||
      clean.includes('0 bajas') ||
      clean.includes('0 baja') ||
      clean.includes('sin novedad') ||
      clean.includes('murieron 0') ||
      clean.includes('0 muertes') ||
      clean.includes('0 muertos')
    ) {
      data.mortality = 0;
    }

    // Extract feed consumed
    const feedMatch =
      clean.match(/(?:consumieron|consumo|alimento|comieron)\s*(\d+(?:\.\d+)?)\s*(?:kg|kilos|sacos)?/i) ||
      clean.match(/(\d+(?:\.\d+)?)\s*(?:kg|kilos)\s*(?:de alimento)?/i);
    if (feedMatch) {
      data.feedConsumedKg = parseFloat(feedMatch[1]);
    }

    // Extract average weight
    const weightMatch = clean.match(/(?:peso|promedio)\s*(?:de)?\s*(\d+(?:\.\d+)?)\s*(?:kg|g|gr|gramos)?/i);
    if (weightMatch) {
      const val = parseFloat(weightMatch[1]);
      data.averageWeightG = val < 20 ? Math.round(val * 1000) : val; // Normalize kg to grams
    }

    const summaryParts = [];
    if (data.mortality !== undefined) summaryParts.push(`${data.mortality} bajas`);
    if (data.feedConsumedKg !== undefined) summaryParts.push(`${data.feedConsumedKg} kg alimento`);
    if (data.averageWeightG !== undefined) summaryParts.push(`peso ${data.averageWeightG}g`);

    return {
      intent: 'daily_log',
      confidence: 0.9,
      summary: summaryParts.length > 0 ? summaryParts.join(', ') : 'Registro diario',
      data,
      missingFields: data.mortality === undefined && data.feedConsumedKg === undefined ? ['mortality', 'feedConsumedKg'] : [],
    };
  }

  // 3. COBRANZA MONETARIA / PAGO DE CUENTA (sin aves de por medio)
  const isPayment =
    clean.includes('cobr') ||
    clean.includes('pago') ||
    clean.includes('abono') ||
    clean.includes('cancel');

  if (isPayment) {
    const data: Record<string, unknown> = {};

    // USD Amount
    const usdMatch =
      clean.match(/(\d+(?:\.\d+)?)\s*(?:\$|usd|dolares)/i) ||
      clean.match(/\$\s*(\d+(?:\.\d+)?)/i);
    if (usdMatch) {
      data.amount = parseFloat(usdMatch[1]);
      data.currency = 'USD';
    }

    // Bs Amount
    const bsMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:bs|bolivares)/i);
    if (bsMatch && !usdMatch) {
      data.amountBs = parseFloat(bsMatch[1]);
      data.currency = 'VES';
    }

    // Plain amount if verb was cobré / abonó (e.g. "cobré 50 a Carlos")
    if (!data.amount && !data.amountBs) {
      const plainMatch = clean.match(/(?:cobre|abono|recibi|pago)\s*(\d+(?:\.\d+)?)/i);
      if (plainMatch) {
        data.amount = parseFloat(plainMatch[1]);
        data.currency = 'USD';
      }
    }

    // Client name
    const clientMatch = clean.match(/(?:de|del cliente|pago de|a)\s+([a-z]+(?:\s+[a-z]+)?)/i);
    if (clientMatch && !['el', 'la', 'un', 'una', 'cuenta', 'saldo', 'total', 'todo'].includes(clientMatch[1].toLowerCase().trim())) {
      data.clientName = clientMatch[1].trim();
    }

    return {
      intent: 'payment',
      confidence: 0.85,
      summary: `Cobro de ${data.amount ? `$${data.amount}` : data.amountBs ? `Bs ${data.amountBs}` : 'monto'}`,
      data,
      missingFields: !data.amount && !data.amountBs ? ['amount'] : [],
    };
  }

  return {
    intent: 'unknown',
    confidence: 0,
    summary: 'No entendí el mensaje',
    data: {},
    missingFields: [],
  };
}
