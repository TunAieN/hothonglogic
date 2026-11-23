<?php

namespace App\GraphQL\Resolvers;

use App\Models\AuditLog;
use App\Models\SepayWebhookEvent;
use App\Services\Payments\SepayWebhookService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpKernel\Exception\HttpException;

class SepayReconciliationResolver
{
    public function __construct(private readonly SepayWebhookService $service) {}

    public function list($_, array $args): Builder
    {
        $filter = $args['filter'] ?? [];

        return SepayWebhookEvent::query()->with('intent')
            ->when($filter['status'] ?? null, fn (Builder $query, $value) => $query->where('status', $value))
            ->when($filter['reference'] ?? null, function (Builder $query, $value) {
                $term = '%'.trim((string) $value).'%';
                $query->where(fn (Builder $inner) => $inner->where('reference', 'like', $term)
                    ->orWhere('provider_transaction_id', 'like', $term));
            })
            ->when($filter['date_from'] ?? null, fn (Builder $query, $value) => $query->where('created_at', '>=', $value))
            ->when($filter['date_to'] ?? null, fn (Builder $query, $value) => $query->where('created_at', '<=', $value))
            ->orderByDesc('id');
    }

    public function retry($_, array $args): SepayWebhookEvent
    {
        $event = SepayWebhookEvent::query()->findOrFail($args['id']);
        if (! in_array($event->status, ['received', 'retryable_failed'], true)) {
            throw new HttpException(422, 'Chỉ event đang chờ hoặc lỗi kỹ thuật tạm thời mới được retry.');
        }
        $before = $event->toArray();
        $result = $this->service->processEvent((int) $event->id, true);
        AuditLog::query()->create([
            'user_id' => Auth::id(), 'action' => 'retry_sepay_webhook_event',
            'entity_type' => 'SepayWebhookEvent', 'entity_id' => $event->id,
            'before_data' => $before, 'after_data' => $result->toArray(),
            'ip' => request()?->ip(), 'user_agent' => request()?->userAgent(), 'created_at' => now(),
        ]);

        return $result;
    }
}
