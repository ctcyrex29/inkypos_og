<?php

namespace App\Http\Controllers\Api\V1\Platform;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = AuditLog::with('user');

        if ($request->has('action') && $request->input('action') !== 'all') {
            $query->where('action', $request->input('action'));
        }

        if ($request->has('resource_type') && $request->input('resource_type') !== 'all') {
            $query->where('resource_type', $request->input('resource_type'));
        }

        if ($request->has('from_date')) {
            $query->where('created_at', '>=', $request->input('from_date'));
        }

        if ($request->has('to_date')) {
            $query->where('created_at', '<=', $request->input('to_date'));
        }

        $logs = $query->orderBy('created_at', 'desc')->paginate(25);

        return response()->json($logs);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'action' => 'required|string',
            'resource_type' => 'required|string',
            'resource_id' => 'required|string',
            'resource_name' => 'required|string',
            'changes' => 'nullable|json',
            'ip_address' => 'required|string',
            'status' => 'required|in:success,failed',
            'error_message' => 'nullable|string',
        ]);

        $validated['user_id'] = auth()->id();

        $log = AuditLog::create($validated);

        return response()->json($log, 201);
    }
}
