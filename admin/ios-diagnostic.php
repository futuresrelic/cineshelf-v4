<?php
header('Content-Type: text/html; charset=utf-8');

echo "<!DOCTYPE html><html><head><title>iPhone Camera Diagnostic</title>";
echo "<meta name='viewport' content='width=device-width, initial-scale=1.0'>";
echo "<style>
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;margin:20px;background:#f5f5f5;}
.status{padding:15px;margin:10px 0;border-radius:8px;font-weight:500;}
.success{background:#d4edda;color:#155724;border:1px solid #c3e6cb;}
.error{background:#f8d7da;color:#721c24;border:1px solid #f5c6cb;}
.warning{background:#fff3cd;color:#856404;border:1px solid #ffeaa7;}
.info{background:#d1ecf1;color:#0c5460;border:1px solid #bee5eb;}
button{background:#007AFF;color:white;border:none;padding:12px 20px;border-radius:8px;font-size:16px;margin:10px 5px 10px 0;cursor:pointer;}
button:hover{background:#0056CC;}
.test-area{background:white;padding:20px;border-radius:8px;margin:15px 0;box-shadow:0 2px 10px rgba(0,0,0,0.1);}
#videoTest{width:100%;max-width:300px;border-radius:8px;margin:10px 0;}
</style>";
echo "</head><body>";

echo "<h1>📱 iPhone Camera Diagnostic Tool</h1>";

// Check if HTTPS
$isHTTPS = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on';
$protocol = $isHTTPS ? 'https' : 'http';
$isLocalhost = $_SERVER['HTTP_HOST'] === 'localhost' || $_SERVER['HTTP_HOST'] === '127.0.0.1';

echo "<div class='test-area'>";
echo "<h2>🔒 HTTPS Status</h2>";

if ($isHTTPS || $isLocalhost) {
    echo "<div class='status success'>✅ HTTPS: OK " . ($isLocalhost ? "(localhost)" : "(secure)") . "</div>";
} else {
    echo "<div class='status error'>❌ HTTPS: REQUIRED for iPhone camera access</div>";
    echo "<p><strong>Solution:</strong> Enable HTTPS on your server or use https:// in the URL</p>";
}

echo "<p><strong>Current URL:</strong> " . $protocol . "://" . $_SERVER['HTTP_HOST'] . $_SERVER['REQUEST_URI'] . "</p>";
echo "</div>";

// Browser Detection
echo "<div class='test-area'>";
echo "<h2>🌐 Browser Detection</h2>";
$userAgent = $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown';
$isIOS = strpos($userAgent, 'iPhone') !== false || strpos($userAgent, 'iPad') !== false || strpos($userAgent, 'iPod') !== false;
$isSafari = strpos($userAgent, 'Safari') !== false && strpos($userAgent, 'Chrome') === false;

if ($isIOS) {
    echo "<div class='status info'>📱 iOS Device Detected</div>";
    if ($isSafari) {
        echo "<div class='status success'>✅ Safari Browser (Recommended for iOS)</div>";
    } else {
        echo "<div class='status warning'>⚠️ Non-Safari Browser - May have camera issues on iOS</div>";
        echo "<p><strong>Recommendation:</strong> Use Safari browser on iPhone for best camera support</p>";
    }
} else {
    echo "<div class='status info'>💻 Non-iOS Device</div>";
}

echo "<p><strong>User Agent:</strong> <small>" . htmlspecialchars($userAgent) . "</small></p>";
echo "</div>";

// Server Requirements
echo "<div class='test-area'>";
echo "<h2>🖥️ Server Requirements</h2>";

$requirements = [
    'PHP Version' => [
        'current' => PHP_VERSION,
        'required' => '7.0+',
        'status' => version_compare(PHP_VERSION, '7.0.0') >= 0
    ],
    'JSON Extension' => [
        'current' => extension_loaded('json') ? 'Available' : 'Missing',
        'required' => 'Required',
        'status' => extension_loaded('json')
    ],
    'File Upload' => [
        'current' => ini_get('file_uploads') ? 'Enabled' : 'Disabled',
        'required' => 'Enabled',
        'status' => ini_get('file_uploads')
    ]
];

foreach ($requirements as $name => $req) {
    $statusClass = $req['status'] ? 'success' : 'error';
    $icon = $req['status'] ? '✅' : '❌';
    echo "<div class='status {$statusClass}'>{$icon} {$name}: {$req['current']} (Required: {$req['required']})</div>";
}
echo "</div>";

// Live Camera Test
echo "<div class='test-area'>";
echo "<h2>📷 Live Camera Test</h2>";
echo "<p>Test camera access directly in this browser:</p>";

echo "<video id='videoTest' autoplay playsinline style='display:none;'></video>";
echo "<div id='cameraStatus'><div class='status info'>📱 Click 'Test Camera' to check camera access</div></div>";

echo "<button onclick='testCamera()'>📷 Test Camera</button>";
echo "<button onclick='stopCamera()'>⏹️ Stop Camera</button>";

echo "<script>
let testStream = null;

async function testCamera() {
    const video = document.getElementById('videoTest');
    const status = document.getElementById('cameraStatus');
    
    try {
        status.innerHTML = '<div class=\"status info\">📱 Requesting camera access...</div>';
        
        const constraints = {
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 640 },
                height: { ideal: 480 }
            }
        };
        
        testStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = testStream;
        video.style.display = 'block';
        
        status.innerHTML = '<div class=\"status success\">✅ Camera access successful! Your camera is working.</div>';
        
        // Test for iOS specific features
        if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
            status.innerHTML += '<div class=\"status success\">✅ iPhone camera compatibility confirmed</div>';
        }
        
    } catch (error) {
        let errorMsg = 'Camera test failed: ' + error.message;
        
        if (error.name === 'NotAllowedError') {
            errorMsg = '❌ Camera permission denied. Please allow camera access and try again.';
        } else if (error.name === 'NotFoundError') {
            errorMsg = '❌ No camera found on this device.';
        } else if (error.name === 'NotSupportedError') {
            errorMsg = '❌ Camera not supported in this browser.';
        }
        
        status.innerHTML = '<div class=\"status error\">' + errorMsg + '</div>';
        
        if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
            status.innerHTML += '<div class=\"status error\">🔒 HTTPS is required for camera access on iPhone!</div>';
        }
        
        console.error('Camera error:', error);
    }
}

function stopCamera() {
    const video = document.getElementById('videoTest');
    const status = document.getElementById('cameraStatus');
    
    if (testStream) {
        testStream.getTracks().forEach(track => track.stop());
        testStream = null;
    }
    
    video.style.display = 'none';
    status.innerHTML = '<div class=\"status info\">📷 Camera stopped</div>';
}

// Check for getUserMedia support
if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    document.getElementById('cameraStatus').innerHTML = '<div class=\"status error\">❌ Camera API not supported in this browser</div>';
}
</script>";

echo "</div>";

// CineShelf App Link
echo "<div class='test-area'>";
echo "<h2>🎬 Test CineShelf App</h2>";
echo "<p>If all tests above pass, your iPhone should work with the CineShelf camera features.</p>";
echo "<a href='../index.html' style='background:#34C759;color:white;text-decoration:none;padding:15px 25px;border-radius:8px;font-weight:500;display:inline-block;'>🎬 Open CineShelf App</a>";
echo "</div>";

// Troubleshooting
echo "<div class='test-area'>";
echo "<h2>🔧 Troubleshooting Steps</h2>";
echo "<ol>";
echo "<li><strong>If HTTPS test fails:</strong> Enable HTTPS on your web server</li>";
echo "<li><strong>If camera test fails:</strong> Check Safari settings → Camera → Allow</li>";
echo "<li><strong>If you see black screen:</strong> Close other camera apps and refresh page</li>";
echo "<li><strong>If permission denied:</strong> Go to Settings → Privacy → Camera → Safari → Enable</li>";
echo "<li><strong>If still issues:</strong> Try restarting Safari completely</li>";
echo "</ol>";
echo "</div>";

echo "<p style='text-align:center;margin-top:30px;'><a href='../'>← Back to CineShelf</a> | <a href='debug-files.php'>Debug Files</a></p>";

echo "</body></html>";
?>