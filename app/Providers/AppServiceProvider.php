<?php

namespace App\Providers;

use Illuminate\Http\Middleware\TrustProxies;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureTrustedProxies();
    }

    private function configureTrustedProxies(): void
    {
        $proxies = config('washnote.trusted_proxies', []);

        if (! is_array($proxies)) {
            $proxies = [];
        }

        TrustProxies::at($proxies);
    }
}
