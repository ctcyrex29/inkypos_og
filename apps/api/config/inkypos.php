<?php

return [

    /*
    | Fiscalisation provider. Only "disabled" exists. Adding a provider requires
    | verified regulatory requirements and an authorised integration route
    | (docs/ARCHITECTURE.md, Phase 8). Unknown values fail at boot.
    */
    'fiscal' => [
        'provider' => env('FISCAL_PROVIDER', 'disabled'),
    ],

];
