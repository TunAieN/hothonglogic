<?php
/**
 * Simple PHP API for Orders
 * Works without Laravel framework
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Database configuration
$dbConfig = [
    'host' => '127.0.0.1',
    'database' => 'logistics_system',
    'username' => 'root',
    'password' => '',
    'charset' => 'utf8mb4'
];

try {
    $pdo = new PDO(
        "mysql:host={$dbConfig['host']};dbname={$dbConfig['database']};charset={$dbConfig['charset']}",
        $dbConfig['username'],
        $dbConfig['password'],
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
        ]
    );
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed']);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $data = json_decode(file_get_contents('php://input'), true);

        // Validate basic data
        if (empty($data['customer_id']) || empty($data['items'])) {
            throw new Exception('Customer and items are required');
        }

        $pdo->beginTransaction();

        // 1. Generate Order Code (ORD-YYYYMMDD-XXXX)
        $date = date('Ymd');
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM orders WHERE DATE(created_at) = CURDATE()");
        $stmt->execute();
        $count = $stmt->fetchColumn();
        $sequence = str_pad($count + 1, 4, '0', STR_PAD_LEFT);
        $orderCode = "ORD-{$date}-{$sequence}";

        // 2. Calculate Total
        $totalAmount = 0;
        foreach ($data['items'] as $item) {
            $totalAmount += ($item['price_cny'] * $item['quantity']);
        }

        // 3. Create Order
        // Note: created_by hardcoded to 1 (Admin) for now since extension has no auth
        $stmt = $pdo->prepare("
            INSERT INTO orders (order_code, customer_id, status, total_amount, note, created_by, created_at, updated_at)
            VALUES (?, ?, 'pending', ?, ?, 1, NOW(), NOW())
        ");
        
        $stmt->execute([
            $orderCode,
            $data['customer_id'],
            $totalAmount,
            $data['note'] ?? ''
        ]);
        
        $orderId = $pdo->lastInsertId();

        // 4. Create Order Items
        $stmtItem = $pdo->prepare("
            INSERT INTO order_items (order_id, product_name, product_link, price_cny, quantity, note, product_image, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        ");

        foreach ($data['items'] as $item) {
            $stmtItem->execute([
                $orderId,
                $item['product_name'] ?? 'Unknown Product',
                $item['product_link'] ?? '',
                $item['price_cny'] ?? 0,
                $item['quantity'] ?? 1,
                $item['note'] ?? '',
                $item['product_image'] ?? ''
            ]);
        }

        $pdo->commit();

        echo json_encode([
            'success' => true,
            'message' => 'Order created successfully',
            'data' => [
                'order_id' => $orderId,
                'order_code' => $orderCode
            ]
        ]);

    } catch (Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
} else {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
}
