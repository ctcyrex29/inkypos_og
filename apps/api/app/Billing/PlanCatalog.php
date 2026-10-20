<?php

namespace App\Billing;

use App\Models\Plan;

/** Plans are defined in config/inkypos.php and materialised on demand. */
final class PlanCatalog
{
    public function get(string $code): Plan
    {
        $definition = config("inkypos.plans.{$code}") ?? throw new \InvalidArgumentException("Unknown plan [{$code}]");

        return Plan::updateOrCreate(['code' => $code], [
            'name' => $definition['name'],
            'limits' => $definition['limits'],
            'features' => $definition['features'],
            'is_active' => true,
        ]);
    }

    public function trialPlan(): Plan
    {
        return $this->get((string) config('inkypos.trial.plan'));
    }
}
