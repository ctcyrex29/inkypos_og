<?php

namespace Tests\Unit;

use App\Devices\DeviceAuthenticator;
use PHPUnit\Framework\TestCase;

/**
 * Cross-language check: the TypeScript client (packages/core, @noble/ed25519)
 * produced this vector; libsodium on the server must accept it byte for byte.
 */
class DeviceAuthVectorTest extends TestCase
{
    /** @return array<string, string> */
    private function vector(): array
    {
        $path = dirname(__DIR__, 4).'/packages/core/test-vectors/device-auth.v1.json';

        return json_decode((string) file_get_contents($path), true, flags: JSON_THROW_ON_ERROR);
    }

    public function test_server_builds_the_same_message_as_the_client(): void
    {
        $v = $this->vector();
        $this->assertSame($v['message'], DeviceAuthenticator::message($v['device_id'], $v['challenge']));
    }

    public function test_server_verifies_a_client_signature(): void
    {
        $v = $this->vector();
        $this->assertTrue(DeviceAuthenticator::verify($v['public_key'], $v['message'], $v['signature']));
    }

    public function test_server_rejects_a_tampered_message(): void
    {
        $v = $this->vector();
        $this->assertFalse(DeviceAuthenticator::verify($v['public_key'], $v['message'].'x', $v['signature']));
        $this->assertFalse(DeviceAuthenticator::verify($v['public_key'], $v['message'], 'not-base64url!'));
    }
}
