<?php

return [

    'service_name' => env('WASHNOTE_SERVICE_NAME', 'washnote-api'),

    'business_timezone' => 'Asia/Jakarta',

    'login_max_attempts' => (int) env('WASHNOTE_LOGIN_MAX_ATTEMPTS', 5),

    'login_decay_minutes' => (int) env('WASHNOTE_LOGIN_DECAY_MINUTES', 15),

    'login_ip_burst_max_attempts' => (int) env('WASHNOTE_LOGIN_IP_BURST_MAX_ATTEMPTS', 20),

    'login_ip_burst_decay_minutes' => (int) env('WASHNOTE_LOGIN_IP_BURST_DECAY_MINUTES', 15),

    'kasir_per_page_default' => 10,

    'kasir_per_page_max' => 50,

    'trusted_proxies' => array_values(array_filter(array_map(
        static fn (string $proxy): string => trim($proxy),
        explode(',', (string) env('WASHNOTE_TRUSTED_PROXIES', '')),
    ), static fn (string $proxy): bool => $proxy !== '')),

];
