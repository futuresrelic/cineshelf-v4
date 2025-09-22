<?php
// CineShelf Global Database Configuration
define('DB_HOST', 'localhost');
define('DB_NAME', 'cineshelf_global');
define('DB_USER', 'cineshelf_user');
define('DB_PASS', 'your_secure_password');

// API Configuration
define('API_VERSION', 'v1');
define('JWT_SECRET', 'your_jwt_secret_key_here');
define('SESSION_TIMEOUT', 3600); // 1 hour

// CORS Headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-User-ID');
header('Content-Type: application/json');

// Handle OPTIONS requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Database Connection
try {
    $pdo = new PDO("mysql:host=" . DB_HOST . ";dbname=" . DB_NAME, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed']);
    exit();
}

// Helper Functions
function generateUserId() {
    return 'user_' . bin2hex(random_bytes(8));
}

function validateUserId($userId) {
    return preg_match('/^user_[a-f0-9]{16}$/', $userId);
}

function logActivity($pdo, $userId, $action, $details = null) {
    $stmt = $pdo->prepare("INSERT INTO user_activity (user_id, action, details, created_at) VALUES (?, ?, ?, NOW())");
    $stmt->execute([$userId, $action, json_encode($details)]);
}
?>