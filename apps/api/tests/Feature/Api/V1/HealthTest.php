<?php

namespace Tests\Feature\Api\V1;

use Tests\TestCase;

class HealthTest extends TestCase
{
    public function test_health_returns_the_shared_envelope(): void
    {
        $response = $this->getJson('/api/v1/health');

        $response->assertOk()
            ->assertExactJsonStructure([
                'data' => ['status', 'service', 'api_version', 'server_time'],
                'meta' => ['request_id', 'api_version'],
            ])
            ->assertJsonPath('data.status', 'ok')
            ->assertJsonPath('data.service', 'inkypos-api')
            ->assertJsonPath('data.api_version', 'v1')
            ->assertJsonPath('meta.api_version', 'v1');

        // Must satisfy z.iso.datetime({ offset: true }) on the client.
        $this->assertMatchesRegularExpression(
            '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)$/',
            $response->json('data.server_time'),
        );
    }

    public function test_health_needs_no_accept_header(): void
    {
        $this->get('/api/v1/health')
            ->assertOk()
            ->assertHeader('Content-Type', 'application/json');
    }

    public function test_generates_a_request_id_and_returns_it_in_header_and_meta(): void
    {
        $response = $this->getJson('/api/v1/health');

        $id = $response->headers->get('X-Request-Id');
        $this->assertMatchesRegularExpression('/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', $id);
        $response->assertJsonPath('meta.request_id', $id);
    }

    public function test_echoes_a_well_formed_client_request_id(): void
    {
        $clientId = '019a0000-0000-7000-8000-000000000001';

        $this->getJson('/api/v1/health', ['X-Request-Id' => $clientId])
            ->assertHeader('X-Request-Id', $clientId)
            ->assertJsonPath('meta.request_id', $clientId);
    }

    public function test_replaces_a_malformed_client_request_id(): void
    {
        $response = $this->getJson('/api/v1/health', ['X-Request-Id' => "bad id\n<script>"]);

        $this->assertNotSame("bad id\n<script>", $response->headers->get('X-Request-Id'));
        $response->assertJsonPath('meta.request_id', $response->headers->get('X-Request-Id'));
    }
}
