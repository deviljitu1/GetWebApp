import { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
}

const StatCard = ({ icon: Icon, label, value }: StatCardProps) => (
  <Card className="glass-card border-none min-w-0 p-4 sm:p-6 flex items-center gap-3 sm:gap-5 transition-transform duration-300 hover:scale-[1.02]">
    <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10 flex items-center justify-center shrink-0 shadow-sm">
      <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
    </div>
    <div className="min-w-0">
      <p className="text-sm font-medium text-muted-foreground break-words leading-tight">{label}</p>
      <p className="text-2xl font-bold tracking-tight text-foreground break-words leading-tight">{value}</p>
    </div>
  </Card>
);

export default StatCard;
