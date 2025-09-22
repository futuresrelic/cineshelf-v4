<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: X-User-ID, X-Restore-Version, X-Device-Type, Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Handle both GET and POST requests
$user = '';
$forceFile = '';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $user = isset($_GET['user']) ? $_GET['user'] : '';
    $forceFile = isset($_GET['file']) ? $_GET['file'] : '';
} else if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $user = $input['user'] ?? '';
    $forceFile = $input['file'] ?? '';
}

$user = preg_replace('/[^a-zA-Z0-9_-]/', '', $user);

if (!$user) {
    http_response_code(400);
    echo json_encode(['error' => 'User parameter required']);
    exit;
}

// Function to find backup files for a user
function findBackupFiles($user) {
    $files = [];
    if (file_exists('data')) {
        // Look for exact match first
        $exactFile = "data/cineshelf_backup_{$user}.json";
        if (file_exists($exactFile)) {
            $files[] = $exactFile;
        }
        
        // Look for any files containing the username
        $allFiles = glob("data/cineshelf_backup_*.json");
        foreach ($allFiles as $file) {
            $basename = basename($file, '.json');
            if (strpos($basename, $user) !== false && $file !== $exactFile) {
                $files[] = $file;
            }
        }
        
        // Sort by modification time (newest first)
        usort($files, function($a, $b) {
            return filemtime($b) - filemtime($a);
        });
    }
    return $files;
}

// If specific file requested, use it
if ($forceFile) {
    $filename = "data/" . basename($forceFile); // Sanitize filename
    if (!file_exists($filename)) {
        http_response_code(404);
        echo json_encode(['error' => 'Specified file not found', 'file' => $forceFile]);
        exit;
    }
} else {
    // Find best backup file for user
    $availableFiles = findBackupFiles($user);
    
    if (empty($availableFiles)) {
        // No files found - list all available for debugging
        $allFiles = glob("data/cineshelf_backup_*.json");
        http_response_code(404);
        echo json_encode([
            'error' => 'No backup found for this user',
            'user' => $user,
            'available_backups' => array_map(function($file) {
                $basename = basename($file, '.json');
                $user_part = str_replace('cineshelf_backup_', '', $basename);
                return [
                    'filename' => basename($file),
                    'user_part' => $user_part,
                    'modified' => date('c', filemtime($file)),
                    'size' => filesize($file)
                ];
            }, $allFiles),
            'suggestion' => 'Try using the file parameter to specify which backup to restore'
        ]);
        exit;
    }
    
    $filename = $availableFiles[0]; // Use most recent
}

// Read and return the backup data
$data = file_get_contents($filename);
if ($data === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to read backup file']);
    exit;
}

// Verify it's valid JSON
$jsonData = json_decode($data, true);
if ($jsonData === null) {
    http_response_code(500);
    echo json_encode(['error' => 'Backup file contains invalid JSON']);
    exit;
}

// Add metadata about which file was used
$jsonData['_restore_metadata'] = [
    'filename_used' => basename($filename),
    'restored_at' => date('c'),
    'user_requested' => $user,
    'file_forced' => !empty($forceFile)
];

echo json_encode($jsonData);
?>