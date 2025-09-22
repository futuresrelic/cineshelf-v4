<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-User-ID, X-Backup-Version');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);

if (!$input || !isset($input['user'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid data - user field required']);
    exit;
}

// Clean and validate the username
$user = preg_replace('/[^a-zA-Z0-9_-]/', '', $input['user']);
if (empty($user)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid username']);
    exit;
}

// ALWAYS use this clean filename format
$filename = "data/cineshelf_backup_{$user}.json";

// Create data directory if it doesn't exist
if (!file_exists('data')) {
    mkdir('data', 0755, true);
}

// Log what we're doing for debugging
error_log("CineShelf Backup: User '{$user}' -> File '{$filename}'");
error_log("CineShelf Backup: Input data keys: " . implode(', ', array_keys($input)));

// Add clean metadata to backup
$input['backupLabel'] = "Backup for {$user}";
$input['backupTime'] = date('Y-m-d H:i:s');
$input['serverVersion'] = '2.1';
$input['filename_created'] = basename($filename);

// Write the backup file
if (file_put_contents($filename, json_encode($input, JSON_PRETTY_PRINT))) {
    error_log("CineShelf Backup: SUCCESS - Wrote to {$filename}");
    echo json_encode([
        'success' => true, 
        'message' => 'Backup saved successfully',
        'filename' => basename($filename),
        'user' => $user,
        'timestamp' => date('c')
    ]);
} else {
    error_log("CineShelf Backup: FAILED - Could not write to {$filename}");
    http_response_code(500);
    echo json_encode(['error' => 'Failed to save backup']);
}
?>