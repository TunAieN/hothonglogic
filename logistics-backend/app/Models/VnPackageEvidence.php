<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class VnPackageEvidence extends Model
{
    protected $table = 'vn_package_evidences';

    public const TYPE_RECONCILIATION = 'reconciliation';

    public const TYPE_INSPECTION = 'inspection';

    public const TYPE_RESOLUTION = 'resolution';

    public const TYPE_DOCUMENT = 'document';

    public const TYPES = [
        self::TYPE_RECONCILIATION,
        self::TYPE_INSPECTION,
        self::TYPE_RESOLUTION,
        self::TYPE_DOCUMENT,
    ];

    protected $fillable = [
        'vn_package_id',
        'evidence_type',
        'disk',
        'file_path',
        'original_name',
        'mime_type',
        'file_size',
        'created_by',
    ];

    protected $casts = [
        'file_size' => 'integer',
    ];

    protected $appends = ['url', 'thumbnail_url'];

    public function package()
    {
        return $this->belongsTo(VnPackage::class, 'vn_package_id');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function getUrlAttribute(): string
    {
        return Storage::disk($this->disk)->url($this->file_path);
    }

    public function getThumbnailUrlAttribute(): string
    {
        return $this->url;
    }
}
