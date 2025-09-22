<?php
header('Content-Type: text/html; charset=utf-8');
header('Access-Control-Allow-Origin: *');

echo "<!DOCTYPE html><html><head><title>CineShelf Debug</title>";
echo "<style>body{font-family:Arial,sans-serif;margin:20px;} table{border-collapse:collapse;width:100%;} th,td{border:1px solid #ddd;padding:8px;text-align:left;} th{background-color:#f2f2f2;} .success{color:green;} .error{color:red;} .info{color:blue;} pre{background:#f0f0f0;padding:10px;border-radius:4px;}</style>";
echo "</head><body>";

echo "<h2>🎬 CineShelf Server Debug Panel</h2>";

// Check if data directory exists
if (!file_exists('../data')) {
    echo "<p><strong class='error'>❌ No 'data' directory found!</strong></p>";
    echo "<p>Create a 'data' folder in your web root.</p>";
    exit;
}

echo "<p class='success'>✅ Data directory exists</p>";

// List all backup files
$files = glob("../data/cineshelf_backup_*.json");

if (empty($files)) {
    echo "<p><strong class='error'>❌ No backup files found!</strong></p>";
    echo "<p>No files matching pattern: data/cineshelf_backup_*.json</p>";
} else {
    echo "<h3>📁 Found " . count($files) . " backup files:</h3>";
    echo "<table>";
    echo "<tr><th>Filename</th><th>Size</th><th>Modified</th><th>User Part</th><th>Actions</th></tr>";
    
    foreach ($files as $file) {
        $filename = basename($file);
        $size = round(filesize($file) / 1024, 1) . ' KB';
        $modified = date('Y-m-d H:i:s', filemtime($file));
        
        // Extract user part from filename
        $userPart = str_replace(['cineshelf_backup_', '.json'], '', $filename);
        
        echo "<tr>";
        echo "<td>{$filename}</td>";
        echo "<td>{$size}</td>";
        echo "<td>{$modified}</td>";
        echo "<td><strong>{$userPart}</strong></td>";
        echo "<td><a href='?delete={$filename}' onclick='return confirm(\"Delete {$filename}?\")' style='color:red;'>Delete</a></td>";
        echo "</tr>";
    }
    echo "</table>";
}

// Handle file deletion
if (isset($_GET['delete'])) {
    $fileToDelete = $_GET['delete'];
    $safeName = basename($fileToDelete); // Security: only filename, no path
    $fullPath = "../data/" . $safeName;
    
    if (file_exists($fullPath)) {
        if (unlink($fullPath)) {
            echo "<p class='success'>✅ Deleted: {$safeName}</p>";
            echo "<script>setTimeout(() => location.reload(), 1000);</script>";
        } else {
            echo "<p class='error'>❌ Failed to delete: {$safeName}</p>";
        }
    }
}

// Test endpoints
echo "<h3>🔗 Endpoint Tests:</h3>";
$endpoints = [
    'Main Backup' => '../backup.php',
    'Main Restore' => '../restore.php', 
    'API Backup' => '../api/backup.php',
    'API Restore' => '../api/restore.php'
];

foreach ($endpoints as $name => $file) {
    if (file_exists($file)) {
        echo "<p class='success'>✅ {$name}: {$file}</p>";
    } else {
        echo "<p class='error'>❌ {$name}: {$file} (MISSING)</p>";
    }
}

// Show file structure
echo "<h3>📂 Expected File Structure:</h3>";
echo "<pre>";
echo "/ (web root)\n";
echo "├── index.html\n";
echo "├── backup.php ✓\n";
echo "├── restore.php ✓\n";
echo "├── js/\n";
echo "│   └── app.js\n";
echo "├── api/\n";
echo "│   ├── backup.php ✓\n";
echo "│   └── restore.php ✓\n";
echo "├── admin/\n";
echo "│   └── debug-files.php ✓ (this file)\n";
echo "└── data/\n";
echo "    └── cineshelf_backup_*.json\n";
echo "</pre>";

// Show recommended clean filename
echo "<h3>🎯 Recommended Clean Filename:</h3>";
echo "<p><code>cineshelf_backup_username.json</code></p>";

echo "<h3>🔧 Troubleshooting:</h3>";
echo "<ol>";
echo "<li>Make sure all PHP files have proper permissions (644)</li>";
echo "<li>Make sure data/ folder has write permissions (755)</li>";
echo "<li>Check your web server error logs if backups fail</li>";
echo "<li>Use this debug page to verify file structure</li>";
echo "</ol>";

echo "<p style='margin-top:20px;'><a href='../'>← Back to CineShelf App</a></p>";

echo "</body></html>";
?>