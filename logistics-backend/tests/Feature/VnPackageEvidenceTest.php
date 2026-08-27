<?php

namespace Tests\Feature;

use App\GraphQL\Resolvers\VietnamWarehouseResolver;
use App\Models\Role;
use App\Models\User;
use App\Models\VnPackage;
use App\Models\VnPackageEvidence;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class VnPackageEvidenceTest extends TestCase
{
    use DatabaseTransactions;

    public function test_images_are_stored_against_the_correct_package(): void
    {
        $urlProbe = new VnPackageEvidence([
            'disk' => 'public',
            'file_path' => 'vietnam-warehouse/evidence/probe.jpg',
        ]);
        $this->assertSame(
            config('filesystems.disks.public.url').'/vietnam-warehouse/evidence/probe.jpg',
            $urlProbe->url,
        );

        Storage::fake('public');
        [$user, $package] = $this->createUserAndPackage();
        Sanctum::actingAs($user);

        $response = $this->post('/api/vietnam-warehouse/packages/'.$package->id.'/evidences', [
            'evidence_type' => 'reconciliation',
            'images' => [
                UploadedFile::fake()->image('damage-1.jpg'),
                UploadedFile::fake()->image('damage-2.png'),
                UploadedFile::fake()->image('damage-3.jpg'),
            ],
        ], ['Accept' => 'application/json']);

        $response->assertCreated()->assertJsonCount(3, 'data');
        $this->assertSame(3, $package->evidences()->count());
        $package->evidences->each(function (VnPackageEvidence $evidence) use ($package) {
            $this->assertSame($package->id, $evidence->vn_package_id);
            $this->assertSame('reconciliation', $evidence->evidence_type);
            Storage::disk('public')->assertExists($evidence->file_path);
        });

        $this->post('/api/vietnam-warehouse/packages/'.$package->id.'/evidences', [
            'evidence_type' => 'inspection',
            'images' => [UploadedFile::fake()->image('inspection-4.jpg')],
        ], ['Accept' => 'application/json'])->assertCreated();

        $errorPackage = app(VietnamWarehouseResolver::class)
            ->packages(null, ['filter' => ['scope' => 'error']])
            ->findOrFail($package->id);
        $this->assertTrue($errorPackage->relationLoaded('evidences'));
        $this->assertSame(4, $errorPackage->evidences->count());
        $this->assertSame('inspection', $errorPackage->evidences->last()->evidence_type);
    }

    public function test_invalid_file_does_not_remove_or_partially_store_valid_images(): void
    {
        Storage::fake('public');
        [$user, $package] = $this->createUserAndPackage();
        Sanctum::actingAs($user);

        $this->post('/api/vietnam-warehouse/packages/'.$package->id.'/evidences', [
            'images' => [
                UploadedFile::fake()->image('valid.jpg'),
                UploadedFile::fake()->create('invalid.pdf', 20, 'application/pdf'),
            ],
        ], ['Accept' => 'application/json'])->assertUnprocessable();

        $this->assertSame(0, $package->evidences()->count());
        $this->assertSame([], Storage::disk('public')->allFiles());
    }

    public function test_oversized_image_is_rejected_without_creating_evidence(): void
    {
        Storage::fake('public');
        [$user, $package] = $this->createUserAndPackage();
        Sanctum::actingAs($user);

        $this->post('/api/vietnam-warehouse/packages/'.$package->id.'/evidences', [
            'images' => [UploadedFile::fake()->image('too-large.jpg')->size(5121)],
        ], ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['images.0']);

        $this->assertSame(0, $package->evidences()->count());
        $this->assertSame([], Storage::disk('public')->allFiles());
    }

    public function test_total_image_limit_is_enforced_and_pending_evidence_can_be_deleted(): void
    {
        Storage::fake('public');
        [$user, $package] = $this->createUserAndPackage();
        Sanctum::actingAs($user);

        $this->post('/api/vietnam-warehouse/packages/'.$package->id.'/evidences', [
            'images' => array_map(fn ($index) => UploadedFile::fake()->image('image-'.$index.'.jpg'), range(1, 5)),
        ], ['Accept' => 'application/json'])->assertCreated();

        $this->post('/api/vietnam-warehouse/packages/'.$package->id.'/evidences', [
            'images' => [UploadedFile::fake()->image('image-6.jpg')],
        ], ['Accept' => 'application/json'])->assertUnprocessable();

        $evidence = $package->evidences()->firstOrFail();
        $this->deleteJson('/api/vietnam-warehouse/packages/'.$package->id.'/evidences/'.$evidence->id)
            ->assertOk();
        $this->assertSame(4, $package->evidences()->count());
        Storage::disk('public')->assertMissing($evidence->file_path);
    }

    public function test_evidence_of_completed_package_cannot_be_deleted(): void
    {
        Storage::fake('public');
        [$user, $package] = $this->createUserAndPackage();
        Sanctum::actingAs($user);
        $path = UploadedFile::fake()->image('official.jpg')->store('vietnam-warehouse/evidence/'.$package->id, 'public');
        $evidence = $package->evidences()->create([
            'evidence_type' => 'reconciliation',
            'disk' => 'public',
            'file_path' => $path,
            'original_name' => 'official.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 100,
            'created_by' => $user->id,
        ]);
        $package->update(['received_at' => now()]);

        $this->deleteJson('/api/vietnam-warehouse/packages/'.$package->id.'/evidences/'.$evidence->id)
            ->assertUnprocessable();
        $this->assertDatabaseHas('vn_package_evidences', ['id' => $evidence->id]);
        Storage::disk('public')->assertExists($path);
    }

    private function createUserAndPackage(): array
    {
        $suffix = uniqid();
        $role = Role::query()->firstOrCreate(['name' => 'evidence-test'], ['permissions' => []]);
        $user = User::query()->create([
            'name' => 'Evidence tester',
            'email' => 'evidence-'.$suffix.'@example.test',
            'password' => 'password',
            'role_id' => $role->id,
        ]);
        $package = VnPackage::query()->create([
            'tracking_number_snapshot' => 'EVIDENCE-'.$suffix,
            'physical_condition' => 'broken',
            'inspection_status' => VnPackage::STATUS_DAMAGED,
            'requires_item_inspection' => false,
            'item_inspection_status' => 'not_required',
            'error_resolution_status' => 'pending',
        ]);

        return [$user, $package];
    }
}
