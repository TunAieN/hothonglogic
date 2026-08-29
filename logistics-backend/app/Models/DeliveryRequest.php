<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class DeliveryRequest extends Model
{
    use SoftDeletes;

    public const METHOD_PICKUP = 'pickup_at_warehouse';
    public const METHOD_DELIVERY = 'delivery';
    public const STATUS_DRAFT = 'draft';
    public const STATUS_AWAITING_PAYMENT = 'awaiting_payment';
    public const STATUS_READY_TO_SHIP = 'ready_to_ship';
    public const STATUS_PROCESSING = 'processing';
    public const STATUS_CANCELLED = 'cancelled';

    protected $fillable = ['customer_id', 'payment_voucher_id', 'order_id', 'shipping_task_id', 'delivery_method', 'preferred_carrier', 'delivery_note', 'status', 'created_by'];

    public function customer() { return $this->belongsTo(Customer::class); }
    public function paymentVoucher() { return $this->belongsTo(PaymentVoucher::class); }
    public function order() { return $this->belongsTo(Order::class); }
    public function shippingTask() { return $this->belongsTo(ShippingTask::class); }
    public function address() { return $this->hasOne(DeliveryAddress::class); }
    public function shipments() { return $this->hasMany(Shipment::class); }
    public function creator() { return $this->belongsTo(User::class, 'created_by'); }
}
