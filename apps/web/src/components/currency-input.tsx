import { useQuery } from '@tanstack/react-query';
import { exchangeRatesApi } from '@/api/exchange-rates.api';
import { Input } from '@/components/ui/input';
import { formatUsd } from '@cryotech/shared-types';

interface CurrencyInputProps {
  value: number | undefined;
  onChange: (valueBs: number | undefined, exchangeRate: number | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function CurrencyInput({ value, onChange, placeholder = '0.00', disabled }: CurrencyInputProps) {
  const { data: rate } = useQuery({
    queryKey: ['exchange-rates', 'current'],
    queryFn: exchangeRatesApi.getCurrent,
    staleTime: 5 * 60 * 1000,
  });

  const effectiveRate = rate?.effectiveRate ?? 0;
  const usdEquivalent = value && effectiveRate > 0 ? value / effectiveRate : 0;

  return (
    <div className="space-y-1">
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">Bs</span>
        <Input
          type="number"
          step="0.01"
          placeholder={placeholder}
          value={value ?? ''}
          onChange={(e) => {
            const bs = e.target.value ? parseFloat(e.target.value) : undefined;
            onChange(bs, effectiveRate || undefined);
          }}
          className="pl-8"
          disabled={disabled}
        />
      </div>
      {value && effectiveRate > 0 && (
        <p className="text-xs text-muted-foreground">
          ≈ {formatUsd(usdEquivalent)} (tasa: {effectiveRate.toFixed(2)})
        </p>
      )}
    </div>
  );
}
