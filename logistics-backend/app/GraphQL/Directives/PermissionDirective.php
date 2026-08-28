<?php

namespace App\GraphQL\Directives;

use App\Models\User;
use App\Services\Auth\PermissionService;
use Illuminate\Support\Facades\Auth;
use Nuwave\Lighthouse\Exceptions\AuthorizationException;
use Nuwave\Lighthouse\Execution\ResolveInfo;
use Nuwave\Lighthouse\Schema\Directives\BaseDirective;
use Nuwave\Lighthouse\Schema\Values\FieldValue;
use Nuwave\Lighthouse\Support\Contracts\FieldMiddleware;
use Nuwave\Lighthouse\Support\Contracts\GraphQLContext;

class PermissionDirective extends BaseDirective implements FieldMiddleware
{
    public function __construct(private readonly PermissionService $permissions) {}

    public static function definition(): string
    {
        return <<<'GRAPHQL'
directive @permission(requires: String!) on FIELD_DEFINITION
GRAPHQL;
    }

    public function handleField(FieldValue $fieldValue): void
    {
        $permission = $this->directiveArgValue('requires');

        $fieldValue->wrapResolver(fn (callable $resolver): \Closure => function (mixed $root, array $args, GraphQLContext $context, ResolveInfo $resolveInfo) use ($resolver, $permission) {
            $user = $context->user() ?? Auth::guard('api')->user();
            if (! $this->permissions->allows($user instanceof User ? $user : null, $permission)) {
                throw new AuthorizationException('Bạn không có quyền thực hiện thao tác này.');
            }

            return $resolver($root, $args, $context, $resolveInfo);
        });
    }
}
