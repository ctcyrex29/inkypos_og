<?php

namespace App\Http\Controllers\Api\V1\Platform;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InvoiceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Invoice::with('business');

        if ($request->has('status') && $request->input('status') !== 'all') {
            $query->where('status', $request->input('status'));
        }

        if ($request->has('search')) {
            $search = $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('invoice_number', 'like', "%{$search}%")
                  ->orWhereRelation('business', 'name', 'like', "%{$search}%");
            });
        }

        if ($request->has('from_date')) {
            $query->where('issued_at', '>=', $request->input('from_date'));
        }

        $invoices = $query->orderBy('issued_at', 'desc')->paginate(20);

        return response()->json($invoices);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'business_id' => 'required|exists:businesses,id',
            'invoice_number' => 'required|unique:invoices',
            'amount_minor' => 'required|integer|min:0',
            'currency' => 'required|string|size:3',
            'issued_at' => 'required|date',
            'due_at' => 'required|date',
            'description' => 'nullable|string',
            'items' => 'nullable|json',
        ]);

        $invoice = Invoice::create($validated);

        return response()->json($invoice, 201);
    }

    public function show(Invoice $invoice): JsonResponse
    {
        return response()->json($invoice->load('business'));
    }

    public function update(Request $request, Invoice $invoice): JsonResponse
    {
        $validated = $request->validate([
            'status' => 'string|in:draft,sent,paid,overdue,refunded',
            'paid_at' => 'nullable|date',
            'sent_at' => 'nullable|date',
        ]);

        $invoice->update($validated);

        return response()->json($invoice);
    }
}
