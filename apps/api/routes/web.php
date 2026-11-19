<?php

use Illuminate\Support\Facades\Route;

// This is an API server; the back office and portal are the separate web app.
Route::get('/', fn () => response()->json(['name' => 'InkyPOS API', 'health' => url('/api/v1/health')]));
