<?php

namespace App\Http\Controllers\Api;

use App\Models\SupportTicket;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SupportTicketController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = SupportTicket::with(['business', 'createdBy', 'assignedTo']);

        if ($request->has('status') && $request->input('status') !== 'all') {
            $query->where('status', $request->input('status'));
        }

        if ($request->has('priority') && $request->input('priority') !== 'all') {
            $query->where('priority', $request->input('priority'));
        }

        if ($request->has('search')) {
            $search = $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('ticket_number', 'like', "%{$search}%")
                  ->orWhere('subject', 'like', "%{$search}%")
                  ->orWhereRelation('business', 'name', 'like', "%{$search}%");
            });
        }

        $tickets = $query->orderBy('created_at', 'desc')->paginate(20);

        return response()->json($tickets);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'business_id' => 'required|exists:businesses,id',
            'subject' => 'required|string|max:255',
            'description' => 'required|string',
            'priority' => 'required|in:low,medium,high,urgent',
        ]);

        $validated['created_by_user_id'] = auth()->id();
        $validated['ticket_number'] = 'TKT-' . time();

        $ticket = SupportTicket::create($validated);

        return response()->json($ticket, 201);
    }

    public function show(SupportTicket $ticket): JsonResponse
    {
        return response()->json($ticket->load(['business', 'createdBy', 'assignedTo', 'messages.user']));
    }

    public function update(Request $request, SupportTicket $ticket): JsonResponse
    {
        $validated = $request->validate([
            'status' => 'string|in:open,in_progress,waiting_customer,resolved,closed',
            'priority' => 'string|in:low,medium,high,urgent',
            'assigned_to_user_id' => 'nullable|exists:users,id',
        ]);

        $ticket->update($validated);

        return response()->json($ticket);
    }

    public function addMessage(Request $request, SupportTicket $ticket): JsonResponse
    {
        $validated = $request->validate([
            'message' => 'required|string',
        ]);

        $message = $ticket->messages()->create([
            'user_id' => auth()->id(),
            'message' => $validated['message'],
            'author_type' => 'agent',
        ]);

        $ticket->increment('message_count');

        return response()->json($message, 201);
    }
}
