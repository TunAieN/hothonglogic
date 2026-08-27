<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VnWarehouse extends Model
{
    protected $fillable = [
        'code',
        'name',
        'address',
    ];

    public function receipts()
    {
        return $this->hasMany(VnBatchReceipt::class, 'vn_warehouse_id');
    }
}
