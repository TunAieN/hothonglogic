<?php

return [
    /*
    | Business mutations are fail-closed. Authentication/session writes are
    | deliberately handled outside this switch.
    */
    'writes_enabled' => filter_var(
        env('BUSINESS_WRITES_ENABLED', false),
        FILTER_VALIDATE_BOOLEAN
    ),

    /*
    | Financial writes have an independent fail-closed switch so historical
    | reconciliation issues do not require disabling unrelated workflows.
    */
    'financial_writes_enabled' => filter_var(
        env('FINANCIAL_WRITES_ENABLED', false),
        FILTER_VALIDATE_BOOLEAN
    ),
];
