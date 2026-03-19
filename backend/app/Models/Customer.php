<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Customer extends Model
{
    use HasFactory;

    protected $table = 'customers';

    protected $fillable = [
        'code',
        'name',
        'phone',
        'email',
        'address',
        'note',
        'status'
    ];

    protected $casts = [
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // Scope for active customers
    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    // Relationship with orders
    public function orders()
    {
        return $this->hasMany(Order::class);
    }
}
