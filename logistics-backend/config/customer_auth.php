<?php

return [
    /*
    | Email verification remains fail-closed by default. Local environments
    | may temporarily disable the requirement without marking email verified.
    */
    'email_verification_required' => filter_var(
        env('CUSTOMER_EMAIL_VERIFICATION_REQUIRED', true),
        FILTER_VALIDATE_BOOLEAN
    ),
];
