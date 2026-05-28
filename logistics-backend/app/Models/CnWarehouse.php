<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CnWarehouse extends Model
{
    protected $fillable = [
        'code',
        'name',
        'address',
        'status',
    ];

    public function packages()
    {
        return $this->hasMany(CnPackage::class, 'warehouse_id');
    }

    public function batches()
    {
        return $this->hasMany(CnBatch::class, 'warehouse_id');
    }
}
