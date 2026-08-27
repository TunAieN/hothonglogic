<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ExportItem extends Model
{
    protected $fillable = ['export_id', 'vn_package_id'];

    public function slip()
    {
        return $this->belongsTo(ExportSlip::class, 'export_id');
    }

    public function package()
    {
        return $this->belongsTo(VnPackage::class, 'vn_package_id');
    }
}
