<?php

namespace App\Http\Controllers;

use App\Models\VnPackage;
use App\Models\VnPackageEvidence;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Throwable;

class VnPackageEvidenceController extends Controller
{
    public const MAX_IMAGES = 5;

    public const MAX_FILE_KILOBYTES = 5120;

    public function store(Request $request, VnPackage $vnPackage): JsonResponse
    {
        $validated = $request->validate([
            'evidence_type' => ['nullable', Rule::in(VnPackageEvidence::TYPES)],
            'images' => ['required', 'array', 'min:1', 'max:'.self::MAX_IMAGES],
            'images.*' => ['required', 'file', 'mimes:jpg,jpeg,png,webp', 'max:'.self::MAX_FILE_KILOBYTES],
        ], [
            'images.max' => 'Mỗi mã vận đơn chỉ được tải tối đa 5 ảnh.',
            'images.*.mimes' => 'Chỉ hỗ trợ JPG, JPEG, PNG hoặc WEBP.',
            'images.*.max' => 'Ảnh vượt quá dung lượng cho phép (tối đa 5 MB).',
        ]);

        $existingCount = $vnPackage->evidences()->count();
        if ($existingCount + count($request->file('images', [])) > self::MAX_IMAGES) {
            throw new HttpException(422, 'Mỗi mã vận đơn chỉ được tải tối đa 5 ảnh.');
        }

        $disk = 'public';
        $storedPaths = [];
        $createdBy = $request->user()?->id;

        try {
            $evidences = DB::transaction(function () use ($request, $validated, $vnPackage, $disk, $createdBy, &$storedPaths) {
                return collect($request->file('images'))->map(function ($image) use ($validated, $vnPackage, $disk, $createdBy, &$storedPaths) {
                    $path = $image->store('vietnam-warehouse/evidence/'.$vnPackage->id, $disk);
                    if (! $path) {
                        throw new HttpException(500, 'Không thể lưu ảnh minh chứng.');
                    }
                    $storedPaths[] = $path;

                    return $vnPackage->evidences()->create([
                        'evidence_type' => $validated['evidence_type'] ?? VnPackageEvidence::TYPE_RECONCILIATION,
                        'disk' => $disk,
                        'file_path' => $path,
                        'original_name' => $image->getClientOriginalName(),
                        'mime_type' => $image->getMimeType() ?: $image->getClientMimeType(),
                        'file_size' => $image->getSize(),
                        'created_by' => $createdBy,
                    ])->load('creator');
                })->values();
            });
        } catch (Throwable $exception) {
            foreach ($storedPaths as $path) {
                Storage::disk($disk)->delete($path);
            }
            throw $exception;
        }

        return response()->json(['data' => $evidences], 201);
    }

    public function destroy(Request $request, VnPackage $vnPackage, VnPackageEvidence $evidence): JsonResponse
    {
        if ((int) $evidence->vn_package_id !== (int) $vnPackage->id) {
            throw new HttpException(404, 'Không tìm thấy ảnh minh chứng của mã vận đơn.');
        }

        if ($vnPackage->received_at !== null || $vnPackage->error_resolution_status === 'resolved') {
            throw new HttpException(422, 'Ảnh đã thuộc hồ sơ kiện hoàn tất và không thể xóa.');
        }

        $disk = $evidence->disk;
        $path = $evidence->file_path;
        $evidence->delete();
        Storage::disk($disk)->delete($path);

        return response()->json(['message' => 'Đã xóa ảnh minh chứng.']);
    }
}
