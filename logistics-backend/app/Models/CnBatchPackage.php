<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CnBatchPackage extends Model
{
    protected $fillable = [
        'cn_batch_id',
        'cn_package_id',
    ];

    public function batch()
    {
        return $this->belongsTo(CnBatch::class, 'cn_batch_id');
    }

    public function package()
    {
        return $this->belongsTo(CnPackage::class, 'cn_package_id');
    }
}
