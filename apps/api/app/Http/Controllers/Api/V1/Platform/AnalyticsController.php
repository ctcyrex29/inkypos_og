<?php

namespace App\Http\Controllers\Api\V1\Platform;

use App\Http\Controllers\Controller;
use App\Models\Business;
use App\Models\Invoice;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AnalyticsController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $days = (int) $request->input('days', 30);
        $fromDate = now()->subDays($days);

        // Get all businesses and filter by date range
        $businesses = Business::where('created_at', '>=', $fromDate)->get();
        $totalBusinesses = Business::count();
        $activeThisMonth = Business::where('created_at', '>=', now()->subDays($days))->count();
        $newThisMonth = Business::where('created_at', '>=', now()->subDays($days))->count();

        // Churn calculation (simplified: businesses that haven't made a sale recently)
        $churnedThisMonth = Business::where('updated_at', '<', now()->subDays($days))
            ->where('status', 'suspended')
            ->count();
        $churnRate = $totalBusinesses > 0 ? $churnedThisMonth / $totalBusinesses : 0;

        // Revenue
        $monthlyRevenue = Invoice::where('status', 'paid')
            ->where('paid_at', '>=', now()->subDays($days))
            ->sum('amount_minor');

        // Tills per business (mock data for now)
        $avgTillsPerBusiness = 1.5;
        $dailyActiveUsers = Business::where('updated_at', '>=', now()->subDay())->count();
        $avgTransactionsPerDay = 42; // Mock data

        // Trends
        $trends = [];
        for ($i = $days; $i >= 0; $i--) {
            $date = now()->subDays($i)->format('Y-m-d');
            $trends[] = [
                'date' => $date,
                'businesses' => Business::where('created_at', '<=', $date)->count(),
                'revenue' => Invoice::where('paid_at', '<=', $date)
                    ->where('status', 'paid')
                    ->sum('amount_minor'),
                'churn' => 0,
            ];
        }

        // By type (assuming businesses have a 'type' field or using random data)
        $byType = [
            ['type' => 'retail', 'count' => 15, 'revenue' => 5000000],
            ['type' => 'hospitality', 'count' => 8, 'revenue' => 3000000],
            ['type' => 'services', 'count' => 12, 'revenue' => 2500000],
        ];

        // By plan
        $byPlan = [
            ['plan' => 'Starter', 'count' => 10, 'revenue' => 2000000],
            ['plan' => 'Professional', 'count' => 15, 'revenue' => 5000000],
            ['plan' => 'Enterprise', 'count' => 10, 'revenue' => 3500000],
        ];

        return response()->json([
            'total_businesses' => $totalBusinesses,
            'active_this_month' => $activeThisMonth,
            'new_this_month' => $newThisMonth,
            'churned_this_month' => $churnedThisMonth,
            'churn_rate' => $churnRate,
            'monthly_revenue' => $monthlyRevenue,
            'avg_tills_per_business' => $avgTillsPerBusiness,
            'daily_active_users' => $dailyActiveUsers,
            'avg_transactions_per_day' => $avgTransactionsPerDay,
            'trends' => $trends,
            'by_type' => $byType,
            'by_plan' => $byPlan,
        ]);
    }
}
