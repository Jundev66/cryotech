import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  color?: string;
  className?: string;
}

export function StatCard({ title, value, subtitle, icon: Icon, color = 'bg-primary/10 text-primary', className }: StatCardProps) {
  return (
    <Card className={cn('relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg', className)}>
      <div className="border-t-2 border-current opacity-20 absolute top-0 inset-x-0" style={{ color: 'var(--color-primary)' }} />
      <div className="px-6 pt-5 pb-4">
        <div className="flex items-center justify-between mb-3">
          <div className={cn('flex h-9 w-9 items-center justify-center rounded-xl', color)}>
            <Icon className="h-4.5 w-4.5 animate-float" />
          </div>
        </div>
        <div className="font-mono text-3xl font-extrabold tracking-tight">{value}</div>
        <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground font-medium">{title}</p>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </Card>
  );
}
