<?php

use App\Http\ApiExceptionRenderer;
use App\Http\Middleware\AssignRequestId;
use App\Http\Middleware\EnsurePrincipal;
use App\Http\Middleware\ForceJsonResponse;
use App\Http\Middleware\RequirePermission;
use App\Http\Middleware\ResolveTenant;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Routing\Middleware\SubstituteBindings;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        apiPrefix: 'api',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Global, so even requests that match no route (404/405) carry a request id.
        $middleware->prepend(AssignRequestId::class);
        $middleware->api(prepend: [ForceJsonResponse::class]);

        $middleware->alias([
            'principal' => EnsurePrincipal::class,
            'tenant' => ResolveTenant::class,
            'permission' => RequirePermission::class,
        ]);

        // The tenant must be known before route-model binding, so bound models are tenant-scoped.
        $middleware->prependToPriorityList(SubstituteBindings::class, ResolveTenant::class);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(fn (Request $request) => $request->is('api/*'));
        $exceptions->render(fn (Throwable $e, Request $request) => $request->is('api/*')
            ? app(ApiExceptionRenderer::class)->render($e, $request)
            : null);
        // Expected outcomes, already audited where relevant; not errors worth logging.
        $exceptions->dontReport([App\Http\ApiException::class]);
    })->create();
