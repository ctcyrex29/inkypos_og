<?php

namespace Tests\Feature\Api\V1;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use RuntimeException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Tests\TestCase;

class ErrorEnvelopeTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Route::middleware('api')->prefix('api/v1/_test')->group(function () {
            Route::post('validate', fn (Request $r) => $r->validate(['sku' => ['required', 'string']]));
            Route::get('boom', fn () => throw new RuntimeException('secret database detail'));
            Route::get('conflict', fn () => throw new ConflictHttpException('Already exists'));
        });
    }

    private function assertErrorEnvelope($response, int $status, string $code): void
    {
        $response->assertStatus($status)
            ->assertExactJsonStructure(['error' => ['code', 'message'], 'meta' => ['request_id', 'api_version']])
            ->assertJsonPath('error.code', $code)
            ->assertJsonPath('meta.request_id', $response->headers->get('X-Request-Id'));
    }

    public function test_unknown_route_is_not_found(): void
    {
        $this->assertErrorEnvelope($this->getJson('/api/v1/does-not-exist'), 404, 'not_found');
    }

    public function test_unknown_route_returns_json_without_accept_header(): void
    {
        $this->assertErrorEnvelope($this->get('/api/v1/does-not-exist'), 404, 'not_found');
    }

    public function test_wrong_method_is_rejected(): void
    {
        $this->assertErrorEnvelope($this->postJson('/api/v1/health'), 405, 'method_not_allowed');
    }

    public function test_validation_errors_include_field_details(): void
    {
        $response = $this->postJson('/api/v1/_test/validate', []);

        $response->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['details' => ['sku']]]);
    }

    public function test_conflict_maps_to_conflict_code(): void
    {
        $this->assertErrorEnvelope($this->getJson('/api/v1/_test/conflict'), 409, 'conflict');
    }

    public function test_server_errors_hide_internals_when_debug_is_off(): void
    {
        config(['app.debug' => false]);

        $response = $this->getJson('/api/v1/_test/boom');

        $this->assertErrorEnvelope($response, 500, 'server_error');
        $this->assertStringNotContainsString('secret database detail', $response->getContent());
    }
}
