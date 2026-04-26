<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Customer extends Model
{
    protected $fillable = [
        'code',
        'name',
        'phone',
        'email',
        'address',
        'note',
        'status'
    ];
    public function getOrdersCountAttribute()
    {
        return $this->orders()->count();
    }
    protected $appends = ['orders_count'];

    function orders()
    {
        return $this->hasMany(Order::class);
    }
}
    
