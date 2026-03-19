<?php
/**
 * Simple PHP API for Customers
 * Works without Laravel framework
 * 
 * Place this in c:\laragon\www\extention\api\
 * Access at: http://extention.test/api/customers.php
 * Or: http://localhost/extention/api/customers.php
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
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

// Connect to database
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
    echo json_encode([
        'success' => false,
        'message' => 'Database connection failed: ' . $e->getMessage()
    ]);
    exit();
}

// Get request method
$method = $_SERVER['REQUEST_METHOD'];

// Handle GET request - List customers
if ($method === 'GET') {
    try {
        // Check if specific ID requested
        $id = $_GET['id'] ?? null;
        
        if ($id) {
            // Get single customer
            $stmt = $pdo->prepare("SELECT * FROM customers WHERE id = ?");
            $stmt->execute([$id]);
            $customer = $stmt->fetch();
            
            if ($customer) {
                echo json_encode(['success' => true, 'data' => $customer]);
            } else {
                http_response_code(404);
                echo json_encode(['success' => false, 'message' => 'Customer not found']);
            }
        } else {
            // Get all customers
            $status = $_GET['status'] ?? 'active';
            $search = $_GET['search'] ?? null;
            
            $sql = "SELECT * FROM customers WHERE status = ?";
            $params = [$status];
            
            if ($search) {
                $sql .= " AND (name LIKE ? OR code LIKE ? OR phone LIKE ?)";
                $searchTerm = "%{$search}%";
                $params[] = $searchTerm;
                $params[] = $searchTerm;
                $params[] = $searchTerm;
            }
            
            $sql .= " ORDER BY created_at DESC";
            
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $customers = $stmt->fetchAll();
            
            echo json_encode(['success' => true, 'data' => $customers]);
        }
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
}

// Handle POST request - Create customer
elseif ($method === 'POST') {
    try {
        $data = json_decode(file_get_contents('php://input'), true);
        
        // Validate required fields
        if (empty($data['code']) || empty($data['name']) || empty($data['phone'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Code, name, and phone are required']);
            exit();
        }
        
        $stmt = $pdo->prepare("
            INSERT INTO customers (code, name, phone, email, address, note, status, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        ");
        
        $stmt->execute([
            $data['code'],
            $data['name'],
            $data['phone'],
            $data['email'] ?? null,
            $data['address'] ?? null,
            $data['note'] ?? null,
            $data['status'] ?? 'active'
        ]);
        
        $id = $pdo->lastInsertId();
        
        // Fetch created customer
        $stmt = $pdo->prepare("SELECT * FROM customers WHERE id = ?");
        $stmt->execute([$id]);
        $customer = $stmt->fetch();
        
        http_response_code(201);
        echo json_encode([
            'success' => true, 
            'message' => 'Tạo khách hàng thành công',
            'data' => $customer
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
}

// Handle PUT request - Update customer
elseif ($method === 'PUT') {
    try {
        $id = $_GET['id'] ?? null;
        
        if (!$id) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Customer ID is required']);
            exit();
        }
        
        $data = json_decode(file_get_contents('php://input'), true);
        
        $fields = [];
        $params = [];
        
        foreach (['code', 'name', 'phone', 'email', 'address', 'note', 'status'] as $field) {
            if (isset($data[$field])) {
                $fields[] = "{$field} = ?";
                $params[] = $data[$field];
            }
        }
        
        if (empty($fields)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'No fields to update']);
            exit();
        }
        
        $fields[] = "updated_at = NOW()";
        $params[] = $id;
        
        $sql = "UPDATE customers SET " . implode(', ', $fields) . " WHERE id = ?";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        
        // Fetch updated customer
        $stmt = $pdo->prepare("SELECT * FROM customers WHERE id = ?");
        $stmt->execute([$id]);
        $customer = $stmt->fetch();
        
        echo json_encode([
            'success' => true,
            'message' => 'Cập nhật khách hàng thành công',
            'data' => $customer
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
}

// Handle DELETE request
elseif ($method === 'DELETE') {
    try {
        $id = $_GET['id'] ?? null;
        
        if (!$id) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Customer ID is required']);
            exit();
        }
        
        // Check if customer has orders
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM orders WHERE customer_id = ?");
        $stmt->execute([$id]);
        $orderCount = $stmt->fetchColumn();
        
        if ($orderCount > 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Không thể xóa khách hàng đã có đơn hàng']);
            exit();
        }
        
        $stmt = $pdo->prepare("DELETE FROM customers WHERE id = ?");
        $stmt->execute([$id]);
        
        echo json_encode(['success' => true, 'message' => 'Xóa khách hàng thành công']);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
}

else {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
}
