<?php

namespace App\Http\Controllers\Api\V1;

use App\Devices\DeviceAuthenticator;
use App\Http\Controllers\Controller;
use App\Models\Device;
use App\Support\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DeviceAuthController extends Controller
{
    public function __construct(private readonly DeviceAuthenticator $authenticator) {}

    public function challenge(Request $request): JsonResponse
    {
        $data = $request->validate(['device_id' => ['required', 'uuid']]);
        $device = Device::findOrFail($data['device_id']);

        return ApiResponse::ok($this->authenticator->issueChallenge($device));
    }

    public function token(Request $request): JsonResponse
    {
        $data = $request->validate([
            'device_id' => ['required', 'uuid'],
            'challenge' => ['required', 'string', 'max:100'],
            'signature' => ['required', 'string', 'max:100'],
        ]);
        $device = Device::findOrFail($data['device_id']);
        $token = $this->authenticator->exchange($device, $data['challenge'], $data['signature']);

        return ApiResponse::ok([
            ...$token,
            'device' => $device->refresh()->toApi(),
            'server_time' => now()->toIso8601String(),
        ]);
    }
}
