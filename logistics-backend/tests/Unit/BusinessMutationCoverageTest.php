<?php

namespace Tests\Unit;

use App\GraphQL\Directives\BusinessWriteDirective;
use PHPUnit\Framework\TestCase;

class BusinessMutationCoverageTest extends TestCase
{
    public function test_all_58_business_mutations_are_fail_closed(): void
    {
        $schema = file_get_contents(__DIR__.'/../../graphql/schema.graphql');
        preg_match('/type Mutation\s*\{(?<body>.*?)^\}/ms', $schema, $match);
        preg_match_all('/^\s{2}([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(|:)/m', $match['body'] ?? '', $fields);

        $mutations = $fields[1] ?? [];
        $authenticationMutations = ['login', 'logout'];
        $businessMutations = array_values(array_filter(
            $mutations,
            fn (string $name) => ! in_array($name, $authenticationMutations, true),
        ));

        $this->assertCount(60, $mutations);
        $this->assertCount(58, $businessMutations);
        $this->assertFalse(BusinessWriteDirective::protects('Mutation', 'login'));
        $this->assertFalse(BusinessWriteDirective::protects('Mutation', 'logout'));
        $this->assertFalse(BusinessWriteDirective::protects('Query', 'orders'));

        foreach ($businessMutations as $mutation) {
            $this->assertTrue(
                BusinessWriteDirective::protects('Mutation', $mutation),
                "Mutation [$mutation] must remain protected by BusinessWriteGuard.",
            );
        }
    }
}
