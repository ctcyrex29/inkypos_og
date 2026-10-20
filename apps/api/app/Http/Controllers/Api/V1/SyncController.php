<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\ApiException;
use App\Http\Controllers\Controller;
use App\Models\Device;
use App\Support\ApiResponse;
use App\Sync\SyncProcessor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use JsonException;
use stdClass;

class SyncController extends Controller
{
    private const MAX_EVENTS = 100;

    /**
     * POST /api/v1/sync/events. Each event gets its own answer and its own
     * transaction; one bad event never blocks the rest of the batch.
     */
    public function push(Request $request, SyncProcessor $processor): JsonResponse
    {
        /** @var Device $device */
        $device = $request->user();

        try {
            $batch = json_decode($request->getContent(), flags: JSON_THROW_ON_ERROR | JSON_BIGINT_AS_STRING);
        } catch (JsonException) {
            throw new ApiException('validation_failed', 'Body must be JSON.', 422);
        }

        if (! $batch instanceof stdClass || ! is_string($batch->batch_id ?? null) || ! Str::isUuid($batch->batch_id)
            || ! is_array($batch->events ?? null) || $batch->events === [] || count($batch->events) > self::MAX_EVENTS) {
            throw new ApiException('validation_failed', 'Expected {batch_id, device_id, events[1..'.self::MAX_EVENTS.']}.', 422);
        }
        if (($batch->device_id ?? null) !== $device->id) {
            throw ApiException::forbidden('device_id does not match the authenticated device.');
        }
        foreach ($batch->events as $event) {
            // Without a usable event_id there is nothing to acknowledge against.
            if (! $event instanceof stdClass || ! is_string($event->event_id ?? null) || ! Str::isUuid($event->event_id)
                || ! is_int($event->device_sequence ?? null)) {
                throw new ApiException('validation_failed', 'Every event needs a UUID event_id and an integer device_sequence.', 422);
            }
        }

        $acknowledgements = array_map(fn (stdClass $event) => $processor->process($device, $event), $batch->events);

        return ApiResponse::ok([
            'batch_id' => $batch->batch_id,
            'server_time' => now()->toIso8601String(),
            'acknowledgements' => $acknowledgements,
        ]);
    }
}
