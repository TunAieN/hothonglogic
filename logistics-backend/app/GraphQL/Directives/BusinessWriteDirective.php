<?php

namespace App\GraphQL\Directives;

use App\Support\BusinessWriteGuard;
use Nuwave\Lighthouse\Execution\ResolveInfo;
use Nuwave\Lighthouse\Schema\Values\FieldValue;
use Nuwave\Lighthouse\Support\Contracts\FieldMiddleware;
use Nuwave\Lighthouse\Support\Contracts\GraphQLContext;

/**
 * Fail-closed protection for every root business mutation.
 *
 * This operates on the parsed schema field, not the HTTP request text, so
 * aliases, operationName, variables and batched GraphQL requests cannot
 * bypass the guard.
 */
final class BusinessWriteDirective implements FieldMiddleware
{
    private const AUTHENTICATION_MUTATIONS = ['login', 'logout'];

    public static function definition(): string
    {
        return 'directive @businessWrite on FIELD_DEFINITION';
    }

    public function handleField(FieldValue $fieldValue): void
    {
        $fieldValue->wrapResolver(fn (callable $resolver): \Closure => function (mixed $root, array $args, GraphQLContext $context, ResolveInfo $resolveInfo) use ($resolver) {
            if (self::protects($resolveInfo->parentType->name, $resolveInfo->fieldName)) {
                BusinessWriteGuard::assertEnabled('graphql.'.$resolveInfo->fieldName);
            }

            return $resolver($root, $args, $context, $resolveInfo);
        });
    }

    public static function protects(string $parentType, string $fieldName): bool
    {
        return $parentType === 'Mutation'
            && ! in_array($fieldName, self::AUTHENTICATION_MUTATIONS, true);
    }
}
