<?php

namespace App\GraphQL\Resolvers;

use App\Services\Shipping\ShippingTaskService;
use GraphQL\Error\UserError;
use Symfony\Component\HttpKernel\Exception\HttpException;

class ShippingTaskResolver
{
    public function __construct(private readonly ShippingTaskService $service) {}

    public function queue($_, array $args): array
    {
        return $this->service->queue(
            $args['filter'] ?? [],
            max(1, (int) ($args['page'] ?? 1)),
            min(100, max(1, (int) ($args['first'] ?? 10))),
        );
    }

    public function queueOptions($_, array $args): array
    {
        return $this->service->queueOptions($args['order_ids'] ?? []);
    }

    public function options(): array
    {
        return $this->service->options();
    }

    public function ghnPreview($_, array $args): array
    {
        try {
            return $this->service->ghnPreview($args['input'] ?? []);
        } catch (HttpException $exception) {
            throw new UserError($exception->getMessage());
        }
    }

    public function tasks($_, array $args): array
    {
        return $this->service->tasks(
            $args['filter'] ?? [],
            max(1, (int) ($args['page'] ?? 1)),
            min(100, max(1, (int) ($args['first'] ?? 10))),
        );
    }

    public function task($_, array $args): array
    {
        return $this->service->task($args['id']);
    }

    public function slips($_, array $args): array
    {
        return $this->service->slips(
            $args['filter'] ?? [],
            max(1, (int) ($args['page'] ?? 1)),
            min(100, max(1, (int) ($args['first'] ?? 10))),
        );
    }

    public function slip($_, array $args): array
    {
        return $this->service->slip($args['id']);
    }

    public function create($_, array $args): array
    {
        $task = $this->service->create($args['input'] ?? []);

        return [
            'task' => $this->service->presentTask($task),
            'message' => 'Tạo nhiệm vụ xuất hàng thành công',
        ];
    }

    public function updateStatus($_, array $args): array
    {
        return $this->service->updateStatus($args['id'], $args['status']);
    }
}
