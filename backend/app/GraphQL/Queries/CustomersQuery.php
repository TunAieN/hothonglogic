<?php

namespace App\GraphQL\Queries;

use App\Models\Customer;
use GraphQL\Type\Definition\ResolveInfo;
use Nuwave\Lighthouse\Support\Contracts\GraphQLContext;

class CustomersQuery
{
    /**
     * Trả về danh sách khách hàng, hỗ trợ lọc status và tìm kiếm.
     *
     * @param  null  $root
     * @param  array<string, mixed>  $args
     */
    public function __invoke($root, array $args, GraphQLContext $context, ResolveInfo $resolveInfo)
    {
        $query = Customer::query();

        // Lọc theo status; mặc định lấy active
        if (isset($args['status'])) {
            $query->where('status', $args['status']);
        } else {
            $query->active();
        }

        // Tìm kiếm theo tên, mã, hoặc số điện thoại
        if (isset($args['search']) && $args['search']) {
            $search = $args['search'];
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('code', 'like', "%{$search}%")
                  ->orWhere('phone', 'like', "%{$search}%");
            });
        }

        return $query->orderBy('created_at', 'desc')->get();
    }
}
