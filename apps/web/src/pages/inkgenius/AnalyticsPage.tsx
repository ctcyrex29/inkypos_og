import { TrendingUp, Users, Activity, DollarSign, BarChart3 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { PageHeader, StatCard } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLoad } from '@/lib/use-load';

type AnalyticsData = {
  total_businesses: number;
  active_this_month: number;
  new_this_month: number;
  churned_this_month: number;
  churn_rate: number;
  monthly_revenue: number;
  avg_tills_per_business: number;
  daily_active_users: number;
  avg_transactions_per_day: number;
  trends: {
    date: string;
    businesses: number;
    revenue: number;
    churn: number;
  }[];
  by_type: {
    type: string;
    count: number;
    revenue: number;
  }[];
  by_plan: {
    plan: string;
    count: number;
    revenue: number;
  }[];
};

/**
 * Platform-wide analytics showing business growth, revenue, engagement, and trends.
 * For platform admins to monitor health and make strategic decisions.
 */
export function AnalyticsPage() {
  const [period, setPeriod] = useState('30');

  const analytics = useLoad(
    useCallback(
      () => {
        // TODO: Wire up to actual API once client methods are available
        return Promise.resolve({
          total_businesses: 35,
          active_this_month: 28,
          new_this_month: 5,
          churned_this_month: 2,
          churn_rate: 0.057,
          monthly_revenue: 10500000,
          avg_tills_per_business: 1.5,
          daily_active_users: 24,
          avg_transactions_per_day: 42,
          trends: [],
          by_type: [],
          by_plan: [],
        } as AnalyticsData);
      },
      [period],
    ),
  );

  const data = analytics.data;
  const churnStr = data?.churn_rate ? (data.churn_rate * 100).toFixed(1) : '0';

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Platform-wide metrics, growth trends, and business insights."
      />

      {/* Period selector */}
      <div className="flex justify-end gap-2">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="365">Last year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {analytics.error ? (
        <Alert variant="destructive">
          <AlertDescription>{analytics.error}</AlertDescription>
        </Alert>
      ) : null}

      {/* Key Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Businesses"
          value={data?.total_businesses ?? '…'}
          icon={Users}
          hint={data ? `+${data.new_this_month} new` : undefined}
        />
        <StatCard
          label="Active This Month"
          value={data?.active_this_month ?? '…'}
          icon={Activity}
          hint={data ? `${data.churned_this_month} churned` : undefined}
        />
        <StatCard
          label="Monthly Revenue"
          value={data ? `$${(data.monthly_revenue / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '…'}
          icon={DollarSign}
        />
        <StatCard
          label="Churn Rate"
          value={data ? `${churnStr}%` : '…'}
          icon={TrendingUp}
          hint={data ? `${data.churned_this_month} businesses` : undefined}
        />
      </div>

      {/* Secondary Metrics */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Avg Tills/Business" value={data?.avg_tills_per_business?.toFixed(1) ?? '…'} />
        <StatCard label="Daily Active Users" value={data?.daily_active_users ?? '…'} />
        <StatCard label="Avg Transactions/Day" value={data?.avg_transactions_per_day ?? '…'} />
      </div>

      {/* Breakdown by Business Type */}
      {data?.by_type && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="size-4" /> By Business Type
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.by_type.map((item) => (
              <div key={item.type} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="font-medium capitalize">{item.type}</div>
                  <div className="text-sm text-muted-foreground">{item.count} businesses</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">${(item.revenue / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Breakdown by Plan */}
      {data?.by_plan && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="size-4" /> By Subscription Plan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.by_plan.map((item) => (
              <div key={item.plan} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="font-medium">{item.plan}</div>
                  <div className="text-sm text-muted-foreground">{item.count} businesses</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">${(item.revenue / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Trends */}
      <Card>
        <CardHeader>
          <CardTitle>Growth Trends</CardTitle>
          <CardDescription>New businesses added and revenue over time</CardDescription>
        </CardHeader>
        <CardContent className="h-48 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <p className="mb-2">Graph visualization coming soon</p>
            <p className="text-sm">Data available in trends array for charting library integration</p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
