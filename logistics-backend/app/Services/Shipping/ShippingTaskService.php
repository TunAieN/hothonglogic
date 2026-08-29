<?php

namespace App\Services\Shipping;

use App\Models\AuditLog;
use App\Models\DeliveryRequest;
use App\Models\ExportItem;
use App\Models\ExportSlip;
use App\Models\Order;
use App\Models\PaymentVoucherItem;
use App\Models\ShippingTask;
use App\Models\ShippingTaskOrder;
use App\Models\Shipment;
use App\Models\User;
use App\Models\VnPackage;
use App\Models\VnWarehouse;
use App\Services\Auth\PermissionService;
use App\Services\Delivery\DeliveryRequestService;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpKernel\Exception\HttpException;

class ShippingTaskService
{
    public function __construct(private readonly DeliveryRequestService $deliveryRequestService) {}

    public const CARRIERS = [
        'spx' => 'SPX Express',
        'ghn' => 'Giao hàng nhanh',
        'viettel_post' => 'Viettel Post',
        'ghtk' => 'GHTK',
        'vnpost' => 'VNPost',
        'jnt' => 'J&T Express',
        'other' => 'Khác',
    ];

    public function queue(array $filter, int $page, int $first): array
    {
        $this->ensurePermission('shipping_queue.read');
        $query = $this->queueOrderQuery($filter);
        $paginator = $query->paginate($first, ['orders.*'], 'page', $page);
        $rows = collect($paginator->items())->map(fn (Order $order) => $this->queueOrderRow($order))->values();

        $allRows = $this->queueOrderQuery($filter)->get()->map(fn (Order $order) => $this->queueOrderRow($order));

        return [
            'data' => $rows->all(),
            'stats' => $this->queueStats($allRows),
            'paginatorInfo' => $this->paginatorInfo($paginator),
        ];
    }

    public function queueOptions(array $orderIds): array
    {
        $this->ensurePermission('shipping_queue.read');
        $ids = $this->normalizeIds($orderIds);

        if ($ids === []) {
            return [];
        }

        return $this->queueOrderQuery(['order_ids' => $ids])
            ->get()
            ->map(fn (Order $order) => $this->queueOrderRow($order))
            ->values()
            ->all();
    }

    public function options(): array
    {
        $this->ensurePermission('shipping_tasks.read');

        $staff = User::query()
            ->with('role')
            ->where('status', 'active')
            ->orderBy('name')
            ->get()
            ->filter(function (User $user) {
                return $user->role?->key === 'shipping_staff'
                    || app(PermissionService::class)->allows($user, 'shipping_tasks.update');
            })
            ->values();

        return [
            'deliveryStaff' => $staff,
            'warehouses' => VnWarehouse::query()->orderBy('name')->get(),
            'carriers' => collect(self::CARRIERS)
                ->map(fn (string $name, string $code) => ['code' => $code, 'name' => $name])
                ->merge(
                    ShippingTask::query()
                        ->whereNotNull('carrier_name')
                        ->select(['carrier_code', 'carrier_name'])
                        ->distinct()
                        ->get()
                        ->map(fn (ShippingTask $task) => [
                            'code' => $task->carrier_code,
                            'name' => $task->carrier_name,
                        ])
                )
                ->unique('name')
                ->values()
                ->all(),
        ];
    }

    public function create(array $input): ShippingTask
    {
        $this->ensurePermission('shipping_tasks.create');
        $validated = Validator::make($input, [
            'order_ids' => ['required', 'array', 'min:1'],
            'order_ids.*' => ['required', 'integer', Rule::exists('orders', 'id')],
            'delivery_staff_id' => ['required', Rule::exists('users', 'id')->where('status', 'active')],
            'carrier_code' => ['required', Rule::in(array_keys(self::CARRIERS))],
            'carrier_name' => ['nullable', 'string', 'max:100'],
            'scheduled_delivery_date' => ['required', 'date', 'after_or_equal:today'],
            'vn_warehouse_id' => ['required', Rule::exists('vn_warehouses', 'id')],
            'note' => ['nullable', 'string', 'max:250'],
            'service_type' => ['nullable', Rule::in(['standard', 'express', 'same_day'])],
            'delivery_method' => ['nullable', Rule::in(['door_delivery', 'warehouse_pickup', 'transshipment'])],
            'estimated_shipping_fee' => ['nullable', 'numeric', 'min:0'],
            'cod_amount' => ['nullable', 'numeric', 'min:0'],
            'transport_note' => ['nullable', 'string', 'max:1000'],
        ])->validate();

        $orderIds = $this->normalizeIds($validated['order_ids']);

        return DB::transaction(function () use ($validated, $orderIds) {
            $orders = Order::query()
                ->with('customer')
                ->whereIn('id', $orderIds)
                ->lockForUpdate()
                ->get()
                ->keyBy('id');

            if ($orders->count() !== count($orderIds)) {
                throw new HttpException(422, 'Một hoặc nhiều đơn hàng không còn tồn tại.');
            }

            $packages = VnPackage::query()
                ->with(['cnPackage.order.customer', 'paymentVoucher.invoice', 'paymentVoucher.deliveryRequest.address', 'paymentVoucherPackage'])
                ->whereHas('cnPackage', fn (Builder $query) => $query->whereIn('order_id', $orderIds))
                ->where('payment_status', 'paid')
                ->where('delivery_status', 'ready_for_delivery')
                ->whereDoesntHave('exportItem')
                ->lockForUpdate()
                ->get();

            $packagesByOrder = $packages->groupBy(fn (VnPackage $package) => (int) $package->cnPackage?->order_id);
            foreach ($orderIds as $orderId) {
                if (($packagesByOrder[$orderId] ?? collect())->isEmpty()) {
                    $code = $orders[$orderId]?->order_code ?? $orderId;
                    throw new HttpException(422, "Đơn {$code} đã được tạo nhiệm vụ hoặc không còn ở trạng thái đã thanh toán.");
                }
            }

            $task = ShippingTask::query()->create([
                'task_code' => 'TMP-'.Str::uuid(),
                'delivery_staff_id' => $validated['delivery_staff_id'],
                'vn_warehouse_id' => $validated['vn_warehouse_id'],
                'carrier_code' => $validated['carrier_code'],
                'carrier_name' => $validated['carrier_code'] === 'other'
                    ? trim((string) ($validated['carrier_name'] ?? 'Khác'))
                    : self::CARRIERS[$validated['carrier_code']],
                'scheduled_delivery_date' => $validated['scheduled_delivery_date'],
                'service_type' => $validated['service_type'] ?? null,
                'delivery_method' => $validated['delivery_method'] ?? null,
                'estimated_shipping_fee' => $validated['estimated_shipping_fee'] ?? 0,
                'cod_amount' => $validated['cod_amount'] ?? null,
                'status' => ShippingTask::STATUS_CREATED,
                'note' => $validated['note'] ?? null,
                'transport_note' => $validated['transport_note'] ?? null,
                'created_by' => Auth::id(),
            ]);
            $task->update(['task_code' => $this->datedCode('NVX', $task->id, $task->created_at)]);
            $voucherIds = $packages->pluck('payment_voucher_id')->filter()->unique()->map(fn ($id) => (int) $id)->values()->all();
            $this->deliveryRequestService->attachShippingTask($task, $voucherIds);

            foreach ($orderIds as $orderId) {
                $orderPackages = $packagesByOrder[$orderId];
                $paidPackageValue = (float) $orderPackages->sum(fn (VnPackage $package) => $this->packagePaidValue($package));
                ShippingTaskOrder::query()->create([
                    'shipping_task_id' => $task->id,
                    'order_id' => $orderId,
                    'package_count' => $orderPackages->count(),
                    'total_weight' => round((float) $orderPackages->sum('actual_weight'), 3),
                    'total_value' => $paidPackageValue > 0
                        ? $paidPackageValue
                        : (float) ($orders[$orderId]->product_total_vnd ?? 0),
                ]);
            }

            $customerIds = $orders->pluck('customer_id')->filter()->unique()->values();
            $invoiceIds = $packages->map(fn (VnPackage $package) => $package->paymentVoucher?->invoice?->id)
                ->filter()->unique()->values();
            $deliveryAddresses = $packages->map(fn (VnPackage $package) => $package->paymentVoucher?->deliveryRequest?->address?->full_address)
                ->filter()->unique()->values();

            $slip = ExportSlip::query()->create([
                'export_code' => 'TMP-'.Str::uuid(),
                'shipping_task_id' => $task->id,
                'invoice_id' => $invoiceIds->count() === 1 ? $invoiceIds->first() : null,
                'customer_id' => $customerIds->count() === 1 ? $customerIds->first() : null,
                'delivery_address' => $deliveryAddresses->count() === 1
                    ? $deliveryAddresses->first()
                    : ($customerIds->count() === 1 ? $orders->first()->customer?->address : null),
                'delivery_staff_id' => $validated['delivery_staff_id'],
                'created_by' => Auth::id(),
                'scheduled_delivery_date' => $validated['scheduled_delivery_date'],
                'status' => 'pending',
                'note' => $validated['note'] ?? null,
            ]);
            $slip->update(['export_code' => $this->datedCode('PXH', $slip->id, $slip->created_at)]);

            foreach ($packages as $package) {
                ExportItem::query()->create([
                    'export_id' => $slip->id,
                    'vn_package_id' => $package->id,
                ]);
            }

            VnPackage::query()->whereIn('id', $packages->pluck('id'))->update([
                'delivery_status' => 'export_task_created',
            ]);

            $this->audit('create_shipping_task', $task, [
                'order_ids' => $orderIds,
                'vn_package_ids' => $packages->pluck('id')->all(),
                'export_slip_id' => $slip->id,
            ]);

            return $this->loadTask($task->id);
        }, 3);
    }

    public function tasks(array $filter, int $page, int $first): array
    {
        $this->ensurePermission('shipping_tasks.read');
        $sortField = in_array($filter['sort_field'] ?? null, ['task_code', 'created_at', 'scheduled_delivery_date'], true)
            ? $filter['sort_field']
            : 'created_at';
        $sortDirection = strtolower((string) ($filter['sort_direction'] ?? 'desc')) === 'asc' ? 'asc' : 'desc';
        $query = ShippingTask::query()
            ->with(['deliveryStaff', 'warehouse', 'creator', 'exportSlip', 'taskOrders.order.customer'])
            ->withSum('taskOrders as total_packages', 'package_count')
            ->withSum('taskOrders as total_weight', 'total_weight')
            ->withSum('taskOrders as total_value', 'total_value')
            ->when($this->filled($filter, 'search'), function (Builder $query) use ($filter) {
                $search = trim((string) $filter['search']);
                $query->where(function (Builder $nested) use ($search) {
                    $nested->where('task_code', 'like', "%{$search}%")
                        ->orWhere('carrier_name', 'like', "%{$search}%")
                        ->orWhereHas('deliveryStaff', function (Builder $staff) use ($search) {
                            $staff->where('name', 'like', "%{$search}%")
                                ->orWhere('phone', 'like', "%{$search}%");
                        })
                        ->orWhereHas('exportSlip', fn (Builder $slip) => $slip->where('export_code', 'like', "%{$search}%"));
                });
            })
            ->when($this->filled($filter, 'status'), fn (Builder $query) => $query->where('status', $filter['status']))
            ->when($this->filled($filter, 'carrier_code'), fn (Builder $query) => $query->where('carrier_code', $filter['carrier_code']))
            ->when($this->filled($filter, 'delivery_staff_id'), fn (Builder $query) => $query->where('delivery_staff_id', $filter['delivery_staff_id']))
            ->when($this->filled($filter, 'date_from'), fn (Builder $query) => $query->whereDate('created_at', '>=', $filter['date_from']))
            ->when($this->filled($filter, 'date_to'), fn (Builder $query) => $query->whereDate('created_at', '<=', $filter['date_to']))
            ->orderBy($sortField, $sortDirection)
            ->orderBy('id', $sortDirection);
        $paginator = $query->paginate($first, ['shipping_tasks.*'], 'page', $page);
        $stats = ShippingTask::query()
            ->selectRaw('COUNT(*) as total_tasks')
            ->selectRaw("SUM(CASE WHEN status = 'preparing' THEN 1 ELSE 0 END) as preparing")
            ->selectRaw("SUM(CASE WHEN status = 'in_transit' THEN 1 ELSE 0 END) as in_transit")
            ->selectRaw("SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed")
            ->selectRaw("SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled")
            ->first();

        return [
            'data' => collect($paginator->items())->map(fn (ShippingTask $task) => $this->taskRow($task))->all(),
            'stats' => [
                'total_tasks' => (int) ($stats?->total_tasks ?? 0),
                'preparing' => (int) ($stats?->preparing ?? 0),
                'in_transit' => (int) ($stats?->in_transit ?? 0),
                'completed' => (int) ($stats?->completed ?? 0),
                'cancelled' => (int) ($stats?->cancelled ?? 0),
            ],
            'paginatorInfo' => $this->paginatorInfo($paginator),
        ];
    }

    public function task(int|string $id): array
    {
        $this->ensurePermission('shipping_tasks.read');

        return $this->taskRow($this->loadTask((int) $id));
    }

    public function updateStatus(int|string $id, string $status): array
    {
        $status = strtolower(trim($status));
        $this->ensurePermission($status === ShippingTask::STATUS_COMPLETED
            ? 'shipping_tasks.complete'
            : 'shipping_tasks.update');

        $transitions = [
            ShippingTask::STATUS_CREATED => [ShippingTask::STATUS_PREPARING, ShippingTask::STATUS_CANCELLED],
            ShippingTask::STATUS_PREPARING => [ShippingTask::STATUS_IN_TRANSIT, ShippingTask::STATUS_CANCELLED],
            ShippingTask::STATUS_IN_TRANSIT => [ShippingTask::STATUS_COMPLETED],
            ShippingTask::STATUS_COMPLETED => [],
            ShippingTask::STATUS_CANCELLED => [],
        ];

        return DB::transaction(function () use ($id, $status, $transitions) {
            $task = ShippingTask::query()->with('exportSlip.items')->lockForUpdate()->findOrFail($id);
            $currentStatus = (string) $task->status;
            if (! in_array($status, $transitions[$currentStatus] ?? [], true)) {
                throw new HttpException(422, 'Không thể chuyển nhiệm vụ từ trạng thái hiện tại sang trạng thái đã chọn.');
            }

            $task->update(['status' => $status]);
            $requestStatus = match ($status) {
                ShippingTask::STATUS_IN_TRANSIT => 'shipped',
                ShippingTask::STATUS_COMPLETED => 'delivered',
                ShippingTask::STATUS_CANCELLED => DeliveryRequest::STATUS_READY_TO_SHIP,
                default => DeliveryRequest::STATUS_PROCESSING,
            };
            $deliveryRequestIds = $task->deliveryRequests()->pluck('id');
            $task->deliveryRequests()->update([
                'status' => $requestStatus,
                'shipping_task_id' => $status === ShippingTask::STATUS_CANCELLED ? null : $task->id,
            ]);
            if (in_array($status, [ShippingTask::STATUS_IN_TRANSIT, ShippingTask::STATUS_COMPLETED, ShippingTask::STATUS_CANCELLED], true)) {
                Shipment::query()->whereIn('delivery_request_id', $deliveryRequestIds)->update(['status' => match ($status) {
                    ShippingTask::STATUS_IN_TRANSIT => 'in_transit',
                    ShippingTask::STATUS_COMPLETED => 'delivered',
                    default => 'cancelled',
                }]);
            }
            $slipStatus = match ($status) {
                ShippingTask::STATUS_IN_TRANSIT => 'in_transit',
                ShippingTask::STATUS_COMPLETED => 'delivered',
                ShippingTask::STATUS_CANCELLED => 'returned',
                default => 'pending',
            };
            $deliveryStatus = match ($status) {
                ShippingTask::STATUS_PREPARING => 'export_preparing',
                ShippingTask::STATUS_IN_TRANSIT => 'in_delivery',
                ShippingTask::STATUS_COMPLETED => 'delivered',
                ShippingTask::STATUS_CANCELLED => 'export_cancelled',
                default => 'export_task_created',
            };
            if ($task->exportSlip) {
                $task->exportSlip->update(['status' => $slipStatus]);
                VnPackage::query()
                    ->whereIn('id', $task->exportSlip->items->pluck('vn_package_id'))
                    ->update(['delivery_status' => $deliveryStatus]);
            }

            $this->audit('update_shipping_task_status', $task, [
                'from' => $currentStatus,
                'to' => $status,
            ]);

            return $this->taskRow($this->loadTask((int) $task->id));
        }, 3);
    }

    public function slips(array $filter, int $page, int $first): array
    {
        $this->ensurePermission('export_slips.read');
        $sortDirection = strtolower((string) ($filter['sort_direction'] ?? 'desc')) === 'asc' ? 'asc' : 'desc';
        $query = ExportSlip::query()
            ->whereNotNull('shipping_task_id')
            ->with(['task.deliveryStaff', 'task.warehouse', 'task.taskOrders.order.customer', 'creator', 'items.package.paymentVoucherPackage'])
            ->when($this->filled($filter, 'search'), function (Builder $query) use ($filter) {
                $search = trim((string) $filter['search']);
                $query->where(function (Builder $nested) use ($search) {
                    $nested->where('export_code', 'like', "%{$search}%")
                        ->orWhereHas('task', function (Builder $task) use ($search) {
                            $task->where('task_code', 'like', "%{$search}%")
                                ->orWhere('carrier_name', 'like', "%{$search}%")
                                ->orWhereHas('deliveryStaff', function (Builder $staff) use ($search) {
                                    $staff->where('name', 'like', "%{$search}%")
                                        ->orWhere('phone', 'like', "%{$search}%");
                                });
                        });
                });
            })
            ->when($this->filled($filter, 'status'), fn (Builder $query) => $query->whereHas('task', fn (Builder $task) => $task->where('status', $filter['status'])))
            ->when($this->filled($filter, 'carrier_code'), fn (Builder $query) => $query->whereHas('task', fn (Builder $task) => $task->where('carrier_code', $filter['carrier_code'])))
            ->when($this->filled($filter, 'delivery_staff_id'), fn (Builder $query) => $query->whereHas('task', fn (Builder $task) => $task->where('delivery_staff_id', $filter['delivery_staff_id'])))
            ->when($this->filled($filter, 'date_from'), fn (Builder $query) => $query->whereDate('created_at', '>=', $filter['date_from']))
            ->when($this->filled($filter, 'date_to'), fn (Builder $query) => $query->whereDate('created_at', '<=', $filter['date_to']))
            ->orderBy('created_at', $sortDirection)
            ->orderBy('id', $sortDirection);
        $paginator = $query->paginate($first, ['exports.*'], 'page', $page);
        $packageStats = ExportSlip::query()
            ->whereNotNull('exports.shipping_task_id')
            ->leftJoin('export_items', 'export_items.export_id', '=', 'exports.id')
            ->leftJoin('vn_packages', 'vn_packages.id', '=', 'export_items.vn_package_id')
            ->selectRaw('COUNT(DISTINCT exports.id) as total_slips')
            ->selectRaw('COUNT(export_items.id) as total_packages')
            ->selectRaw('COALESCE(SUM(vn_packages.actual_weight), 0) as total_weight')
            ->first();
        $totalValue = ShippingTaskOrder::query()
            ->join('shipping_tasks', 'shipping_tasks.id', '=', 'shipping_task_orders.shipping_task_id')
            ->join('exports', 'exports.shipping_task_id', '=', 'shipping_tasks.id')
            ->sum('shipping_task_orders.total_value');

        return [
            'data' => collect($paginator->items())->map(fn (ExportSlip $slip) => $this->slipRow($slip))->all(),
            'stats' => [
                'total_slips' => (int) ($packageStats?->total_slips ?? 0),
                'total_packages' => (int) ($packageStats?->total_packages ?? 0),
                'total_weight' => round((float) ($packageStats?->total_weight ?? 0), 3),
                'total_value' => (float) $totalValue,
            ],
            'paginatorInfo' => $this->paginatorInfo($paginator),
        ];
    }

    public function slip(int|string $id): array
    {
        $this->ensurePermission('export_slips.read');
        $slip = ExportSlip::query()
            ->whereNotNull('shipping_task_id')
            ->with([
                'task.deliveryStaff',
                'task.warehouse',
                'task.creator',
                'task.taskOrders.order.customer',
                'creator',
                'items.package.cnPackage.order.customer',
                'items.package.paymentVoucherPackage',
                'items.package.paymentVoucher.transactions.confirmer',
            ])
            ->findOrFail($id);

        return $this->slipRow($slip, true);
    }

    public function presentTask(ShippingTask $task): array
    {
        return $this->taskRow($task);
    }

    private function queueOrderQuery(array $filter): Builder
    {
        $packageConstraint = function ($query) use ($filter) {
            $query->where('payment_status', 'paid')
                ->where('delivery_status', 'ready_for_delivery')
                ->whereDoesntHave('exportItem')
                ->when($this->filled($filter, 'date_from'), fn ($q) => $q->whereHas(
                    'paymentVoucher.invoice',
                    fn (Builder $invoice) => $invoice->whereDate('issued_at', '>=', $filter['date_from'])
                ))
                ->when($this->filled($filter, 'date_to'), fn ($q) => $q->whereHas(
                    'paymentVoucher.invoice',
                    fn (Builder $invoice) => $invoice->whereDate('issued_at', '<=', $filter['date_to'])
                ));
        };

        return Order::query()
            ->with('customer')
            ->with(['cnPackages' => function ($query) use ($packageConstraint, $filter) {
                $query->when($this->filled($filter, 'carrier'), fn ($q) => $q->where('carrier', $filter['carrier']))
                    ->with(['vnPackages' => function ($query) use ($packageConstraint) {
                        $packageConstraint($query);
                        $query->with(['paymentVoucher.invoice', 'paymentVoucherPackage', 'receipt.warehouse']);
                    }]);
            }])
            ->whereHas('cnPackages', function (Builder $cnPackages) use ($packageConstraint, $filter) {
                $cnPackages
                    ->when($this->filled($filter, 'carrier'), fn (Builder $q) => $q->where('carrier', $filter['carrier']))
                    ->whereHas('vnPackages', $packageConstraint);
            })
            ->when(isset($filter['order_ids']) && is_array($filter['order_ids']), fn (Builder $q) => $q->whereIn('id', $filter['order_ids']))
            ->when($this->filled($filter, 'search'), function (Builder $query) use ($filter, $packageConstraint) {
                $search = trim((string) $filter['search']);
                $query->where(function (Builder $nested) use ($search, $packageConstraint) {
                    $nested->where('order_code', 'like', "%{$search}%")
                        ->orWhereHas('customer', function (Builder $customer) use ($search) {
                            $customer->where('name', 'like', "%{$search}%")
                                ->orWhere('phone', 'like', "%{$search}%");
                        })
                        ->orWhereHas('cnPackages.vnPackages', function (Builder $package) use ($search, $packageConstraint) {
                            $packageConstraint($package);
                            $package->where('tracking_number_snapshot', 'like', "%{$search}%");
                        });
                });
            })
            ->latest('updated_at')
            ->latest('id');
    }

    private function queueOrderRow(Order $order): array
    {
        $cnPackages = $order->cnPackages;
        $packages = $cnPackages->flatMap->vnPackages->values();
        $paidAt = $packages
            ->map(fn (VnPackage $package) => $package->paymentVoucher?->invoice?->issued_at ?? $package->payment_locked_at)
            ->filter()
            ->sortDesc()
            ->first();
        $carriers = $cnPackages->pluck('carrier')->filter()->unique()->values();

        return [
            'id' => (string) $order->id,
            'order_code' => $order->order_code,
            'tracking_numbers' => $packages->pluck('tracking_number_snapshot')->filter()->values()->all(),
            'customer_name' => $order->customer?->name ?? '-',
            'customer_phone' => $order->customer?->phone,
            'customer_address' => $order->customer?->address,
            'carrier' => $carriers->count() === 1 ? $carriers->first() : ($carriers->isEmpty() ? null : 'Nhiều đơn vị'),
            'payment_date' => $paidAt instanceof Carbon ? $paidAt : ($paidAt ? Carbon::parse($paidAt) : null),
            'package_count' => $packages->count(),
            'total_weight' => round((float) $packages->sum('actual_weight'), 3),
            'total_value' => ($paidValue = (float) $packages->sum(fn (VnPackage $package) => $this->packagePaidValue($package))) > 0
                ? $paidValue
                : (float) ($order->product_total_vnd ?? 0),
            'status' => 'pending',
            'packages' => $packages->map(fn (VnPackage $package) => $this->packageRow($package))->all(),
        ];
    }

    private function packageRow(VnPackage $package): array
    {
        return [
            'id' => (string) $package->id,
            'tracking_number' => $package->tracking_number_snapshot,
            'length' => (float) ($package->actual_length ?? 0),
            'width' => (float) ($package->actual_width ?? 0),
            'height' => (float) ($package->actual_height ?? 0),
            'weight' => (float) ($package->actual_weight ?? 0),
        ];
    }

    private function queueStats(Collection $rows): array
    {
        return [
            'total_orders' => $rows->count(),
            'total_packages' => (int) $rows->sum('package_count'),
            'total_weight' => round((float) $rows->sum('total_weight'), 3),
            'total_value' => (float) $rows->sum('total_value'),
        ];
    }

    private function taskRow(ShippingTask $task): array
    {
        return [
            'id' => (string) $task->id,
            'task_code' => $task->task_code,
            'export_slip_id' => $task->exportSlip ? (string) $task->exportSlip->id : null,
            'export_code' => $task->exportSlip?->export_code,
            'delivery_staff_name' => $task->deliveryStaff?->name,
            'delivery_staff_id' => $task->deliveryStaff ? (string) $task->deliveryStaff->id : null,
            'delivery_staff_phone' => $task->deliveryStaff?->phone,
            'carrier_name' => $task->carrier_name,
            'warehouse_name' => $task->warehouse?->name,
            'order_count' => $task->taskOrders->count(),
            'total_packages' => (int) ($task->total_packages ?? $task->taskOrders->sum('package_count')),
            'total_weight' => (float) ($task->total_weight ?? $task->taskOrders->sum('total_weight')),
            'total_value' => (float) ($task->total_value ?? $task->taskOrders->sum('total_value')),
            'created_at' => $task->created_at,
            'scheduled_delivery_date' => $task->scheduled_delivery_date?->toDateString(),
            'status' => $task->status,
            'note' => $task->note,
            'service_type' => $task->service_type,
            'delivery_method' => $task->delivery_method,
            'estimated_shipping_fee' => (float) ($task->estimated_shipping_fee ?? 0),
            'cod_amount' => $task->cod_amount !== null ? (float) $task->cod_amount : null,
            'transport_note' => $task->transport_note,
            'orders' => $task->taskOrders->map(fn (ShippingTaskOrder $taskOrder) => [
                'id' => (string) $taskOrder->order_id,
                'order_code' => $taskOrder->order?->order_code,
                'customer_name' => $taskOrder->order?->customer?->name,
                'package_count' => $taskOrder->package_count,
                'total_weight' => $taskOrder->total_weight,
                'total_value' => $taskOrder->total_value,
            ])->values()->all(),
        ];
    }

    private function slipRow(ExportSlip $slip, bool $withDetails = false): array
    {
        $task = $slip->task;
        $taskOrders = $task?->taskOrders ?? collect();
        $items = $slip->items ?? collect();
        $row = [
            'id' => (string) $slip->id,
            'export_code' => $slip->export_code,
            'task_id' => $task ? (string) $task->id : null,
            'task_code' => $task?->task_code,
            'status' => $task?->status ?? match ($slip->status) {
                'in_transit' => ShippingTask::STATUS_IN_TRANSIT,
                'delivered' => ShippingTask::STATUS_COMPLETED,
                'returned' => ShippingTask::STATUS_CANCELLED,
                default => ShippingTask::STATUS_CREATED,
            },
            'created_at' => $slip->created_at,
            'scheduled_delivery_date' => $slip->scheduled_delivery_date?->toDateString(),
            'creator_name' => $slip->creator?->name,
            'delivery_staff_name' => $task?->deliveryStaff?->name,
            'delivery_staff_phone' => $task?->deliveryStaff?->phone,
            'carrier_name' => $task?->carrier_name,
            'warehouse_name' => $task?->warehouse?->name,
            'note' => $task?->note ?? $slip->note,
            'order_count' => $taskOrders->count(),
            'total_packages' => $items->count(),
            'total_weight' => round((float) $items->sum(fn (ExportItem $item) => $item->package?->actual_weight ?? 0), 3),
            'total_value' => (float) $taskOrders->sum('total_value'),
        ];

        if (! $withDetails) {
            return $row;
        }

        $row['customers'] = $taskOrders->map(function (ShippingTaskOrder $taskOrder) {
            $customer = $taskOrder->order?->customer;

            return [
                'order_code' => $taskOrder->order?->order_code,
                'name' => $customer?->name,
                'phone' => $customer?->phone,
                'address' => $customer?->address,
            ];
        })->values()->all();
        $row['orders'] = $taskOrders->map(function (ShippingTaskOrder $taskOrder) {
            return [
                'id' => (string) $taskOrder->order_id,
                'order_code' => $taskOrder->order?->order_code,
                'customer_name' => $taskOrder->order?->customer?->name,
                'package_count' => $taskOrder->package_count,
                'total_weight' => $taskOrder->total_weight,
                'total_value' => $taskOrder->total_value,
            ];
        })->values()->all();
        $row['packages'] = $items->map(function (ExportItem $item) {
            $package = $item->package;
            $order = $package?->cnPackage?->order;
            $customer = $order?->customer;

            return [
                ...$this->packageRow($package),
                'order_id' => $order ? (string) $order->id : null,
                'order_code' => $order?->order_code,
                'customer_name' => $customer?->name,
                'customer_phone' => $customer?->phone,
                'value' => ($paidValue = $this->packagePaidValue($package)) > 0
                    ? $paidValue
                    : (float) ($order?->product_total_vnd ?? 0),
            ];
        })->values()->all();
        $row['service_type'] = $task?->service_type;
        $row['delivery_method'] = $task?->delivery_method;
        $row['transport_note'] = $task?->transport_note;
        $row['payment'] = $this->slipPaymentSummary($items);
        $orderValue = (float) $taskOrders->sum(fn (ShippingTaskOrder $taskOrder) => $taskOrder->order?->product_total_vnd ?? 0);
        $weightShippingFee = (float) $items->sum(function (ExportItem $item) {
            $paymentPackage = $item->package?->paymentVoucherPackage;

            return (float) ($paymentPackage?->shipping_fee ?? 0);
        });
        $voucherIds = $items->pluck('package.payment_voucher_id')->filter()->unique()->values();
        $deliveryFee = (float) PaymentVoucherItem::query()
            ->whereIn('payment_voucher_id', $voucherIds)
            ->where('item_type', 'domestic_shipping')
            ->sum('amount');
        $actualShippingFee = $weightShippingFee + $deliveryFee;
        $shippingFee = (float) ($task?->estimated_shipping_fee ?? 0) > 0
            ? (float) $task->estimated_shipping_fee
            : $actualShippingFee;
        $codAmount = $task?->cod_amount !== null ? (float) $task->cod_amount : null;
        $row['financials'] = [
            'order_value' => $orderValue,
            'shipping_fee' => $shippingFee,
            'cod_amount' => $codAmount,
            'total_amount' => $orderValue + $shippingFee + (float) ($codAmount ?? 0),
        ];
        $row['history'] = $task ? AuditLog::query()
            ->with('user')
            ->whereIn('entity_type', ['ShippingTask', ShippingTask::class])
            ->where('entity_id', $task->id)
            ->latest('created_at')
            ->latest('id')
            ->get()
            ->map(fn (AuditLog $log) => [
                'id' => (string) $log->id,
                'action' => $log->action,
                'from_status' => $log->after_data['from'] ?? null,
                'to_status' => $log->after_data['to'] ?? null,
                'actor_name' => $log->user?->name,
                'created_at' => $log->created_at,
            ])->all() : [];

        return $row;
    }

    private function slipPaymentSummary(Collection $items): array
    {
        $packages = $items->map(fn (ExportItem $item) => $item->package)->filter()->values();
        $paidPackages = $packages->where('payment_status', 'paid');
        $vouchers = $packages->pluck('paymentVoucher')->filter()->unique('id')->values();
        $transactions = $vouchers->flatMap->transactions
            ->where('status', 'confirmed')
            ->unique('id')
            ->sortByDesc('received_at')
            ->values();
        $latest = $transactions->first();
        $fallbackPaidAt = $paidPackages->pluck('payment_locked_at')->filter()->sortDesc()->first();
        $allPaid = $packages->isNotEmpty() && $paidPackages->count() === $packages->count();

        return [
            'status' => $allPaid ? 'paid' : ($paidPackages->isNotEmpty() ? 'partial' : 'unpaid'),
            'paid_package_count' => $paidPackages->count(),
            'total_package_count' => $packages->count(),
            'paid_at' => $latest?->received_at ?? $fallbackPaidAt,
            'payment_method' => $latest?->payment_method ?? ($vouchers->pluck('payment_method_expected')->filter()->unique()->count() === 1 ? $vouchers->first()?->payment_method_expected : null),
            'transaction_code' => $latest?->bank_transaction_code ?: $latest?->transaction_code,
            'bank_name' => $latest?->bank_name,
            'confirmed_by' => $latest?->confirmer?->name,
            'paid_amount' => $transactions->isNotEmpty()
                ? (float) $transactions->sum('amount')
                : (float) $packages->sum(fn (VnPackage $package) => $this->packagePaidValue($package)),
        ];
    }

    private function loadTask(int $id): ShippingTask
    {
        return ShippingTask::query()
            ->with(['deliveryStaff', 'warehouse', 'creator', 'exportSlip', 'taskOrders.order.customer'])
            ->withSum('taskOrders as total_packages', 'package_count')
            ->withSum('taskOrders as total_weight', 'total_weight')
            ->withSum('taskOrders as total_value', 'total_value')
            ->findOrFail($id);
    }

    private function packagePaidValue(VnPackage $package): float
    {
        return (float) ($package->paymentVoucherPackage?->total_amount ?? 0);
    }

    private function datedCode(string $prefix, int $id, Carbon $createdAt): string
    {
        $businessDate = $createdAt->copy()->setTimezone((string) config('app.business_timezone', 'Asia/Bangkok'));

        return sprintf('%s-%s-%04d', $prefix, $businessDate->format('Ymd'), $id);
    }

    private function paginatorInfo($paginator): array
    {
        return [
            'currentPage' => $paginator->currentPage(),
            'lastPage' => $paginator->lastPage(),
            'perPage' => $paginator->perPage(),
            'total' => $paginator->total(),
            'firstItem' => $paginator->firstItem(),
            'lastItem' => $paginator->lastItem(),
        ];
    }

    private function normalizeIds(array $ids): array
    {
        return array_values(array_unique(array_filter(array_map(fn ($id) => (int) $id, $ids))));
    }

    private function ensurePermission(string $permission): void
    {
        app(PermissionService::class)->authorize(Auth::user(), $permission);
    }

    private function audit(string $action, object $entity, array $after): void
    {
        AuditLog::query()->create([
            'user_id' => Auth::id(),
            'action' => $action,
            'entity_type' => class_basename($entity),
            'entity_id' => $entity->id ?? null,
            'before_data' => null,
            'after_data' => $after,
            'ip' => request()?->ip(),
            'user_agent' => request()?->userAgent(),
            'created_at' => now(),
        ]);
    }

    private function filled(array $values, string $key): bool
    {
        return array_key_exists($key, $values)
            && $values[$key] !== null
            && trim((string) $values[$key]) !== '';
    }
}
